/* Thông báo đẩy (Web Push) cho My Finance.
 *  - Khóa VAPID tự tạo lần đầu, lưu trong bảng cau_hinh (không phải sửa .env trên máy chủ).
 *  - Mỗi sáng từ 7 giờ (giờ Việt Nam) gửi một thông báo cho mỗi người: kỳ quá hạn, kỳ đến hạn trong 3 ngày tới,
 *    lãi suất đổi trong 7 ngày tới. Tú (nhập liệu) nhận cho cả 2 ví vì Tú là người ghi nhận đã trả; anh Dũng nhận ví mình.
 *  - iPhone/iPad chỉ nhận được khi đã "Thêm vào MH chính" và mở app từ đó (iOS 16.4 trở lên). */
const webpush = require('web-push');
const T = require('./public/tinh.js');

const GIO_BAO = 7;          // giờ gửi mỗi sáng
const NGAY_SAP_HAN = 3;     // báo trước bao nhiêu ngày
const NGAY_DOI_LAI = 7;

const ngayVN = (d = new Date()) => {
  const s = d.toLocaleString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }); // 'YYYY-MM-DD HH:MM:SS'
  return { ngay: s.slice(0, 10), gio: Number(s.slice(11, 13)) };
};
const tien = (v) => {
  const a = Math.abs(v);
  if (a >= 1e9) return (a / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + ' tỷ';
  if (a >= 1e6) return (a / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + ' tr';
  return Math.round(a).toLocaleString('vi-VN') + ' đ';
};
const ddmm = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
const toIso = (d) => (typeof d === 'string' ? d.slice(0, 10) : T.iso(d));

async function khoaVapid(pool) {
  const r = (await pool.query("SELECT gia_tri FROM cau_hinh WHERE khoa='vapid'")).rows[0];
  if (r) return r.gia_tri;
  const k = webpush.generateVAPIDKeys();
  await pool.query("INSERT INTO cau_hinh (khoa, gia_tri) VALUES ('vapid', $1) ON CONFLICT (khoa) DO NOTHING", [JSON.stringify(k)]);
  return (await pool.query("SELECT gia_tri FROM cau_hinh WHERE khoa='vapid'")).rows[0].gia_tri;
}

/* Các dòng cần báo cho một người vào ngày homNay ('YYYY-MM-DD'). */
async function tinCho(pool, u, homNay) {
  const tatCa = u.quyen === 'nhap';
  const nguoi = Object.fromEntries((await pool.query('SELECT id, ten_hien_thi FROM nguoi_dung')).rows.map((x) => [x.id, x.ten_hien_thi]));
  const khoan = (await pool.query(`SELECT * FROM khoan WHERE NOT da_xoa AND cach <> 'tai_san' ${tatCa ? '' : 'AND chu_id=$1'} ORDER BY id`, tatCa ? [] : [u.id])).rows;
  if (!khoan.length) return [];
  const tt = (await pool.query('SELECT khoan_id, ky_ngay::text, trang_thai FROM thanh_toan WHERE khoan_id = ANY($1)', [khoan.map((k) => k.id)])).rows;
  const hom = T.pd(homNay), quaHan = [], sapHan = [], doiLai = [];
  for (const r of khoan) {
    const k = { ...r, bat_dau: toIso(r.bat_dau), goc: Number(r.goc), lai: Number(r.lai) };
    const s = T.tomTat(k, tt.filter((x) => x.khoan_id === k.id), hom);
    const vi = tatCa ? `[${nguoi[k.chu_id]}] ` : '';
    const dong = k.nhom === 'no' ? 'trả' : 'thu';
    s.quaHan.forEach((e) => quaHan.push({ ngay: e.ngay, t: `${vi}Quá hạn ${T.soNgay(e.ngay, hom)} ngày: ${dong} ${k.doi_tac} ${tien(e.goc + e.lai)}` }));
    s.lich.filter((e) => e.tt === 'chua' && T.soNgay(hom, e.ngay) <= NGAY_SAP_HAN).forEach((e) => {
      const con = T.soNgay(hom, e.ngay);
      sapHan.push({ ngay: e.ngay, t: `${vi}${con === 0 ? 'Hôm nay' : con === 1 ? 'Ngày mai' : ddmm(e.ngay)}: ${dong} ${k.doi_tac} ${tien(e.goc + e.lai)}` });
    });
    (k.doi_lai || []).forEach((x) => {
      const con = T.soNgay(hom, x.tu);
      if (con >= 0 && con <= NGAY_DOI_LAI) doiLai.push({ ngay: T.pd(x.tu), t: `${vi}${k.doi_tac}: lãi đổi sang ${x.lai}%/năm từ ${ddmm(T.pd(x.tu))}` });
    });
  }
  const xep = (a) => a.sort((x, y) => x.ngay - y.ngay).map((x) => x.t);
  return [...xep(quaHan), ...xep(sapHan), ...xep(doiLai)];
}

function noiDung(dong) {
  const qh = dong.filter((t) => /Quá hạn/.test(t)).length;
  const tieuDe = qh ? `My Finance: ${qh} kỳ quá hạn` : 'My Finance: sắp đến hạn';
  const than = dong.slice(0, 4).join('\n') + (dong.length > 4 ? `\n… và ${dong.length - 4} việc khác` : '');
  return { title: tieuDe, body: than, url: '/' };
}

/* Gửi tới mọi máy người đó đã bật; máy đã gỡ (404/410) thì xóa đăng ký. */
async function guiCho(pool, nguoiId, tin, guiDay) {
  const subs = (await pool.query('SELECT id, endpoint, p256dh, auth FROM dang_ky_thong_bao WHERE nguoi_id=$1', [nguoiId])).rows;
  let ok = 0;
  for (const s of subs) {
    try {
      await guiDay({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(tin));
      ok++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) await pool.query('DELETE FROM dang_ky_thong_bao WHERE id=$1', [s.id]);
      else console.error('Gửi thông báo lỗi:', e.statusCode || '', e.message);
    }
  }
  return ok;
}

async function taoGuiDay(pool, opt) {
  if (opt.guiDay) return opt.guiDay; // bài kiểm tra truyền hàm giả
  const k = await khoaVapid(pool);
  webpush.setVapidDetails(process.env.APP_URL || 'https://taichinh.hcarevietnam.vn', k.publicKey, k.privateKey);
  return (sub, data) => webpush.sendNotification(sub, data, { TTL: 12 * 3600 });
}

/* Gắn các địa chỉ /api/thong-bao (cả 2 quyền đều dùng được: ai cũng bật thông báo cho máy mình). */
function caiDat(app, pool, opt = {}) {
  let guiDay = null;
  const layGui = async () => (guiDay ||= await taoGuiDay(pool, opt));
  const endpointHopLe = (s) => typeof s === 'string' && /^https:\/\/[^\s]{10,1000}$/.test(s);

  app.get('/api/thong-bao', async (req, res, next) => {
    try {
      const k = await khoaVapid(pool);
      const n = (await pool.query('SELECT count(*)::int AS n FROM dang_ky_thong_bao WHERE nguoi_id=$1', [req.u.id])).rows[0].n;
      res.json({ khoa: k.publicKey, so_may: n, gio: GIO_BAO });
    } catch (e) { next(e); }
  });
  app.post('/api/thong-bao/dang-ky', async (req, res, next) => {
    try {
      const b = req.body || {}, keys = b.keys || {};
      if (!endpointHopLe(b.endpoint) || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string' || keys.p256dh.length > 200 || keys.auth.length > 100) {
        return res.status(400).json({ loi: 'Đăng ký thông báo không hợp lệ.' });
      }
      await pool.query(`INSERT INTO dang_ky_thong_bao (nguoi_id, endpoint, p256dh, auth) VALUES ($1,$2,$3,$4)
        ON CONFLICT (endpoint) DO UPDATE SET nguoi_id=EXCLUDED.nguoi_id, p256dh=EXCLUDED.p256dh, auth=EXCLUDED.auth`, [req.u.id, b.endpoint, keys.p256dh, keys.auth]);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });
  app.post('/api/thong-bao/huy', async (req, res, next) => {
    try {
      await pool.query('DELETE FROM dang_ky_thong_bao WHERE endpoint=$1 AND nguoi_id=$2', [String(req.body?.endpoint || ''), req.u.id]);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });
  app.post('/api/thong-bao/thu', async (req, res, next) => {
    try {
      const dong = await tinCho(pool, req.u, ngayVN().ngay);
      const tin = dong.length ? noiDung(dong) : { title: 'My Finance', body: `Thông báo đã bật. Mỗi sáng ${GIO_BAO} giờ app báo kỳ sắp đến hạn và quá hạn. Hôm nay không có gì cần chú ý.`, url: '/' };
      const n = await guiCho(pool, req.u.id, tin, await layGui());
      res.json({ gui: n });
    } catch (e) { next(e); }
  });
  return { layGui };
}

/* Mỗi 5 phút xem đã tới giờ báo chưa; ghi ngày đã báo vào cau_hinh để khởi động lại không báo trùng. */
function batLich(pool, opt = {}) {
  const chay = async () => {
    const { ngay, gio } = ngayVN();
    if (gio < GIO_BAO) return;
    const r = await pool.query(`INSERT INTO cau_hinh (khoa, gia_tri) VALUES ('bao_ngay', $1)
      ON CONFLICT (khoa) DO UPDATE SET gia_tri=EXCLUDED.gia_tri WHERE cau_hinh.gia_tri <> EXCLUDED.gia_tri RETURNING khoa`, [JSON.stringify(ngay)]);
    if (!r.rows.length) return; // hôm nay đã báo
    const guiDay = await taoGuiDay(pool, opt);
    const nguoi = (await pool.query('SELECT DISTINCT d.* FROM nguoi_dung d JOIN dang_ky_thong_bao t ON t.nguoi_id=d.id')).rows;
    for (const u of nguoi) {
      const dong = await tinCho(pool, u, ngay);
      if (dong.length) await guiCho(pool, u.id, noiDung(dong), guiDay);
    }
  };
  const t = setInterval(() => chay().catch((e) => console.error('Lịch thông báo lỗi:', e.message)), 5 * 60e3);
  setTimeout(() => chay().catch((e) => console.error('Lịch thông báo lỗi:', e.message)), 10e3);
  return () => clearInterval(t);
}

module.exports = { caiDat, batLich, tinCho, noiDung, ngayVN };
