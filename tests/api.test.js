/* Bài kiểm tra API trên một database THỬ. Chạy:
 *   TEST_DATABASE_URL=postgresql://mf:mf@localhost/mf_test npm test
 * Không đặt TEST_DATABASE_URL thì bỏ qua. Database thử bị xóa sạch bảng mỗi lần chạy. */
const test = require('node:test');
const assert = require('node:assert');
const URL_DB = process.env.TEST_DATABASE_URL;

test('API', { skip: !URL_DB && 'chưa đặt TEST_DATABASE_URL' }, async (t) => {
  const { Pool } = require('pg');
  const bcrypt = require('bcryptjs');
  const { createApp } = require('../server');
  const { migrate } = require('../db/migrate');
  const pool = new Pool({ connectionString: URL_DB });
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(pool);
  const h = await bcrypt.hash('matkhau-thu-123', 4);
  const [tu, dung] = (await pool.query(`INSERT INTO nguoi_dung (ten_dang_nhap, ten_hien_thi, mat_khau_hash, quyen) VALUES
    ('tu','Tú',$1,'nhap'), ('dung','Dũng',$1,'xem') RETURNING id`, [h])).rows.map((r) => r.id);
  const daGui = [];
  const srv = createApp(pool, { jwtSecret: 'x'.repeat(40), secureCookie: false, guiDay: async (sub, data) => { if (/het-han/.test(sub.endpoint)) { const e = new Error('gone'); e.statusCode = 410; throw e; } daGui.push({ endpoint: sub.endpoint, ...JSON.parse(data) }); } }).listen(0);
  const base = `http://127.0.0.1:${srv.address().port}`;
  t.after(async () => { srv.close(); await pool.end(); });

  const cookies = {};
  const phien = async (ten) => {
    const r = await fetch(base + '/api/dang-nhap', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ten_dang_nhap: ten, mat_khau: 'matkhau-thu-123' }) });
    assert.equal(r.status, 200);
    const c = r.headers.get('set-cookie').split(';')[0];
    cookies[ten] = c;
    return async (m, url, body) => {
      const r2 = await fetch(base + url, { method: m, headers: { cookie: c, 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
      return { s: r2.status, j: await r2.json().catch(() => null) };
    };
  };
  const T = await phien('tu'), D = await phien('dung');

  await t.test('chưa đăng nhập và sai mật khẩu bị chặn', async () => {
    assert.equal((await fetch(base + '/api/du-lieu')).status, 401);
    const r = await fetch(base + '/api/dang-nhap', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ten_dang_nhap: 'tu', mat_khau: 'sai' }) });
    assert.equal(r.status, 401);
  });

  let khDung, khTu;
  await t.test('Tú thêm khoản cho Dũng và cho mình', async () => {
    const a = await T('POST', '/api/khoan', { chu_id: dung, nhom: 'no', ten: 'Vay mua căn hộ', doi_tac: 'Vietcombank', goc: 2e9, bat_dau: '2025-03-15', ky_han: 240, cach: 'goc_deu', lai: 7.5, ngay_chot: 15, tu_dong_da_tra: true, doi_lai: [{ tu: '2027-03-15', lai: 10.5 }] });
    assert.equal(a.s, 200, JSON.stringify(a.j)); khDung = a.j.id;
    const b = await T('POST', '/api/khoan', { chu_id: tu, nhom: 'chovay', ten: 'Cho vay', doi_tac: 'Anh Tuấn', goc: 150e6, bat_dau: '2025-09-05', ky_han: 24, cach: 'lai_thang', lai: 18, chu_ky: 3 });
    assert.equal(b.s, 200); khTu = b.j.id;
  });

  await t.test('dữ liệu sai bị từ chối với lời nhắn rõ', async () => {
    const r = await T('POST', '/api/khoan', { chu_id: dung, nhom: 'no', ten: '', doi_tac: 'X', goc: 1, bat_dau: '2026-01-01', ky_han: 12, cach: 'nien_kim', lai: 10 });
    assert.equal(r.s, 400); assert.match(r.j.loi, /tên khoản/);
    const r2 = await T('POST', '/api/khoan', { chu_id: 999, nhom: 'no', ten: 'a', doi_tac: 'X', goc: 1, bat_dau: '2026-01-01', ky_han: 12, cach: 'nien_kim', lai: 10 });
    assert.equal(r2.s, 400);
  });

  await t.test('Dũng: thấy khoản của mình, không thấy khoản của Tú, không sửa được khoản Tú nhập', async () => {
    const d = await D('GET', '/api/du-lieu');
    assert.deepEqual(d.j.khoan.map((k) => k.id), [khDung]);
    assert.equal(d.j.khoan[0].bat_dau, '2025-03-15');
    assert.deepEqual(d.j.khoan[0].doi_lai, [{ tu: '2027-03-15', lai: 10.5 }]);
    assert.equal(d.j.toi.quyen, 'xem');
    for (const [m, u] of [['PUT', `/api/khoan/${khDung}`], ['DELETE', `/api/khoan/${khDung}`], ['POST', `/api/khoan/${khDung}/ky`], ['POST', '/api/noi-bo']]) {
      assert.equal((await D(m, u, {})).s, 403, `${m} ${u}`);
    }
    const all = await T('GET', '/api/du-lieu');
    assert.equal(all.j.khoan.length, 2);
    assert.equal(all.j.khoan.find((k) => k.id === khTu).chu_ky, 3);
    assert.equal(d.j.khoan[0].chu_ky, 1);
  });

  await t.test('ghi nhận kỳ, sửa khoản, nhật ký có chi tiết', async () => {
    assert.equal((await T('POST', `/api/khoan/${khTu}/ky`, { ky_ngay: '2026-11-05', trang_thai: 'chua_tra' })).s, 200);
    assert.equal((await T('POST', `/api/khoan/${khTu}/ky`, { ky_ngay: '2026-11-05', trang_thai: 'da_tra' })).s, 200);
    const sua = await T('PUT', `/api/khoan/${khDung}`, { chu_id: dung, nhom: 'no', ten: 'Vay mua căn hộ', doi_tac: 'Vietcombank', goc: 2e9, bat_dau: '2025-03-15', ky_han: 240, cach: 'goc_deu', lai: 7.8, ngay_chot: 15, tu_dong_da_tra: true, doi_lai: [] });
    assert.equal(sua.s, 200);
    const d = await D('GET', '/api/du-lieu');
    assert.ok(d.j.nhat_ky.some((n) => /lãi 7.5% → 7.8%\/năm/.test(n.viec)), 'Dũng thấy việc sửa lãi khoản của mình');
    assert.ok(!d.j.nhat_ky.some((n) => /Anh Tuấn/.test(n.viec)), 'Dũng không thấy nhật ký khoản của Tú');
    const tt = (await T('GET', '/api/du-lieu')).j.thanh_toan;
    assert.deepEqual(tt.map((x) => [x.ky_ngay, x.trang_thai]), [['2026-11-05', 'da_tra']]);
  });

  await t.test('mượn qua lại: chuyển trả gốc/lãi, chặn trả gốc vượt số còn nợ', async () => {
    const nb = await T('POST', '/api/noi-bo', { cho_vay_id: tu, vay_id: dung, goc: 60e6, ngay: '2026-10-01', lai_thang: 1, cach_tinh: 'co_dinh' });
    assert.equal(nb.s, 200);
    assert.equal((await T('POST', `/api/noi-bo/${nb.j.id}/chuyen-tra`, { loai: 'lai', so_tien: 600000, ngay: '2026-11-01' })).s, 200);
    assert.equal((await T('POST', `/api/noi-bo/${nb.j.id}/chuyen-tra`, { loai: 'goc', so_tien: 50e6, ngay: '2026-11-10' })).s, 200);
    const vuot = await T('POST', `/api/noi-bo/${nb.j.id}/chuyen-tra`, { loai: 'goc', so_tien: 20e6, ngay: '2026-11-11' });
    assert.equal(vuot.s, 400); assert.match(vuot.j.loi, /vượt/);
    assert.equal((await T('POST', `/api/noi-bo/${nb.j.id}/chuyen-tra`, { loai: 'goc', so_tien: 5e6, ngay: '2026-11-11' })).s, 200);
    const d = await D('GET', '/api/du-lieu');
    assert.equal(d.j.noi_bo.length, 1);
    assert.equal(d.j.noi_bo[0].cach_tinh, 'co_dinh');
    assert.deepEqual(d.j.chuyen_tra.map((x) => [x.loai, x.so_tien]), [['lai', 600000], ['goc', 50e6], ['goc', 5e6]]);
    assert.ok(d.j.nhat_ky.some((n) => /Dũng chuyển trả lãi 600\.000 đ cho Tú/.test(n.viec)));
  });

  await t.test('danh bạ: tên tự vào khi nhập khoản, đổi tên thì khoản đổi theo, Dũng chỉ thấy tên của mình', async () => {
    let tt = await T('GET', '/api/du-lieu');
    assert.deepEqual(tt.j.doi_tac.map((d) => d.ten).sort(), ['Anh Tuấn', 'Vietcombank']);
    const them = await T('POST', '/api/doi-tac', { ten: 'Anh Hùng', loai: 'nguoi', dien_thoai: '0909' });
    assert.equal(them.s, 200);
    assert.equal((await T('POST', '/api/doi-tac', { ten: 'anh hùng' })).s, 400, 'trùng tên không phân biệt hoa thường');
    assert.equal((await D('POST', '/api/doi-tac', { ten: 'X' })).s, 403);
    const vcb = tt.j.doi_tac.find((d) => d.ten === 'Vietcombank');
    const doi = await T('PUT', '/api/doi-tac/' + vcb.id, { ten: 'Vietcombank Thủ Đức', loai: 'ngan_hang' });
    assert.equal(doi.s, 200); assert.equal(doi.j.so_khoan, 1);
    const d = await D('GET', '/api/du-lieu');
    assert.equal(d.j.khoan[0].doi_tac, 'Vietcombank Thủ Đức');
    assert.deepEqual(d.j.doi_tac.map((x) => x.ten), ['Vietcombank Thủ Đức'], 'Dũng không thấy tên ở khoản của Tú');
    assert.equal((await T('DELETE', '/api/doi-tac/' + them.j.id)).s, 200);
    tt = await T('GET', '/api/du-lieu');
    assert.ok(!tt.j.doi_tac.some((x) => x.ten === 'Anh Hùng'));
    assert.equal((await T('POST', '/api/doi-tac', { ten: 'Anh Hùng' })).s, 200, 'bỏ rồi thêm lại được');
  });

  await t.test('thông báo: đăng ký từng máy, gửi thử đúng người, máy đã gỡ thì tự xóa', async () => {
    const k = await D('GET', '/api/thong-bao');
    assert.equal(k.s, 200); assert.ok(k.j.khoa.length > 40, 'có khóa VAPID');
    assert.equal((await T('GET', '/api/thong-bao')).j.khoa, k.j.khoa, 'khóa giữ nguyên giữa các lần gọi');
    const sub = (ep) => ({ endpoint: 'https://push.example.com/' + ep, keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) } });
    assert.equal((await D('POST', '/api/thong-bao/dang-ky', sub('may-dung'))).s, 200, 'người chỉ xem cũng bật được');
    assert.equal((await T('POST', '/api/thong-bao/dang-ky', sub('may-tu'))).s, 200);
    assert.equal((await T('POST', '/api/thong-bao/dang-ky', sub('het-han-tu'))).s, 200);
    assert.equal((await T('POST', '/api/thong-bao/dang-ky', { endpoint: 'http://x', keys: {} })).s, 400);
    assert.equal((await D('GET', '/api/thong-bao')).j.so_may, 1);

    const rT = await T('POST', '/api/thong-bao/thu', {});
    assert.equal(rT.j.gui, 1, 'máy hết hạn không tính');
    const tinTu = daGui.find((x) => x.endpoint.endsWith('may-tu'));
    assert.match(tinTu.title, /quá hạn/, 'khoản cho vay của Tú chưa ghi nhận các quý trước');
    assert.match(tinTu.body, /\[Tú\] Quá hạn \d+ ngày: thu Anh Tuấn/);
    assert.equal((await T('GET', '/api/thong-bao')).j.so_may, 1, 'đăng ký hết hạn đã bị xóa');

    await D('POST', '/api/thong-bao/thu', {});
    const tinDung = daGui.find((x) => x.endpoint.endsWith('may-dung'));
    assert.ok(tinDung && !/Anh Tuấn/.test(tinDung.body), 'anh Dũng không nhận tin về ví của Tú');

    assert.equal((await D('POST', '/api/thong-bao/huy', { endpoint: sub('may-dung').endpoint })).s, 200);
    assert.equal((await D('GET', '/api/thong-bao')).j.so_may, 0);
  });

  await t.test('Dũng tự thêm khoản: luôn vào ví Dũng, chỉ Dũng sửa, xóa, ghi nhận được', async () => {
    const than = { chu_id: tu, nhom: 'chovay', ten: 'Cho bạn mượn', doi_tac: 'Anh Bình', goc: 50e6, bat_dau: '2026-06-01', ky_han: 12, cach: 'lai_thang', lai: 12 };
    const a = await D('POST', '/api/khoan', than);
    assert.equal(a.s, 200, JSON.stringify(a.j));
    const id = a.j.id;
    const k = (await D('GET', '/api/du-lieu')).j.khoan.find((x) => x.id === id);
    assert.equal(k.chu_id, dung, 'gửi chu_id của Tú vẫn vào ví Dũng');
    assert.equal(k.rieng_cua, dung);
    assert.ok((await T('GET', '/api/du-lieu')).j.khoan.some((x) => x.id === id), 'Tú vẫn thấy khoản này');
    // Tú không sửa, xóa, ghi nhận được
    assert.equal((await T('PUT', `/api/khoan/${id}`, { ...than, lai: 10 })).s, 403);
    assert.equal((await T('POST', `/api/khoan/${id}/ky`, { ky_ngay: '2026-07-01', trang_thai: 'da_tra' })).s, 403);
    assert.equal((await T('DELETE', `/api/khoan/${id}`)).s, 403);
    // Dũng làm được, và không chuyển được sang ví Tú
    assert.equal((await D('POST', `/api/khoan/${id}/ky`, { ky_ngay: '2026-07-01', trang_thai: 'da_tra' })).s, 200);
    assert.equal((await D('PUT', `/api/khoan/${id}`, { ...than, lai: 10 })).s, 200);
    const k2 = (await T('GET', '/api/du-lieu')).j.khoan.find((x) => x.id === id);
    assert.equal(Number(k2.lai), 10); assert.equal(k2.chu_id, dung);
    // Dũng vẫn không sửa được khoản Tú nhập
    assert.equal((await D('PUT', `/api/khoan/${khDung}`, { ...than, chu_id: dung })).s, 403);
    assert.equal((await D('DELETE', `/api/khoan/${id}`)).s, 200);
  });

  await t.test('đổi mật khẩu đăng xuất phiên cũ', async () => {
    const r = await D('POST', '/api/doi-mat-khau', { cu: 'matkhau-thu-123', moi: 'matkhau-moi-456' });
    assert.equal(r.s, 200);
    assert.equal((await D('GET', '/api/du-lieu')).s, 401, 'cookie cũ hết hiệu lực');
  });

  await t.test('lệnh ghi không phải JSON bị chặn', async () => {
    const r = await fetch(base + '/api/khoan', { method: 'POST', body: 'ten=a', headers: { cookie: cookies.tu, 'content-type': 'application/x-www-form-urlencoded' } });
    assert.equal(r.status, 415);
    const xoa = await fetch(base + '/api/doi-tac/999999', { method: 'DELETE', headers: { cookie: cookies.tu } });
    assert.equal(xoa.status, 404, 'lệnh xóa không có nội dung vẫn tới được máy chủ');
  });

});
