/* Đăng nhập bằng vân tay / khuôn mặt (passkey, chuẩn WebAuthn).
 *  - Đăng nhập bằng mật khẩu một lần, vào Tài khoản bấm "Bật trên máy này": máy tạo cặp khóa, khóa bí mật nằm
 *    trong chip bảo mật của điện thoại (mở bằng vân tay / khuôn mặt), máy chủ chỉ lưu khóa công khai.
 *  - Lần sau ở màn đăng nhập bấm "Mở bằng vân tay / khuôn mặt": máy ký thử thách, máy chủ kiểm chữ ký rồi đặt cookie.
 *  - Đổi mật khẩu không xóa passkey; muốn chặn một máy thì xóa trong Tài khoản. */
const {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

const HAN = 5 * 60e3; // thử thách hết hạn sau 5 phút

function caiDat(app, { q, datCookie, ghiNhatKy, Loi }) {
  const thuThach = new Map(); // challenge -> { het, nguoiId }
  const giu = (c, nguoiId) => {
    const now = Date.now();
    for (const [k, v] of thuThach) if (v.het < now) thuThach.delete(k);
    thuThach.set(c, { het: now + HAN, nguoiId });
  };
  // Lấy thử thách trong phản hồi của máy, kiểm còn hạn và đúng người, dùng xong bỏ ngay
  const layThuThach = (resp, nguoiId) => {
    let c;
    try { c = JSON.parse(Buffer.from(resp.response.clientDataJSON, 'base64url').toString()).challenge; } catch { c = null; }
    const v = c && thuThach.get(c);
    if (c) thuThach.delete(c);
    if (!v || v.het < Date.now() || (nguoiId && v.nguoiId !== nguoiId)) throw new Loi(400, 'Hết thời gian, bấm lại lần nữa.');
    return c;
  };
  // Sau nginx có thể thấy http; trình duyệt chỉ cho passkey trên https (hoặc localhost) nên nhận cả hai
  const noi = (req) => ({ rpID: req.hostname, origin: [`https://${req.get('host')}`, `http://${req.get('host')}`] });

  /* ---- bật trên máy này (đã đăng nhập) ---- */
  app.post('/api/passkey/dang-ky/bat-dau', async (req, res, next) => {
    try {
      const u = req.u;
      const co = (await q('SELECT id, cach_noi FROM passkey WHERE nguoi_id=$1', [u.id])).rows;
      const opt = await generateRegistrationOptions({
        rpName: 'My Finance', rpID: noi(req).rpID,
        userID: new TextEncoder().encode('mf-' + u.id), userName: u.ten_dang_nhap, userDisplayName: u.ten_hien_thi,
        attestationType: 'none',
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
        excludeCredentials: co.map((c) => ({ id: c.id, transports: c.cach_noi })),
      });
      giu(opt.challenge, u.id);
      res.json(opt);
    } catch (e) { next(e); }
  });
  app.post('/api/passkey/dang-ky/xong', async (req, res, next) => {
    try {
      const u = req.u, resp = req.body.phan_hoi;
      if (!resp || !resp.response) throw new Loi(400, 'Thiếu dữ liệu từ máy.');
      const c = layThuThach(resp, u.id);
      const { rpID, origin } = noi(req);
      let kq;
      try { kq = await verifyRegistrationResponse({ response: resp, expectedChallenge: c, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true }); }
      catch (e) { throw new Loi(400, 'Máy không xác nhận được: ' + e.message); }
      if (!kq.verified) throw new Loi(400, 'Máy không xác nhận được.');
      const cr = kq.registrationInfo.credential;
      const ten = String(req.body.ten_may || '').slice(0, 80);
      await q(`INSERT INTO passkey (id, nguoi_id, khoa_cong, dem, cach_noi, ten_may) VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (id) DO UPDATE SET khoa_cong=EXCLUDED.khoa_cong, dem=EXCLUDED.dem, ten_may=EXCLUDED.ten_may`,
      [cr.id, u.id, Buffer.from(cr.publicKey), cr.counter || 0, cr.transports || [], ten]);
      await ghiNhatKy(u.id, `Bật đăng nhập bằng vân tay / khuôn mặt${ten ? ' trên ' + ten : ''}`, [u.id]);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });
  app.get('/api/passkey', async (req, res, next) => {
    try {
      res.json((await q('SELECT id, ten_may, tao_luc, dung_luc FROM passkey WHERE nguoi_id=$1 ORDER BY tao_luc', [req.u.id])).rows);
    } catch (e) { next(e); }
  });
  app.post('/api/passkey/xoa', async (req, res, next) => {
    try {
      const r = await q('DELETE FROM passkey WHERE id=$1 AND nguoi_id=$2 RETURNING ten_may', [String(req.body.id || ''), req.u.id]);
      if (!r.rowCount) throw new Loi(404, 'Không tìm thấy máy này.');
      await ghiNhatKy(req.u.id, `Tắt đăng nhập bằng vân tay / khuôn mặt${r.rows[0].ten_may ? ' trên ' + r.rows[0].ten_may : ''}`, [req.u.id]);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  /* ---- mở app bằng vân tay / khuôn mặt (chưa đăng nhập) ---- */
  app.post('/api/passkey/vao/bat-dau', async (req, res, next) => {
    try {
      const opt = await generateAuthenticationOptions({ rpID: noi(req).rpID, userVerification: 'required', allowCredentials: [] });
      giu(opt.challenge, null);
      res.json(opt);
    } catch (e) { next(e); }
  });
  app.post('/api/passkey/vao/xong', async (req, res, next) => {
    try {
      const resp = req.body.phan_hoi;
      if (!resp || !resp.id || !resp.response) throw new Loi(400, 'Thiếu dữ liệu từ máy.');
      const c = layThuThach(resp, null);
      const pk = (await q('SELECT * FROM passkey WHERE id=$1', [String(resp.id)])).rows[0];
      if (!pk) throw new Loi(401, 'Máy này chưa bật đăng nhập bằng vân tay / khuôn mặt. Đăng nhập bằng mật khẩu rồi bật trong Tài khoản.');
      const { rpID, origin } = noi(req);
      let kq;
      try {
        kq = await verifyAuthenticationResponse({
          response: resp, expectedChallenge: c, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
          credential: { id: pk.id, publicKey: new Uint8Array(pk.khoa_cong), counter: Number(pk.dem), transports: pk.cach_noi },
        });
      } catch (e) { throw new Loi(401, 'Không xác nhận được: ' + e.message); }
      if (!kq.verified) throw new Loi(401, 'Không xác nhận được.');
      await q('UPDATE passkey SET dem=$1, dung_luc=now() WHERE id=$2', [kq.authenticationInfo.newCounter, pk.id]);
      const u = (await q('SELECT * FROM nguoi_dung WHERE id=$1', [pk.nguoi_id])).rows[0];
      datCookie(res, u);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });
}

module.exports = { caiDat, CONG_KHAI: ['/passkey/vao/bat-dau', '/passkey/vao/xong'] };
