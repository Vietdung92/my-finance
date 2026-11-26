/* Phần tính tiền của My Finance. Dùng chung cho trình duyệt (window.Tinh) và máy chủ/bài kiểm tra (require).
 *
 * Quy ước:
 *  - Lãi suất lưu theo %/năm (lai). Khoản báo lãi theo tháng thì nhân 12 khi lưu, don_vi_lai chỉ để hiển thị.
 *  - Ngày là chuỗi 'YYYY-MM-DD' hoặc Date theo giờ địa phương (không dùng giờ UTC để khỏi lệch ngày).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Tinh = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const pd = (s) => {
    if (s instanceof Date) return new Date(s.getFullYear(), s.getMonth(), s.getDate());
    const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const iso = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const soNgay = (a, b) => Math.round((pd(b) - pd(a)) / 864e5);

  /* Ngày của kỳ thứ k: cộng k tháng vào ngày bắt đầu; có ngày chốt lãi thì dùng ngày đó (tháng thiếu ngày thì lấy ngày cuối tháng). */
  function ngayKy(batDau, k, ngayChot) {
    const d = pd(batDau);
    const t = new Date(d.getFullYear(), d.getMonth() + k, 1);
    const cuoiThang = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
    t.setDate(Math.min(ngayChot || d.getDate(), cuoiThang));
    return t;
  }

  /* Lãi %/năm áp dụng tại một ngày: lãi ban đầu, rồi các lần đổi lãi có hiệu lực từ ngày <= ngày đó. */
  function laiTai(kh, ngay) {
    let r = Number(kh.lai) || 0;
    const ds = (kh.doi_lai || []).slice().sort((a, b) => (a.tu < b.tu ? -1 : 1));
    const n = iso(pd(ngay));
    for (const x of ds) if (x.tu <= n) r = Number(x.lai);
    return r;
  }

  /* Lịch trả từng kỳ. Mỗi kỳ: { ngay, goc, lai, du (dư gốc sau kỳ), lai_suat } */
  function lichTra(kh) {
    const P = Number(kh.goc), n = Number(kh.ky_han) || 0, out = [];
    const ky = (k) => ngayKy(kh.bat_dau, k, kh.ngay_chot);
    switch (kh.cach) {
      case 'goc_deu': { // gốc chia đều, lãi tính trên dư nợ theo số ngày thực tế / 365 (cách ngân hàng VN tính)
        let du = P, truoc = pd(kh.bat_dau);
        const g = P / n;
        for (let k = 1; k <= n; k++) {
          const d = ky(k), r = laiTai(kh, truoc);
          const lai = du * r / 100 * soNgay(truoc, d) / 365;
          du -= g;
          out.push({ ngay: d, goc: g, lai, du: Math.max(du, 0), lai_suat: r });
          truoc = d;
        }
        break;
      }
      case 'nien_kim': { // trả đều mỗi tháng; lãi đổi thì tính lại số tiền trả đều trên dư nợ và số kỳ còn lại
        let du = P, truoc = pd(kh.bat_dau), rCu = null, tra = 0;
        for (let k = 1; k <= n; k++) {
          const d = ky(k), rNam = laiTai(kh, truoc), r = rNam / 100 / 12;
          if (r !== rCu) { const con = n - k + 1; tra = r === 0 ? du / con : du * r / (1 - Math.pow(1 + r, -con)); rCu = r; }
          const lai = du * r;
          const g = k === n ? du : tra - lai;
          du -= g;
          out.push({ ngay: d, goc: g, lai, du: Math.max(du, 0), lai_suat: rNam });
          truoc = d;
        }
        break;
      }
      case 'lai_thang': { // trả lãi hàng tháng trên số gốc, gốc trả một lần cuối kỳ
        let truoc = pd(kh.bat_dau);
        for (let k = 1; k <= n; k++) {
          const d = ky(k), r = laiTai(kh, truoc);
          out.push({ ngay: d, goc: k === n ? P : 0, lai: P * r / 100 / 12, du: k === n ? 0 : P, lai_suat: r });
          truoc = d;
        }
        break;
      }
      case 'khong_lai':
        if (n) out.push({ ngay: ky(n), goc: P, lai: 0, du: 0, lai_suat: 0 });
        break;
      case 'tiet_kiem': { // lãi đơn, nhận cả gốc và lãi khi đáo hạn
        const r = laiTai(kh, kh.bat_dau);
        if (n) out.push({ ngay: ky(n), goc: P, lai: P * r / 100 * n / 12, du: 0, lai_suat: r });
        break;
      }
      case 'chia_quy': { // chia lợi nhuận mỗi quý, gốc nhận lại cuối kỳ
        let truoc = pd(kh.bat_dau);
        for (let k = 3; k <= n; k += 3) {
          const d = ky(k), r = laiTai(kh, truoc);
          out.push({ ngay: d, goc: k >= n ? P : 0, lai: P * r / 100 / 4, du: k >= n ? 0 : P, lai_suat: r });
          truoc = d;
        }
        break;
      }
      default: break; // tai_san: không có dòng tiền
    }
    return out;
  }

  /* Trạng thái từng kỳ và các con số tóm tắt của một khoản.
   * thanhToan: [{ky_ngay:'YYYY-MM-DD', trang_thai:'da_tra'|'chua_tra'}] do người nhập ghi nhận.
   * Kỳ đã qua mà chưa ghi nhận: khoản "tự trừ" (ngân hàng trừ tự động) coi là đã trả, khoản còn lại coi là quá hạn. */
  function tomTat(kh, thanhToan, homNay) {
    const today = pd(homNay);
    const ghi = {};
    (thanhToan || []).forEach((t) => { ghi[String(t.ky_ngay).slice(0, 10)] = t.trang_thai; });
    const lich = lichTra(kh).map((e) => {
      const g = ghi[iso(e.ngay)];
      let tt;
      if (g === 'da_tra') tt = 'xong';
      else if (e.ngay >= today) tt = 'chua';
      else if (g === 'chua_tra') tt = 'quahan';
      else tt = kh.tu_dong_da_tra ? 'xong' : 'quahan';
      return Object.assign({}, e, { tt });
    });
    if (kh.cach === 'tai_san') {
      return { lich, conLai: Number(kh.gia_tri || kh.goc), daTraPct: null, quaHan: [], kyToi: null, daoHan: null };
    }
    const gocDaTra = lich.filter((e) => e.tt === 'xong').reduce((a, e) => a + e.goc, 0);
    return {
      lich,
      conLai: Math.max(Number(kh.goc) - gocDaTra, 0),
      daTraPct: Number(kh.goc) ? gocDaTra / Number(kh.goc) : 0,
      quaHan: lich.filter((e) => e.tt === 'quahan'),
      kyToi: lich.find((e) => e.tt === 'chua') || null,
      daoHan: lich.length ? lich[lich.length - 1].ngay : null,
      tongLai: lich.reduce((a, e) => a + e.lai, 0),
    };
  }

  /* Khoản mượn giữa 2 tài khoản.
   *  cach_tinh 'du_no_ngay': lãi mỗi ngày = gốc còn lại × lãi tháng / 30, trả bớt gốc thì lãi giảm ngay từ hôm sau.
   *  cach_tinh 'co_dinh'   : lãi mỗi tháng = gốc mượn ban đầu × lãi tháng, tính theo tháng tròn tới khi trả hết gốc. */
  function noiBo(k, chuyenTra, homNay) {
    const today = pd(homNay);
    const ds = (chuyenTra || []).filter((t) => t.noi_bo_id === undefined || t.noi_bo_id === k.id)
      .map((t) => ({ ngay: pd(t.ngay), so_tien: Number(t.so_tien), loai: t.loai }))
      .sort((a, b) => a.ngay - b.ngay);
    const goc = Number(k.goc), lt = Number(k.lai_thang) || 0;
    let gocCon = goc, laiPS = 0, laiTra = 0, gocTra = 0, ngayHet = null;
    const ap = (t) => {
      if (t.loai === 'goc') { gocCon -= t.so_tien; gocTra += t.so_tien; if (gocCon <= 0.5 && !ngayHet) ngayHet = t.ngay; }
      else laiTra += t.so_tien;
    };
    if (k.cach_tinh === 'co_dinh') {
      ds.filter((t) => t.ngay <= today).forEach(ap);
      const ketThuc = ngayHet && ngayHet < today ? ngayHet : today;
      let thang = 0;
      while (ngayKy(k.ngay, thang + 1) <= ketThuc) thang++;
      laiPS = goc * lt / 100 * thang;
    } else {
      let d = pd(k.ngay), i = 0;
      while (d < today) {
        while (i < ds.length && ds[i].ngay <= d) ap(ds[i++]);
        laiPS += Math.max(gocCon, 0) * lt / 100 / 30;
        d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
      }
      while (i < ds.length && ds[i].ngay <= today) ap(ds[i++]);
    }
    return {
      gocCon: Math.max(gocCon, 0), gocTra, laiPS, laiTra,
      laiCon: Math.max(laiPS - laiTra, 0),
      daTraPct: goc ? Math.min(gocTra / goc, 1) : 0,
    };
  }

  return { pd, iso, soNgay, ngayKy, laiTai, lichTra, tomTat, noiBo };
});
