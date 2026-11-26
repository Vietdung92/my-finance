/* My Finance: máy chủ API + trang web.
 * Quyền: 'nhap' (Tú) thêm, sửa, ghi nhận mọi thứ và xem hết; 'xem' (anh Dũng) chỉ xem khoản của mình
 * và các khoản mượn qua lại có mình, không sửa được gì. */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool, types } = require('pg');
// Cột DATE trả về chuỗi 'YYYY-MM-DD' để không lệch ngày do múi giờ
types.setTypeParser(1082, (v) => v);
const { migrate } = require('./db/migrate');
const thongBao = require('./thong-bao');

const COOKIE = 'mf_phien';
const NHOM = ['no', 'chovay', 'dautu'];
const CACH = ['goc_deu', 'nien_kim', 'lai_thang', 'khong_lai', 'tiet_kiem', 'tai_san'];
const CHU_KY_TEN = { 1: 'tháng', 3: 'quý', 6: '6 tháng', 12: 'năm' };
const CACH_TEN = { goc_deu: 'gốc đều', nien_kim: 'trả đều', lai_thang: 'chỉ trả lãi, gốc cuối kỳ', khong_lai: 'không lãi', tiet_kiem: 'tiết kiệm', chia_quy: 'chia lợi nhuận quý', tai_san: 'tài sản' };

class Loi extends Error { constructor(ma, tin) { super(tin); this.ma = ma; } }
const sai = (tin) => new Loi(400, tin);

/* ---------- kiểm tra dữ liệu gửi lên ---------- */
const laNgay = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T00:00:00'));
const chu = (v, ten, toiDa = 200, batBuoc = true) => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (batBuoc && !s) throw sai(`Thiếu ${ten}.`);
  if (s.length > toiDa) throw sai(`${ten} dài quá ${toiDa} ký tự.`);
  return s;
};
const tien = (v, ten) => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n <= 0 || n > 1e15) throw sai(`${ten} phải là số tiền lớn hơn 0.`);
  return n;
};
const so = (v, ten, min, max) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw sai(`${ten} phải từ ${min} đến ${max}.`);
  return n;
};
const ngay = (v, ten) => { if (!laNgay(v)) throw sai(`${ten} không đúng dạng ngày.`); return v; };
const fmt = (n) => Math.round(Number(n)).toLocaleString('vi-VN') + ' đ';
const ddmm = (s) => String(s).slice(0, 10).split('-').reverse().join('/');

function docKhoan(b, nguoiIds) {
  const nhom = b.nhom; if (!NHOM.includes(nhom)) throw sai('Loại khoản không hợp lệ.');
  const cach = b.cach; if (!CACH.includes(cach)) throw sai('Cách trả không hợp lệ.');
  const chuId = Number(b.chu_id); if (!nguoiIds.includes(chuId)) throw sai('Chọn khoản này của ai.');
  const kh = {
    chu_id: chuId, nhom, cach,
    ten: chu(b.ten, 'tên khoản'), doi_tac: chu(b.doi_tac, 'ngân hàng / người'),
    goc: tien(b.goc, 'Số tiền gốc'), bat_dau: ngay(b.bat_dau, 'Ngày bắt đầu'),
    ky_han: cach === 'tai_san' ? 0 : Math.round(so(b.ky_han, 'Kỳ hạn (tháng)', 1, 600)),
    lai: ['tai_san', 'khong_lai'].includes(cach) ? 0 : so(b.lai, 'Lãi suất %/năm', 0, 200),
    don_vi_lai: b.don_vi_lai === 'thang' ? 'thang' : 'nam',
    chu_ky: ['goc_deu', 'nien_kim', 'lai_thang'].includes(cach) && [1, 3, 6, 12].includes(Number(b.chu_ky)) ? Number(b.chu_ky) : 1,
    ngay_chot: b.ngay_chot == null || b.ngay_chot === '' ? null : Math.round(so(b.ngay_chot, 'Ngày chốt lãi', 1, 31)),
    tu_dong_da_tra: !!b.tu_dong_da_tra,
    gia_tri: cach === 'tai_san' ? tien(b.gia_tri ?? b.goc, 'Giá ước tính') : null,
    ghi_chu: chu(b.ghi_chu, 'ghi chú', 1000, false),
  };
  const dl = Array.isArray(b.doi_lai) ? b.doi_lai : [];
  if (dl.length > 100) throw sai('Quá nhiều lần đổi lãi.');
  kh.doi_lai = dl.map((x) => ({ tu: ngay(x.tu, 'Ngày đổi lãi'), lai: so(x.lai, 'Lãi suất mới %/năm', 0, 200) }))
    .sort((a, c) => (a.tu < c.tu ? -1 : 1));
  return kh;
}

function createApp(pool, opt = {}) {
  const SECRET = opt.jwtSecret || process.env.JWT_SECRET;
  if (!SECRET || SECRET.length < 32) throw new Error('JWT_SECRET phải có ít nhất 32 ký tự (đặt trong .env).');
  const secure = opt.secureCookie ?? process.env.NODE_ENV === 'production';
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'], fontSrc: ["'self'", 'https://fonts.gstatic.com'], imgSrc: ["'self'", 'data:'], connectSrc: ["'self'"] } },
  }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  const q = (sql, p) => pool.query(sql, p);
  const ghiNhatKy = (nguoiId, viec, lienQuan) =>
    q('INSERT INTO nhat_ky (nguoi_id, viec, lien_quan) VALUES ($1,$2,$3)', [nguoiId, viec, [...new Set(lienQuan)]]);

  /* ---------- đăng nhập ---------- */
  const thu = new Map(); // chặn đoán mật khẩu: 8 lần sai / 15 phút cho mỗi IP + tên
  app.post('/api/dang-nhap', async (req, res, next) => {
    try {
      const ten = String(req.body.ten_dang_nhap || '').trim().toLowerCase();
      const key = req.ip + '|' + ten, now = Date.now();
      const t = (thu.get(key) || []).filter((x) => now - x < 15 * 60e3);
      if (t.length >= 8) return res.status(429).json({ loi: 'Sai mật khẩu quá nhiều lần. Thử lại sau 15 phút.' });
      const u = (await q('SELECT * FROM nguoi_dung WHERE ten_dang_nhap=$1', [ten])).rows[0];
      const ok = u && await bcrypt.compare(String(req.body.mat_khau || ''), u.mat_khau_hash);
      if (!ok) { t.push(now); thu.set(key, t); return res.status(401).json({ loi: 'Sai tên đăng nhập hoặc mật khẩu.' }); }
      thu.delete(key);
      const token = jwt.sign({ id: u.id, p: u.phien }, SECRET, { expiresIn: '30d' });
      res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'strict', secure, maxAge: 30 * 864e5, path: '/' });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });
  app.post('/api/dang-xuat', (req, res) => { res.clearCookie(COOKIE, { path: '/' }); res.json({ ok: true }); });

  const canDangNhap = async (req, res, next) => {
    try {
      const p = jwt.verify(req.cookies[COOKIE] || '', SECRET);
      const u = (await q('SELECT id, ten_dang_nhap, ten_hien_thi, quyen, mau, phien FROM nguoi_dung WHERE id=$1', [p.id])).rows[0];
      if (!u || u.phien !== p.p) throw new Error('phiên cũ');
      req.u = u; next();
    } catch { res.status(401).json({ loi: 'Cần đăng nhập.' }); }
  };
  const canNhap = (req, res, next) =>
    req.u.quyen === 'nhap' ? next() : res.status(403).json({ loi: 'Tài khoản này chỉ được xem, không sửa được.' });
  // Chống gửi lệnh từ trang khác: mọi lệnh ghi phải là JSON
  // (lệnh không có nội dung, như xóa, thì cho qua: cookie SameSite=strict đã chặn trang khác gửi kèm phiên)
  const coNoiDung = (req) => Number(req.headers['content-length'] || 0) > 0 || !!req.headers['transfer-encoding'];
  const chiJson = (req, res, next) => (!coNoiDung(req) || req.is('application/json') ? next() : res.status(415).json({ loi: 'Sai định dạng.' }));

  app.use('/api', (req, res, next) => (req.path === '/dang-nhap' ? next() : canDangNhap(req, res, next)));
  app.use('/api', (req, res, next) => (req.method === 'GET' ? next() : chiJson(req, res, next)));

  app.post('/api/doi-mat-khau', async (req, res, next) => {
    try {
      const { cu, moi } = req.body;
      if (typeof moi !== 'string' || moi.length < 8) throw sai('Mật khẩu mới cần ít nhất 8 ký tự.');
      const u = (await q('SELECT mat_khau_hash FROM nguoi_dung WHERE id=$1', [req.u.id])).rows[0];
      if (!(await bcrypt.compare(String(cu || ''), u.mat_khau_hash))) throw sai('Mật khẩu hiện tại không đúng.');
      const r = await q('UPDATE nguoi_dung SET mat_khau_hash=$1, phien=phien+1 WHERE id=$2 RETURNING phien', [await bcrypt.hash(moi, 12), req.u.id]);
      res.cookie(COOKIE, jwt.sign({ id: req.u.id, p: r.rows[0].phien }, SECRET, { expiresIn: '30d' }), { httpOnly: true, sameSite: 'strict', secure, maxAge: 30 * 864e5, path: '/' });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  /* ---------- đọc toàn bộ dữ liệu được phép xem ---------- */
  app.get('/api/du-lieu', async (req, res, next) => {
    try {
      const u = req.u, tatCa = u.quyen === 'nhap';
      const nguoi = (await q('SELECT id, ten_hien_thi AS ten, quyen, mau FROM nguoi_dung ORDER BY id')).rows;
      const khoan = (await q(`SELECT * FROM khoan WHERE NOT da_xoa ${tatCa ? '' : 'AND chu_id=$1'} ORDER BY id`, tatCa ? [] : [u.id])).rows;
      const ids = khoan.map((k) => k.id);
      const thanhToan = ids.length ? (await q('SELECT id, khoan_id, ky_ngay::text, trang_thai, ghi_chu FROM thanh_toan WHERE khoan_id = ANY($1)', [ids])).rows : [];
      const noiBo = (await q(`SELECT id, cho_vay_id, vay_id, goc, ngay::text, lai_thang, cach_tinh, ghi_chu FROM noi_bo WHERE NOT da_xoa ${tatCa ? '' : 'AND (cho_vay_id=$1 OR vay_id=$1)'} ORDER BY id`, tatCa ? [] : [u.id])).rows;
      const nbIds = noiBo.map((k) => k.id);
      const chuyenTra = nbIds.length ? (await q('SELECT id, noi_bo_id, ngay::text, so_tien, loai, ghi_chu FROM chuyen_tra WHERE NOT da_xoa AND noi_bo_id = ANY($1) ORDER BY ngay, id', [nbIds])).rows : [];
      const nhatKy = (await q(`SELECT n.luc, n.viec, d.ten_hien_thi AS nguoi FROM nhat_ky n LEFT JOIN nguoi_dung d ON d.id=n.nguoi_id ${tatCa ? '' : 'WHERE $1 = ANY(n.lien_quan)'} ORDER BY n.luc DESC LIMIT 200`, tatCa ? [] : [u.id])).rows;
      const khoanOut = khoan.map((k) => ({ ...k, bat_dau: k.bat_dau && toIso(k.bat_dau), goc: Number(k.goc), lai: Number(k.lai), gia_tri: k.gia_tri == null ? null : Number(k.gia_tri) }));
      res.json({
        toi: { id: u.id, ten: u.ten_hien_thi, quyen: u.quyen, ten_dang_nhap: u.ten_dang_nhap },
        nguoi, khoan: khoanOut, thanh_toan: thanhToan,
        noi_bo: noiBo.map((k) => ({ ...k, goc: Number(k.goc), lai_thang: Number(k.lai_thang) })),
        chuyen_tra: chuyenTra.map((t) => ({ ...t, so_tien: Number(t.so_tien) })),
        nhat_ky: nhatKy,
        doi_tac: (await q(`SELECT id, ten, loai, dien_thoai, ghi_chu FROM doi_tac WHERE NOT da_xoa ${tatCa ? '' : 'AND lower(ten) = ANY($1)'} ORDER BY lower(ten)`, tatCa ? [] : [khoan.map((k) => k.doi_tac.toLowerCase())])).rows,
      });
    } catch (e) { next(e); }
  });

  /* ---------- ghi: chỉ tài khoản nhập liệu ---------- */
  const nguoiIds = async () => (await q('SELECT id FROM nguoi_dung')).rows.map((r) => r.id);
  const layKhoan = async (id) => {
    const k = (await q('SELECT * FROM khoan WHERE id=$1 AND NOT da_xoa', [Number(id)])).rows[0];
    if (!k) throw new Loi(404, 'Không tìm thấy khoản này.');
    return k;
  };
  const themDanhBa = (ten) => q('INSERT INTO doi_tac (ten) VALUES ($1) ON CONFLICT DO NOTHING', [ten]);
  const COT = ['chu_id', 'nhom', 'ten', 'doi_tac', 'goc', 'bat_dau', 'ky_han', 'chu_ky', 'cach', 'lai', 'don_vi_lai', 'doi_lai', 'ngay_chot', 'tu_dong_da_tra', 'gia_tri', 'ghi_chu'];
  const val = (kh) => COT.map((c) => (c === 'doi_lai' ? JSON.stringify(kh[c]) : kh[c]));

  app.post('/api/khoan', canNhap, async (req, res, next) => {
    try {
      const kh = docKhoan(req.body, await nguoiIds());
      await themDanhBa(kh.doi_tac);
      const r = await q(`INSERT INTO khoan (${COT.join(',')}) VALUES (${COT.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING id`, val(kh));
      await ghiNhatKy(req.u.id, `Thêm khoản: ${kh.ten} · ${kh.doi_tac} ${fmt(kh.goc)} (${CACH_TEN[kh.cach]})`, [req.u.id, kh.chu_id]);
      res.json({ id: r.rows[0].id });
    } catch (e) { next(e); }
  });

  app.put('/api/khoan/:id', canNhap, async (req, res, next) => {
    try {
      const cu = await layKhoan(req.params.id);
      const kh = docKhoan(req.body, await nguoiIds());
      await themDanhBa(kh.doi_tac);
      await q(`UPDATE khoan SET ${COT.map((c, i) => `${c}=$${i + 1}`).join(',')}, sua_luc=now() WHERE id=$${COT.length + 1}`, [...val(kh), cu.id]);
      const doi = [];
      const so2 = (a, b) => Number(a) !== Number(b);
      if (cu.ten !== kh.ten || cu.doi_tac !== kh.doi_tac) doi.push(`tên: ${cu.ten} · ${cu.doi_tac} → ${kh.ten} · ${kh.doi_tac}`);
      if (so2(cu.goc, kh.goc)) doi.push(`gốc ${fmt(cu.goc)} → ${fmt(kh.goc)}`);
      if (so2(cu.lai, kh.lai)) doi.push(`lãi ${Number(cu.lai)}% → ${kh.lai}%/năm`);
      if (toIso(cu.bat_dau) !== kh.bat_dau) doi.push(`ngày bắt đầu ${ddmm(toIso(cu.bat_dau))} → ${ddmm(kh.bat_dau)}`);
      if (so2(cu.ky_han, kh.ky_han)) doi.push(`kỳ hạn ${cu.ky_han} → ${kh.ky_han} tháng`);
      if ((cu.ngay_chot || null) !== kh.ngay_chot) doi.push(`ngày chốt lãi ${cu.ngay_chot || '—'} → ${kh.ngay_chot || '—'}`);
      if ((cu.chu_ky || 1) !== kh.chu_ky) doi.push(`trả mỗi ${CHU_KY_TEN[cu.chu_ky || 1]} → ${CHU_KY_TEN[kh.chu_ky]}`);
      if (cu.cach !== kh.cach) doi.push(`cách trả ${CACH_TEN[cu.cach]} → ${CACH_TEN[kh.cach]}`);
      if (JSON.stringify(cu.doi_lai) !== JSON.stringify(kh.doi_lai)) doi.push('lịch đổi lãi suất');
      if (so2(cu.gia_tri || 0, kh.gia_tri || 0)) doi.push(`giá ước tính ${fmt(cu.gia_tri || 0)} → ${fmt(kh.gia_tri || 0)}`);
      if (cu.chu_id !== kh.chu_id) doi.push('chủ khoản');
      await ghiNhatKy(req.u.id, `Sửa khoản ${kh.ten} · ${kh.doi_tac}: ${doi.join('; ') || 'ghi chú / tùy chọn khác'}`, [req.u.id, cu.chu_id, kh.chu_id]);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  app.delete('/api/khoan/:id', canNhap, async (req, res, next) => {
    try {
      const k = await layKhoan(req.params.id);
      await q('UPDATE khoan SET da_xoa=true, sua_luc=now() WHERE id=$1', [k.id]);
      await ghiNhatKy(req.u.id, `Xóa khoản: ${k.ten} · ${k.doi_tac} ${fmt(k.goc)}`, [req.u.id, k.chu_id]);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // Ghi nhận một kỳ: da_tra / chua_tra; bo = xóa ghi nhận, về mặc định
  app.post('/api/khoan/:id/ky', canNhap, async (req, res, next) => {
    try {
      const k = await layKhoan(req.params.id);
      const kyNgay = ngay(req.body.ky_ngay, 'Ngày kỳ');
      const tt = req.body.trang_thai;
      if (!['da_tra', 'chua_tra', 'bo'].includes(tt)) throw sai('Trạng thái không hợp lệ.');
      if (tt === 'bo') await q('DELETE FROM thanh_toan WHERE khoan_id=$1 AND ky_ngay=$2', [k.id, kyNgay]);
      else await q(`INSERT INTO thanh_toan (khoan_id, ky_ngay, trang_thai, ghi_chu, tao_boi) VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (khoan_id, ky_ngay) DO UPDATE SET trang_thai=EXCLUDED.trang_thai, ghi_chu=EXCLUDED.ghi_chu, tao_boi=EXCLUDED.tao_boi, tao_luc=now()`,
        [k.id, kyNgay, tt, chu(req.body.ghi_chu, 'ghi chú', 500, false), req.u.id]);
      const dong = k.nhom === 'no' ? 'trả' : 'thu';
      const viec = tt === 'da_tra' ? `Ghi nhận đã ${dong}` : tt === 'chua_tra' ? `Ghi nhận chưa ${dong}` : 'Bỏ ghi nhận';
      await ghiNhatKy(req.u.id, `${viec} kỳ ${ddmm(kyNgay)} · ${k.ten} · ${k.doi_tac}`, [req.u.id, k.chu_id]);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  /* ---------- mượn qua lại giữa 2 tài khoản ---------- */
  const docNoiBo = (b, ids) => {
    const cv = Number(b.cho_vay_id), v = Number(b.vay_id);
    if (!ids.includes(cv) || !ids.includes(v) || cv === v) throw sai('Chọn đúng người cho mượn và người mượn.');
    return {
      cho_vay_id: cv, vay_id: v, goc: tien(b.goc, 'Số tiền mượn'), ngay: ngay(b.ngay, 'Ngày mượn'),
      lai_thang: so(b.lai_thang ?? 0, 'Lãi %/tháng', 0, 20),
      cach_tinh: b.cach_tinh === 'co_dinh' ? 'co_dinh' : 'du_no_ngay',
      ghi_chu: chu(b.ghi_chu, 'ghi chú', 500, false),
    };
  };
  const layNoiBo = async (id) => {
    const k = (await q('SELECT * FROM noi_bo WHERE id=$1 AND NOT da_xoa', [Number(id)])).rows[0];
    if (!k) throw new Loi(404, 'Không tìm thấy khoản mượn này.');
    return k;
  };
  const tenNguoi = async (id) => (await q('SELECT ten_hien_thi FROM nguoi_dung WHERE id=$1', [id])).rows[0]?.ten_hien_thi || '?';

  app.post('/api/noi-bo', canNhap, async (req, res, next) => {
    try {
      const k = docNoiBo(req.body, await nguoiIds());
      const r = await q('INSERT INTO noi_bo (cho_vay_id, vay_id, goc, ngay, lai_thang, cach_tinh, ghi_chu) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
        [k.cho_vay_id, k.vay_id, k.goc, k.ngay, k.lai_thang, k.cach_tinh, k.ghi_chu]);
      await ghiNhatKy(req.u.id, `Thêm khoản mượn: ${await tenNguoi(k.vay_id)} mượn ${await tenNguoi(k.cho_vay_id)} ${fmt(k.goc)} ngày ${ddmm(k.ngay)}`, [req.u.id, k.cho_vay_id, k.vay_id]);
      res.json({ id: r.rows[0].id });
    } catch (e) { next(e); }
  });

  app.put('/api/noi-bo/:id', canNhap, async (req, res, next) => {
    try {
      const cu = await layNoiBo(req.params.id);
      const k = docNoiBo(req.body, await nguoiIds());
      await q('UPDATE noi_bo SET cho_vay_id=$1, vay_id=$2, goc=$3, ngay=$4, lai_thang=$5, cach_tinh=$6, ghi_chu=$7 WHERE id=$8',
        [k.cho_vay_id, k.vay_id, k.goc, k.ngay, k.lai_thang, k.cach_tinh, k.ghi_chu, cu.id]);
      await ghiNhatKy(req.u.id, `Sửa khoản mượn ${await tenNguoi(k.vay_id)} ← ${await tenNguoi(k.cho_vay_id)}: gốc ${fmt(cu.goc)} → ${fmt(k.goc)}, lãi ${Number(cu.lai_thang)}% → ${k.lai_thang}%/tháng`, [req.u.id, cu.cho_vay_id, cu.vay_id, k.cho_vay_id, k.vay_id]);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  app.delete('/api/noi-bo/:id', canNhap, async (req, res, next) => {
    try {
      const k = await layNoiBo(req.params.id);
      await q('UPDATE noi_bo SET da_xoa=true WHERE id=$1', [k.id]);
      await ghiNhatKy(req.u.id, `Xóa khoản mượn ${fmt(k.goc)} (${await tenNguoi(k.vay_id)} mượn ${await tenNguoi(k.cho_vay_id)})`, [req.u.id, k.cho_vay_id, k.vay_id]);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  app.post('/api/noi-bo/:id/chuyen-tra', canNhap, async (req, res, next) => {
    try {
      const k = await layNoiBo(req.params.id);
      const loai = req.body.loai;
      if (!['goc', 'lai'].includes(loai)) throw sai('Chọn trả gốc hay trả lãi.');
      const soTien = tien(req.body.so_tien, 'Số tiền');
      const ngayTra = ngay(req.body.ngay, 'Ngày chuyển');
      if (loai === 'goc') {
        const daTra = Number((await q("SELECT COALESCE(SUM(so_tien),0) s FROM chuyen_tra WHERE noi_bo_id=$1 AND loai='goc' AND NOT da_xoa", [k.id])).rows[0].s);
        if (soTien > Number(k.goc) - daTra) throw sai(`Trả gốc vượt số gốc còn nợ (${fmt(Number(k.goc) - daTra)}). Phần dư hãy ghi là trả lãi.`);
      }
      await q('INSERT INTO chuyen_tra (noi_bo_id, ngay, so_tien, loai, ghi_chu, tao_boi) VALUES ($1,$2,$3,$4,$5,$6)',
        [k.id, ngayTra, soTien, loai, chu(req.body.ghi_chu, 'ghi chú', 500, false), req.u.id]);
      await ghiNhatKy(req.u.id, `${await tenNguoi(k.vay_id)} chuyển ${loai === 'goc' ? 'trả gốc' : 'trả lãi'} ${fmt(soTien)} cho ${await tenNguoi(k.cho_vay_id)} ngày ${ddmm(ngayTra)}`, [req.u.id, k.cho_vay_id, k.vay_id]);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  app.delete('/api/chuyen-tra/:id', canNhap, async (req, res, next) => {
    try {
      const t = (await q('SELECT c.*, n.cho_vay_id, n.vay_id FROM chuyen_tra c JOIN noi_bo n ON n.id=c.noi_bo_id WHERE c.id=$1 AND NOT c.da_xoa', [Number(req.params.id)])).rows[0];
      if (!t) throw new Loi(404, 'Không tìm thấy lần chuyển này.');
      await q('UPDATE chuyen_tra SET da_xoa=true WHERE id=$1', [t.id]);
      await ghiNhatKy(req.u.id, `Xóa lần chuyển ${t.loai === 'goc' ? 'trả gốc' : 'trả lãi'} ${fmt(t.so_tien)} ngày ${ddmm(toIso(t.ngay))}`, [req.u.id, t.cho_vay_id, t.vay_id]);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  /* ---------- danh bạ người / ngân hàng ---------- */
  const LOAI_DT = ['nguoi', 'ngan_hang', 'khac'];
  const docDoiTac = (b) => ({
    ten: chu(b.ten, 'tên'), loai: LOAI_DT.includes(b.loai) ? b.loai : 'nguoi',
    dien_thoai: chu(b.dien_thoai, 'số điện thoại', 30, false), ghi_chu: chu(b.ghi_chu, 'ghi chú', 500, false),
  });
  const trungTen = (e) => { if (e.code === '23505') throw sai('Tên này đã có trong danh bạ.'); throw e; };
  app.post('/api/doi-tac', canNhap, async (req, res, next) => {
    try {
      const d = docDoiTac(req.body);
      const r = await q('INSERT INTO doi_tac (ten, loai, dien_thoai, ghi_chu) VALUES ($1,$2,$3,$4) RETURNING id', [d.ten, d.loai, d.dien_thoai, d.ghi_chu]).catch(trungTen);
      await ghiNhatKy(req.u.id, `Thêm vào danh bạ: ${d.ten}`, [req.u.id]);
      res.json({ id: r.rows[0].id });
    } catch (e) { next(e); }
  });
  // Đổi tên thì đổi luôn tên trên các khoản đang dùng tên cũ
  app.put('/api/doi-tac/:id', canNhap, async (req, res, next) => {
    const c = await pool.connect();
    try {
      const cu = (await c.query('SELECT * FROM doi_tac WHERE id=$1 AND NOT da_xoa', [Number(req.params.id)])).rows[0];
      if (!cu) throw new Loi(404, 'Không tìm thấy tên này trong danh bạ.');
      const d = docDoiTac(req.body);
      await c.query('BEGIN');
      await c.query('UPDATE doi_tac SET ten=$1, loai=$2, dien_thoai=$3, ghi_chu=$4 WHERE id=$5', [d.ten, d.loai, d.dien_thoai, d.ghi_chu, cu.id]).catch(trungTen);
      const doi = cu.ten !== d.ten ? await c.query('UPDATE khoan SET doi_tac=$1, sua_luc=now() WHERE lower(doi_tac)=lower($2) AND NOT da_xoa RETURNING chu_id', [d.ten, cu.ten]) : { rows: [] };
      await c.query('COMMIT');
      await ghiNhatKy(req.u.id, cu.ten !== d.ten ? `Đổi tên trong danh bạ: ${cu.ten} → ${d.ten} (${doi.rows.length} khoản)` : `Sửa thông tin danh bạ: ${d.ten}`, [req.u.id, ...doi.rows.map((r) => r.chu_id)]);
      res.json({ ok: true, so_khoan: doi.rows.length });
    } catch (e) { await c.query('ROLLBACK').catch(() => {}); next(e); } finally { c.release(); }
  });
  // Bỏ khỏi danh bạ không đụng tới các khoản đã nhập
  app.delete('/api/doi-tac/:id', canNhap, async (req, res, next) => {
    try {
      const r = await q('UPDATE doi_tac SET da_xoa=true WHERE id=$1 AND NOT da_xoa RETURNING ten', [Number(req.params.id)]);
      if (!r.rows[0]) throw new Loi(404, 'Không tìm thấy tên này trong danh bạ.');
      await ghiNhatKy(req.u.id, `Bỏ khỏi danh bạ: ${r.rows[0].ten}`, [req.u.id]);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  thongBao.caiDat(app, pool, opt);

  app.use('/api', (req, res) => res.status(404).json({ loi: 'Không có địa chỉ này.' }));

  /* ---------- trang web ---------- */
  // no-cache: trình duyệt vẫn giữ bản cũ nhưng hỏi lại máy chủ mỗi lần (ETag), cập nhật xong là thấy ngay
  app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html', setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') }));
  app.get('/suc-khoe', async (req, res) => { try { await q('SELECT 1'); res.send('ok'); } catch { res.status(500).send('db'); } });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof Loi) return res.status(err.ma).json({ loi: err.message });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ loi: 'Dữ liệu gửi lên bị lỗi.' });
    console.error(err);
    res.status(500).json({ loi: 'Máy chủ gặp lỗi, thử lại sau.' });
  });
  return app;
}

function toIso(d) {
  if (typeof d === 'string') return d.slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

module.exports = { createApp };

if (require.main === module) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  migrate(pool)
    .then(() => {
      const port = Number(process.env.PORT || 3060);
      createApp(pool).listen(port, '127.0.0.1', () => console.log(`My Finance chạy ở cổng ${port}`));
      thongBao.batLich(pool);
    })
    .catch((e) => { console.error(e); process.exit(1); });
}
