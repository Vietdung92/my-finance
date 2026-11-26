/* My Finance: giao diện. Số liệu lấy từ /api/du-lieu, mọi phép tính tiền nằm ở tinh.js. */
(function () {
  'use strict';
  const T = window.Tinh;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- định dạng ---------- */
  function m(v, full) {
    if (full) return Math.round(v).toLocaleString('vi-VN') + ' đ';
    const a = Math.abs(v), s = v < 0 ? '−' : '';
    if (a >= 1e9) return s + (a / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + ' tỷ';
    if (a >= 1e6) return s + (a / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + ' tr';
    return s + Math.round(a).toLocaleString('vi-VN') + ' đ';
  }
  const dd = (d) => T.pd(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const soTien = (s) => Number(String(s || '').replace(/\D/g, '')) || 0;
  const soThapPhan = (s) => Number(String(s || '').trim().replace(/\s/g, '').replace(',', '.'));
  const homNay = () => T.pd(new Date());
  const MAU_NO = ['#e5484d', '#f76b15', '#f5a524', '#c2440b', '#d6336c', '#a1887f'];
  const NHOM = { no: { ten: 'Đang nợ', c: '--debt' }, chovay: { ten: 'Cho vay', c: '--lend' }, dautu: { ten: 'Đầu tư', c: '--inv' } };
  const CACH = {
    nien_kim: 'Trả đều (gốc + lãi bằng nhau mỗi kỳ)', goc_deu: 'Gốc đều, lãi giảm dần',
    lai_thang: 'Chỉ trả lãi, gốc trả cuối kỳ', khong_lai: 'Không lãi, trả gốc khi đến hạn',
    tiet_kiem: 'Tiết kiệm: nhận gốc + lãi khi đáo hạn', tai_san: 'Tài sản (nhà, đất...)',
  };

  const CHU_KY = { 1: 'Mỗi tháng', 3: 'Mỗi quý (3 tháng)', 6: 'Mỗi 6 tháng', 12: 'Mỗi năm' };
  const CO_CHU_KY = ['goc_deu', 'nien_kim', 'lai_thang'];

  /* ---------- gọi máy chủ ---------- */
  async function api(method, url, body) {
    const r = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && url !== '/api/dang-nhap') { D = null; renderLogin(); throw new Error('Cần đăng nhập lại.'); }
    if (!r.ok) throw new Error(j.loi || 'Có lỗi, thử lại.');
    return j;
  }

  let kyLoai = 'thang', kyBuoc = 0;
  let D = null, xemAi = null, tab = 'all', charts = {}, loc = null, phiaNguoi = 'no';
  const toi = () => D.toi;
  // Khoản anh Dũng tự nhập (rieng_cua) chỉ người nhập sửa được; còn lại chỉ tài khoản nhập liệu sửa
  const suaKhoan = (k) => (k.rieng_cua ? k.rieng_cua === D.toi.id : coNhap());
  const coNhap = () => D.toi.quyen === 'nhap';
  const nguoi = (id) => D.nguoi.find((x) => x.id === id) || { ten: '?', mau: '#888' };
  const av = (id) => { const x = nguoi(id); return `<span class="av" style="background:${esc(x.mau)}">${esc(x.ten[0] || '?')}</span>`; };

  async function taiLai() {
    D = await api('GET', '/api/du-lieu');
    // Hai ví riêng: luôn xem từng người, không gộp. Tú mặc định xem ví anh Dũng.
    if (!coNhap()) xemAi = D.toi.id;
    else if (!D.nguoi.some((x) => x.id === xemAi)) xemAi = (D.nguoi.find((x) => x.quyen === 'xem') || D.toi).id;
    const today = homNay();
    D.khoan.forEach((k) => Object.assign(k, T.tomTat(k, D.thanh_toan.filter((t) => t.khoan_id === k.id), today)));
    D.noi_bo.forEach((k) => { k.st = T.noiBo(k, D.chuyen_tra.filter((t) => t.noi_bo_id === k.id), today); });
    renderApp();
  }

  /* ---------- đăng nhập ---------- */
  // Nhờ máy lưu mật khẩu (Android Chrome hỏi ngay; iPhone Safari tự hỏi khi ô đăng nhập biến mất sau khi vào).
  // Lần sau chạm vào ô tên đăng nhập, máy quét Face ID / vân tay rồi tự điền.
  function luuMatKhau(id, password) {
    try { if (window.PasswordCredential) navigator.credentials.store(new PasswordCredential({ id, password, name: id })).catch(() => {}); } catch (_) { /* máy không hỗ trợ */ }
  }
  // Lỗi máy chủ trả về sau khi gửi form (/?loi=sai|khoa): đọc một lần lúc mở trang rồi xóa khỏi thanh địa chỉ
  const maLoi = new URLSearchParams(location.search).get('loi');
  let loiDangNhap = maLoi ? (maLoi === 'khoa' ? 'Sai mật khẩu quá nhiều lần. Thử lại sau 15 phút.' : 'Sai tên đăng nhập hoặc mật khẩu.') : '';
  if (maLoi) history.replaceState(null, '', '/');
  function renderLogin(loi) {
    // Báo lỗi do máy chủ trả về sau khi gửi form (/?loi=sai|khoa), rồi xóa khỏi thanh địa chỉ
    loi = loi || loiDangNhap; loiDangNhap = '';
    $('app').innerHTML = `<div class="login"><form id="lf" class="pf panel" method="post" action="/dang-nhap" autocomplete="on">
      <img src="logo.svg" alt="" class="logo-lon"><h1>My Finance</h1><div class="muted">Đăng nhập để xem số liệu.</div>
      <label for="lTen">Tên đăng nhập</label><input id="lTen" name="username" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required>
      <label for="lMk">Mật khẩu</label><input id="lMk" name="password" type="password" autocomplete="current-password" required>
      <div class="out" id="lErr" ${loi ? '' : 'hidden'}>${esc(loi || '')}</div>
      <button class="btn" type="submit">Đăng nhập</button></form></div>`;
    // Gửi form thường (tải lại trang) để máy hỏi lưu mật khẩu; chỉ khóa nút cho khỏi bấm 2 lần
    $('lf').onsubmit = (e) => { e.target.querySelector('button').disabled = true; };
    $('lTen').focus();
  }

  /* ---------- màn chính ---------- */
  function khung() {
    return `<div class="wrap">
    <div class="top">
      <div class="thuong-hieu"><img src="logo.svg" alt="" class="logo"><div><h1>My Finance</h1><div class="muted" style="font-size:.85rem">Số liệu đến ${dd(homNay())}</div></div></div>
      <div class="me"><button class="hd-nut" id="bHd" aria-label="Hướng dẫn từng bước" title="Hướng dẫn từng bước">?</button>
        <button class="tk-nut" id="bTk" aria-label="Tài khoản: đổi mật khẩu, đăng xuất">${av(toi().id)}<span class="tk-ten">${esc(toi().ten)}</span><span aria-hidden="true">▾</span></button></div>
    </div>
    ${coNhap() ? `<div class="thanh-nhap"><div class="chips" id="members" role="group" aria-label="Xem ví của ai"></div>
      <div class="acts"><button class="btn sm" id="addBtn">+ Thêm khoản</button><button class="btn sm ghost" id="addNb">+ Khoản mượn</button><button class="btn sm ghost" id="dbBtn">Danh bạ</button></div></div>`
      : `<div class="thanh-nhap"><div class="acts"><button class="btn sm" id="addBtn">+ Thêm khoản</button></div></div>`}
    <div class="hero panel" id="hero"></div>
    <div class="panel" id="pKy"><div class="ph"><h2>Theo thời gian</h2><div class="tabs ky-loai" role="tablist" id="kyLoai"></div></div>
      <div class="ky-dieu"><button class="chip" id="kyLui" aria-label="Kỳ trước">‹</button><b id="kyTen"></b><button class="chip" id="kyToi" aria-label="Kỳ sau">›</button><button class="chip" id="kyNay">Về hiện tại</button></div>
      <div class="ky-so" id="kySo"></div><div id="kyDs"></div></div>
    <div class="grid2">
      <div class="panel"><div class="ph"><h2 id="cfTen">Dòng tiền 12 tháng tới</h2><span class="muted" style="font-size:.82rem">Gốc + lãi theo lịch, chưa trả</span></div>
        <div class="chartbox"><canvas id="cf" aria-label="Biểu đồ tiền thu về và phải trả 12 tháng tới"></canvas></div>
        <div class="legend"><span id="cfThu"><i class="dot" style="background:var(--inv)"></i>Tiền thu về</span><span><i class="dot" style="background:var(--debt)"></i>Tiền phải trả</span></div></div>
      <div class="panel"><div class="ph"><h2>Cần chú ý</h2><span class="muted" id="alertCount" style="font-size:.82rem"></span></div><div class="alerts" id="alerts"></div></div>
    </div>
    <div class="grid2">
      <div class="panel"><div class="ph"><h2>Các khoản</h2><span class="muted" style="font-size:.82rem">Bấm vào từng khoản để xem lịch trả</span></div>
        <div class="tabs" role="tablist" id="tabs"></div><div id="locChip"></div><div class="list" id="list"></div></div>
      <div style="display:flex;flex-direction:column;gap:14px;min-width:0">
        <div class="panel"><div class="ph"><h2 id="mixTen">Cơ cấu</h2></div><div class="chartbox" style="height:210px"><canvas id="mix" aria-label="Cơ cấu nợ, cho vay, đầu tư"></canvas></div><div class="legend" id="mixLegend"></div></div>
        <div class="panel"><div class="ph"><h2>Mượn qua lại giữa 2 người</h2></div>
          <div class="flow" id="owes"></div>
          <details style="margin-top:10px"><summary class="muted" style="cursor:pointer;font-size:.86rem">Lịch sử chuyển trả</summary><div class="scroll" style="margin-top:8px"><table id="tx"></table></div></details></div>
      </div>
    </div>
    <div class="panel" id="pNguoi"><div class="ph"><h2>Theo từng người</h2><span class="muted" style="font-size:.82rem">Bấm một dòng để xem các khoản của người đó</span></div>
      <div class="tabs" role="tablist" id="tabsNguoi"></div><div class="list" id="bangNguoi"></div></div>
    <div class="panel"><div class="ph"><h2>Lịch đến hạn 60 ngày tới</h2><span class="muted" id="calSum" style="font-size:.82rem"></span></div><div class="cal" id="cal"></div></div>
    <div class="panel"><div class="ph"><h2>Nhật ký thay đổi</h2><span class="muted" style="font-size:.82rem">Ai thêm, sửa, ghi nhận gì và lúc nào</span></div><div class="scroll" style="max-height:300px"><table id="log"></table></div></div>
    </div>`;
  }

  function renderApp() {
    $('app').innerHTML = khung();
    $('bTk').onclick = moTaiKhoan;
    $('bHd').onclick = () => HuongDan.mo(coNhap());
    $('addBtn').onclick = () => moKhoan(null);
    if (coNhap()) {
      $('dbBtn').onclick = moDanhBa;
      $('addNb').onclick = () => moNoiBo(null);
      $('members').onclick = (e) => { const b = e.target.closest('[data-who]'); if (!b) return; xemAi = Number(b.dataset.who); veSoLieu(); };
    }
    $('tabsNguoi').onclick = (e) => { const b = e.target.closest('[data-phia]'); if (b) { phiaNguoi = b.dataset.phia; veSoLieu(); } };
    $('bangNguoi').onclick = (e) => { const r = e.target.closest('[data-ten]'); if (!r) return; loc = r.dataset.ten; tab = 'all'; veSoLieu(); $('list').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    $('bangNguoi').onkeydown = (e) => { if (e.key === 'Enter') { const r = e.target.closest('[data-ten]'); if (r) r.click(); } };
    $('locChip').onclick = (e) => { if (e.target.closest('[data-boloc]')) { loc = null; veSoLieu(); } };
    $('kyLoai').onclick = (e) => { const b = e.target.closest('[data-ky]'); if (b) { kyLoai = b.dataset.ky; kyBuoc = 0; veSoLieu(); } };
    $('kyLui').onclick = () => { kyBuoc--; veSoLieu(); };
    $('kyToi').onclick = () => { kyBuoc++; veSoLieu(); };
    $('kyNay').onclick = () => { kyBuoc = 0; veSoLieu(); };
    $('tabs').onclick = (e) => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; veSoLieu(); } };
    $('list').onclick = (e) => { const r = e.target.closest('.row'); if (r) moChiTiet(Number(r.dataset.id)); };
    $('list').onkeydown = (e) => { const r = e.target.closest('.row'); if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); moChiTiet(Number(r.dataset.id)); } };
    $('owes').onclick = (e) => {
      const p = e.target.closest('[data-pay]'); if (p) return moChuyenTra(Number(p.dataset.pay));
      const s = e.target.closest('[data-nbsua]'); if (s) return moNoiBo(Number(s.dataset.nbsua));
    };
    $('tx').onclick = (e) => { const b = e.target.closest('[data-xoatx]'); if (b) xoaHaiBuoc(b, () => api('DELETE', '/api/chuyen-tra/' + b.dataset.xoatx), 'Đã xóa lần chuyển.'); };
    veSoLieu();
  }

  /* Một dòng kỳ trả: ngày, đối tác, gốc + lãi, tiền ra/vào */
  function dongLich(k, e) {
    const ra = k.nhom === 'no';
    return `<div class="cday"><div class="d num">${String(e.ngay.getDate()).padStart(2, '0')}/${String(e.ngay.getMonth() + 1).padStart(2, '0')}<small>${e.ngay.toLocaleDateString('vi-VN', { weekday: 'short' })}</small></div>
        <div><b>${esc(k.doi_tac)}</b> <span class="muted">· ${esc(k.ten)}</span> ${e.tt === 'quahan' ? '<span class="pill crit">Quá hạn</span>' : e.tt === 'xong' ? `<span class="pill ok">Đã ${ra ? 'trả' : 'thu'}</span>` : ''}<div class="muted" style="font-size:.8rem">${av(k.chu_id)} ${e.goc ? `Gốc ${m(e.goc)}` : ''}${e.goc && e.lai ? ' + ' : ''}${e.lai ? `Lãi ${m(e.lai)}` : ''}</div></div>
        <div class="num ${ra ? 'out' : 'in'}" style="font-family:var(--f-display);font-weight:600">${ra ? '−' : '+'}${m(e.goc + e.lai)}</div></div>`;
  }

  /* Bộ lọc thời gian: tổng tiền trả / thu trong tháng, quý, năm đang chọn của ví đang xem */
  function veKy(its, nb, ai, coLoi) {
    const today = homNay(), K = T.kyKhoang(kyLoai, today, kyBuoc), truoc = T.kyKhoang(kyLoai, today, kyBuoc - 1);
    const r = T.tongKy(its, K.tu, K.den), rt = T.tongKy(its, truoc.tu, truoc.den);
    $('kyLoai').innerHTML = [['thang', 'Tháng'], ['quy', 'Quý'], ['nam', 'Năm']].map(([k, t]) => `<button class="tab" role="tab" aria-selected="${kyLoai === k}" data-ky="${k}">${t}</button>`).join('');
    $('kyTen').textContent = K.ten + (kyBuoc === 0 ? ' (hiện tại)' : '');
    $('kyNay').hidden = kyBuoc === 0;
    const tenTruoc = { thang: 'tháng trước', quy: 'quý trước', nam: 'năm trước' }[kyLoai];
    const soSanh = (a, b) => {
      if (!a && !b) return '';
      if (!b) return `<span class="muted">${tenTruoc} 0 đ</span>`;
      const p = Math.round((a - b) / b * 100);
      return p === 0 ? `<span class="muted">bằng ${tenTruoc}</span>` : `<span class="muted">${p > 0 ? '▲' : '▼'} ${Math.abs(p)}% so với ${tenTruoc}</span>`;
    };
    // mượn qua lại: tiền thực chuyển trong kỳ
    let nbTra = 0, nbNhan = 0;
    nb.forEach((k) => D.chuyen_tra.filter((t) => t.noi_bo_id === k.id).forEach((t) => {
      const d = T.pd(t.ngay); if (d < K.tu || d >= K.den) return;
      if (k.vay_id === ai) nbTra += t.so_tien; else nbNhan += t.so_tien;
    }));
    const o = (lbl, v, sub, cls) => `<div class="ky-o"><div class="lbl">${lbl}</div><div class="val num ${cls}">${m(v)}</div><div class="sub">${sub}</div></div>`;
    $('kySo').innerHTML =
      o('<i class="dot" style="background:var(--debt)"></i>Phải trả', r.gocTra + r.laiTra, `Gốc ${m(r.gocTra)}<br>Lãi ${m(r.laiTra)}<br>Đã trả ${m(r.daTra)}`, 'out') +
      (coLoi
        ? o('<i class="dot" style="background:var(--inv)"></i>Thu về', r.gocThu + r.laiThu, `Gốc ${m(r.gocThu)}<br>Lãi ${m(r.laiThu)}<br>Đã thu ${m(r.daThu)}`, 'in') +
          o('Lãi phải trả', r.laiTra, soSanh(r.laiTra, rt.laiTra), '') +
          o('Lãi thu về', r.laiThu, soSanh(r.laiThu, rt.laiThu), '')
        : o('Còn phải trả', Math.max(0, r.gocTra + r.laiTra - r.daTra), r.daTra ? `Đã trả ${m(r.daTra)}` : '', '') +
          o('Lãi phải trả', r.laiTra, soSanh(r.laiTra, rt.laiTra), '') +
          o('Gốc phải trả', r.gocTra, soSanh(r.gocTra, rt.gocTra), '')) +
      (nbTra || nbNhan ? `<div class="ky-dong">Mượn qua lại trong kỳ: ${nbTra ? `đã chuyển trả <b>${m(nbTra)}</b>` : ''}${nbTra && nbNhan ? ' · ' : ''}${nbNhan ? `đã nhận <b>${m(nbNhan)}</b>` : ''}</div>` : '') +
      (r.quaHan ? `<div class="ky-dong out"><b>${r.quaHan} kỳ quá hạn</b> trong ${K.ten.toLowerCase()}</div>` : '');
    $('kyDs').innerHTML = r.ds.length
      ? `<details ${r.ds.length <= 4 ? 'open' : ''}><summary class="muted" style="cursor:pointer;font-size:.88rem;padding:6px 0">Các kỳ trả trong ${K.ten.toLowerCase()} (${r.ds.length})</summary>${r.ds.map(({ k, e }) => dongLich(k, e)).join('')}</details>`
      : `<div class="muted" style="font-size:.88rem">Không có kỳ trả nào trong ${K.ten.toLowerCase()}.</div>`;
  }

  function veSoLieu() {
    const today = homNay();
    const ai = xemAi;
    if (coNhap()) {
      $('members').innerHTML = '<span class="muted chu-xem" style="font-size:.84rem;align-self:center">Xem số liệu của:</span>' +
        D.nguoi.map((x) => `<button class="chip" aria-pressed="${ai === x.id}" data-who="${x.id}">${av(x.id)}Ví ${esc(x.ten)}</button>`).join('');
    }
    const its = D.khoan.filter((k) => ai === 'all' || k.chu_id === ai);
    const nb = D.noi_bo.filter((k) => ai === 'all' || k.cho_vay_id === ai || k.vay_id === ai);
    const tenAi = ai === 'all' ? 'cả hai người' : nguoi(ai).ten;

    /* tóm tắt */
    const sum = (f) => its.filter(f).reduce((a, k) => a + k.conLai, 0);
    let ts = sum((k) => k.nhom !== 'no'), no = sum((k) => k.nhom === 'no'), nbThu = 0, nbTra = 0;
    if (ai !== 'all') nb.forEach((k) => { const v = k.st.gocCon + k.st.laiCon; if (k.cho_vay_id === ai) nbThu += v; else nbTra += v; });
    ts += nbThu; no += nbTra;
    const y = today.getFullYear(), mo = today.getMonth();
    const cacNo = its.filter((k) => k.nhom === 'no');
    // Ví này có khoản sinh lời không (cho vay, đầu tư, người nhà đang nợ)? Không có thì màn chính chỉ nói về nợ.
    const coLoi = ts > 0 || its.some((k) => k.nhom !== 'no');
    let gocNo = 0, gocDaTra = 0;
    cacNo.forEach((k) => { gocNo += Number(k.goc) || 0; gocDaTra += (k.daTraPct || 0) * (Number(k.goc) || 0); });
    nb.forEach((k) => { if (ai !== 'all' && k.vay_id === ai) { gocNo += k.st.gocCon + k.st.gocTra; gocDaTra += k.st.gocTra; } });
    const pctTra = gocNo ? Math.round(gocDaTra / gocNo * 100) : 0;
    let gocThang = 0, laiThang = 0, daTraThang = 0, laiThu = 0;
    its.forEach((k) => k.lich.forEach((e) => {
      if (e.ngay.getFullYear() !== y || e.ngay.getMonth() !== mo) return;
      if (k.nhom === 'no') { gocThang += e.goc; laiThang += e.lai; if (e.tt === 'xong') daTraThang += e.goc + e.lai; } else laiThu += e.lai;
    }));
    let kyGan = null; cacNo.forEach((k) => { if (k.kyToi && (!kyGan || k.kyToi.ngay < kyGan.e.ngay)) kyGan = { k, e: k.kyToi }; });
    const soQuaHan = cacNo.reduce((a, k) => a + k.quaHan.length, 0);
    $('hero').className = 'hero panel' + (coLoi ? ' co-loi' : '');
    $('hero').innerHTML = `
      <div class="tile big"><span class="lbl">Nợ còn phải trả${ai === 'all' ? '' : ` · Ví ${esc(tenAi)}`}</span><span class="val num">${m(no)}</span>
        <div class="bar hero-bar" aria-hidden="true"><i style="width:${pctTra}%"></i></div>
        <span class="sub">Đã trả <b>${pctTra}%</b> gốc · ${cacNo.length} khoản${nbTra ? ` · gồm ${m(nbTra)} mượn người nhà` : ''}</span>
        ${coLoi ? `<span class="sub">Tài sản ròng <b>${m(ts - no)}</b> (cho vay, đầu tư ${m(ts)} − nợ)</span>` : ''}</div>
      <div class="tile"><span class="lbl">Tháng ${mo + 1} phải trả</span><span class="val num out">${m(gocThang + laiThang)}</span>
        <span class="sub">Gốc ${m(gocThang)} · Lãi ${m(laiThang)}${daTraThang ? `<br>Đã trả ${m(daTraThang)}` : ''}</span></div>
      <div class="tile"><span class="lbl">Kỳ trả tới</span>${kyGan
        ? `<span class="val num">${m(kyGan.e.goc + kyGan.e.lai)}</span><span class="sub">${dd(kyGan.e.ngay)} · ${esc(kyGan.k.doi_tac)}${soQuaHan ? `<br><b class="out">${soQuaHan} kỳ quá hạn</b>` : ''}</span>`
        : `<span class="val num">—</span><span class="sub">${soQuaHan ? `<b class="out">${soQuaHan} kỳ quá hạn</b>` : 'Không còn kỳ nào'}</span>`}</div>
      ${coLoi ? `<div class="tile"><span class="lbl"><i class="dot" style="background:var(--lend)"></i>Cho vay + Đầu tư</span><span class="val num in">${m(ts)}</span><span class="sub">${nbThu ? `gồm ${m(nbThu)} người nhà đang nợ · ` : ''}lãi tháng ${mo + 1}: +${m(laiThu)}</span></div>` : ''}`;

    /* dòng tiền 12 tháng */
    const labels = [], thu = [], chi = [];
    for (let k = 0; k < 12; k++) {
      const d = new Date(y, mo + k, 1); labels.push(`T${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`);
      let a = 0, b = 0;
      its.forEach((kh) => kh.lich.forEach((e) => { if (e.tt !== 'xong' && e.ngay.getFullYear() === d.getFullYear() && e.ngay.getMonth() === d.getMonth()) { if (kh.nhom === 'no') b += e.goc + e.lai; else a += e.goc + e.lai; } }));
      thu.push(a); chi.push(-b);
    }
    veDongTien(labels, thu, chi, coLoi && thu.some(Boolean));

    /* cảnh báo */
    const al = [];
    its.forEach((k) => k.quaHan.forEach((e) => {
      const tre = T.soNgay(e.ngay, today);
      al.push({ lv: 'crit', tag: `Quá hạn ${tre} ngày`, o: 0, t: k.nhom === 'no' ? `Chưa trả <b>${esc(k.doi_tac)}</b> ${m(e.goc + e.lai)} (hạn ${dd(e.ngay)})` : `<b>${esc(k.doi_tac)}</b> chưa trả ${m(e.goc + e.lai)} (hạn ${dd(e.ngay)})` });
    }));
    its.forEach((k) => {
      const e = k.kyToi; if (!e) return;
      const con = T.soNgay(today, e.ngay);
      if (e.goc >= Number(k.goc) * 0.99 && con <= 75) al.push({ lv: 'warn', o: 1, tag: `Đáo hạn gốc sau ${con} ngày`, t: k.nhom === 'no' ? `Chuẩn bị <b>${m(e.goc + e.lai)}</b> trả ${esc(k.doi_tac)} ngày ${dd(e.ngay)}` : `<b>${esc(k.doi_tac)}</b>: nhận về ${m(e.goc + e.lai)} ngày ${dd(e.ngay)}` });
      else if (con <= 7 && k.nhom === 'no') al.push({ lv: 'warn', o: 2, tag: con === 0 ? 'Đến hạn hôm nay' : `Đến hạn sau ${con} ngày`, t: `Trả ${esc(k.doi_tac)} ${m(e.goc + e.lai)} ngày ${dd(e.ngay)}` });
    });
    its.forEach((k) => (k.doi_lai || []).forEach((x) => {
      const con = T.soNgay(today, x.tu); if (con <= 0 || con > 180) return;
      const truoc = k.lich.filter((e) => T.iso(e.ngay) <= x.tu).pop(), sau = k.lich.find((e) => T.iso(e.ngay) > x.tu && e.lai_suat === Number(x.lai));
      const chenh = truoc && sau ? (sau.goc + sau.lai) - (truoc.goc + truoc.lai) : null;
      al.push({ lv: 'warn', o: 1, tag: `Đổi lãi suất sau ${con} ngày`, t: `<b>${esc(k.doi_tac)}</b> áp lãi ${x.lai}%/năm từ ${dd(x.tu)}${chenh != null ? `: mỗi kỳ ${chenh >= 0 ? 'tăng' : 'giảm'} khoảng <b>${m(Math.abs(chenh))}</b>` : ''}` });
    }));
    nb.forEach((k) => {
      if (k.st.laiCon < 1e5) return;
      al.push({ lv: 'info', o: 3, tag: 'Lãi mượn người nhà chưa trả', t: `${esc(nguoi(k.vay_id).ten)} còn nợ ${esc(nguoi(k.cho_vay_id).ten)} <b>${m(k.st.laiCon)}</b> tiền lãi` });
    });
    al.sort((a, b) => a.o - b.o);
    $('alertCount').textContent = al.length + ' mục';
    $('alerts').innerHTML = al.map((a) => `<div class="alert ${a.lv === 'crit' ? 'crit' : a.lv === 'info' ? 'info' : ''}"><span class="ic">${a.lv === 'crit' ? '!' : a.lv === 'info' ? '⇄' : '⏱'}</span><div><div class="tag">${a.tag}</div><div>${a.t}</div></div></div>`).join('') || '<div class="muted">Không có gì cần chú ý.</div>';

    /* danh sách khoản */
    const dem = { all: its.length, no: 0, chovay: 0, dautu: 0 }; its.forEach((i) => dem[i.nhom]++);
    // Ẩn tab không có khoản; chỉ có 1 nhóm thì ẩn luôn thanh tab
    if (tab !== 'all' && !dem[tab]) tab = 'all';
    const tabCo = [['all', 'Tất cả'], ['no', 'Đang nợ'], ['chovay', 'Cho vay'], ['dautu', 'Đầu tư']].filter(([k]) => k === 'all' || dem[k]);
    $('tabs').hidden = tabCo.length <= 2;
    $('tabs').innerHTML = tabCo.map(([k, t]) => `<button class="tab" role="tab" aria-selected="${tab === k}" data-tab="${k}">${t} <span class="muted">${dem[k]}</span></button>`).join('');
    $('locChip').innerHTML = loc ? `<button class="chip" data-boloc="1" style="margin-bottom:8px">Đang xem: <b>${esc(loc)}</b> &nbsp;✕ Bỏ lọc</button>` : '';
    const ds = its.filter((k) => (tab === 'all' || k.nhom === tab) && (!loc || k.doi_tac.toLowerCase() === loc.toLowerCase())).sort((a, b) => b.conLai - a.conLai);
    $('list').innerHTML = ds.map((k) => {
      const st = k.quaHan.length ? '<span class="pill crit">Quá hạn</span>' : k.kyToi && T.soNgay(today, k.kyToi.ngay) <= 7 && k.nhom === 'no' ? '<span class="pill warn">Sắp đến hạn</span>' : '';
      const pct = k.daTraPct == null ? null : Math.round(k.daTraPct * 100);
      const sub = k.cach === 'tai_san' ? `Mua ${m(k.goc)} · chênh lệch <span class="${k.gia_tri >= k.goc ? 'in' : 'out'}">${k.gia_tri >= k.goc ? '+' : '−'}${m(Math.abs(k.gia_tri - k.goc))}</span>`
        : `${k.kyToi ? `Kỳ tới ${dd(k.kyToi.ngay)}: ${m(k.kyToi.goc + k.kyToi.lai)}` : 'Đã hết lịch'} · ${pct}% gốc đã ${k.nhom === 'no' ? 'trả' : 'thu'}`;
      return `<div class="row" tabindex="0" data-id="${k.id}">
        <div><div class="name">${esc(k.ten)} · ${esc(k.doi_tac)} ${st}${k.rieng_cua && k.rieng_cua !== toi().id ? ` <span class="pill">${esc(nguoi(k.rieng_cua).ten)} tự nhập</span>` : ''}</div><div class="meta">${av(k.chu_id)} ${sub}</div></div>
        <div class="amt num" style="color:var(${k.nhom === 'no' ? '--crit' : '--ink'})">${k.nhom === 'no' ? '−' : ''}${m(k.conLai)}</div>
        ${pct == null ? '' : `<div class="bar"><i style="width:${pct}%;background:var(${NHOM[k.nhom].c})"></i></div>`}</div>`;
    }).join('') || `<div class="empty">Chưa có khoản nào. Bấm "+ Thêm khoản" để nhập khoản đầu tiên.</div>`;

    /* theo từng người */
    if (phiaNguoi === 'chovay' && !its.some((k) => k.nhom === 'chovay')) phiaNguoi = 'no';
    const nhomPhia = phiaNguoi === 'no' ? ['no'] : ['chovay'];
    const theo = {};
    its.filter((k) => nhomPhia.includes(k.nhom)).forEach((k) => {
      const key = k.doi_tac.trim().toLowerCase();
      const g = theo[key] || (theo[key] = { ten: k.doi_tac.trim(), so: 0, goc: 0, laiThang: 0, kyToi: null, kyKhoan: null, quaHan: 0 });
      g.so++; g.goc += k.conLai; g.quaHan += k.quaHan.length;
      k.lich.forEach((e) => { if (e.ngay.getFullYear() === y && e.ngay.getMonth() === mo) g.laiThang += e.lai; });
      if (k.kyToi && (!g.kyToi || k.kyToi.ngay < g.kyToi.ngay)) { g.kyToi = k.kyToi; }
    });
    const nhomNguoi = Object.values(theo).sort((a, b) => b.goc - a.goc);
    const lon = Math.max(1, ...nhomNguoi.map((g) => g.goc));
    const demNo = new Set(its.filter((k) => k.nhom === 'no').map((k) => k.doi_tac.trim().toLowerCase())).size;
    const demCho = new Set(its.filter((k) => k.nhom === 'chovay').map((k) => k.doi_tac.trim().toLowerCase())).size;
    $('tabsNguoi').hidden = !demCho;
    $('tabsNguoi').innerHTML = `<button class="tab" role="tab" aria-selected="${phiaNguoi === 'no'}" data-phia="no">Mình đang nợ <span class="muted">${demNo}</span></button><button class="tab" role="tab" aria-selected="${phiaNguoi === 'chovay'}" data-phia="chovay">Đang nợ mình <span class="muted">${demCho}</span></button>`;
    const dtTheoTen = (ten) => (D.doi_tac || []).find((d) => d.ten.toLowerCase() === ten.toLowerCase());
    $('bangNguoi').innerHTML = nhomNguoi.length ? nhomNguoi.map((g) => {
      const dt = dtTheoTen(g.ten);
      const chiTiet = [`${g.so} khoản`, dt && dt.dien_thoai ? esc(dt.dien_thoai) : '', g.laiThang ? `lãi tháng ${mo + 1}: ${m(g.laiThang)}` : '', g.kyToi ? `kỳ tới ${dd(g.kyToi.ngay)}: ${m(g.kyToi.goc + g.kyToi.lai)}` : ''].filter(Boolean).join(' · ');
      return `<div class="row" tabindex="0" data-ten="${esc(g.ten)}">
        <div><div class="name">${esc(g.ten)} ${g.quaHan ? '<span class="pill crit">Quá hạn</span>' : ''}</div><div class="meta">${chiTiet}</div></div>
        <div class="amt num" style="color:var(${phiaNguoi === 'no' ? '--crit' : '--ink'})">${phiaNguoi === 'no' ? '−' : ''}${m(g.goc)}</div>
        <div class="bar"><i style="width:${Math.round(g.goc / lon * 100)}%;background:var(${phiaNguoi === 'no' ? '--debt' : '--lend'})"></i></div></div>`;
    }).join('') : `<div class="empty">${phiaNguoi === 'no' ? 'Chưa có khoản đi vay nào.' : 'Chưa có khoản cho vay nào.'}</div>`;

    /* cơ cấu */
    // Chỉ có nợ: vòng tròn chia nợ theo từng người cho vay; có cho vay/đầu tư thì chia theo nhóm
    let nhomSo;
    if (coLoi) nhomSo = ['no', 'chovay', 'dautu'].map((k) => ({ t: NHOM[k].ten, c: css(NHOM[k].c), v: its.filter((i) => i.nhom === k).reduce((a, i) => a + i.conLai, 0) }));
    else {
      const g = {}; cacNo.forEach((k) => { const t = k.doi_tac.trim(), key = t.toLowerCase(); (g[key] || (g[key] = { t, v: 0 })).v += k.conLai; });
      nb.forEach((k) => { if (k.vay_id === ai) { const t = nguoi(k.cho_vay_id).ten, key = t.toLowerCase(); (g[key] || (g[key] = { t, v: 0 })).v += k.st.gocCon + k.st.laiCon; } });
      let ds = Object.values(g).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
      if (ds.length > 6) ds = [...ds.slice(0, 5), { t: 'Khác', v: ds.slice(5).reduce((a, x) => a + x.v, 0) }];
      nhomSo = ds.map((x, i) => ({ ...x, c: MAU_NO[i % MAU_NO.length] }));
    }
    $('mixTen').textContent = coLoi ? 'Cơ cấu' : 'Nợ theo người cho vay';
    veCoCau(nhomSo);
    $('mixLegend').innerHTML = nhomSo.map((g) => `<span><i class="dot" style="background:${g.c}"></i>${esc(g.t)} <b class="num" style="color:var(--ink)">${m(g.v)}</b></span>`).join('') || '<span class="muted">Chưa có khoản nợ nào.</span>';

    /* mượn qua lại */
    $('owes').innerHTML = nb.length ? nb.map((k) => {
      const st = k.st, pct = Math.round(st.daTraPct * 100);
      const tieuDe = ai !== 'all' && k.vay_id === ai ? `${esc(nguoi(ai).ten)} đang nợ ${esc(nguoi(k.cho_vay_id).ten)}` : `${esc(nguoi(k.vay_id).ten)} đang nợ ${esc(nguoi(k.cho_vay_id).ten)}`;
      const laMinhNo = ai !== 'all' && k.vay_id === ai;
      return `<div class="nb">
        <div class="nbh">${av(k.vay_id)}<div style="flex:1;min-width:0"><b>${tieuDe}</b><div class="muted" style="font-size:.8rem">${esc(k.ghi_chu || 'Mượn')} · ${dd(k.ngay)} · ${Number(k.lai_thang) ? `${k.lai_thang}%/tháng, ${k.cach_tinh === 'co_dinh' ? 'lãi cố định trên gốc ban đầu' : 'lãi theo dư nợ từng ngày'}` : 'không lãi'}</div></div>
          <div class="amt num ${laMinhNo ? 'out' : 'in'}">${m(st.gocCon + st.laiCon)}</div></div>
        <div class="bar"><i style="width:${pct}%;background:var(--accent)"></i></div>
        <div class="nbk"><span>Gốc còn <b class="num">${m(st.gocCon)}</b></span><span>Đã trả gốc <b class="num">${m(st.gocTra)}</b></span>${Number(k.lai_thang) ? `<span>Lãi chưa trả <b class="num">${m(st.laiCon)}</b></span><span>Đã trả lãi <b class="num">${m(st.laiTra)}</b></span>` : ''}</div>
        ${coNhap() ? `<div class="acts">${st.gocCon > 0 || st.laiCon > 0 ? `<button class="btn sm" data-pay="${k.id}">Ghi nhận chuyển trả</button>` : ''}<button class="btn sm ghost" data-nbsua="${k.id}">Sửa</button></div>` : ''}</div>`;
    }).join('') : `<div class="empty">${coNhap() ? 'Chưa có khoản mượn nào giữa 2 người.' : 'Không có khoản mượn nào.'}</div>`;
    const nbIds = nb.map((k) => k.id);
    const txs = D.chuyen_tra.filter((t) => nbIds.includes(t.noi_bo_id)).slice().sort((a, b) => (a.ngay < b.ngay ? 1 : -1));
    $('tx').innerHTML = '<tr><th>Ngày</th><th>Người trả → nhận</th><th>Loại</th><th>Số tiền</th>' + (coNhap() ? '<th></th>' : '') + '</tr>' + txs.map((t) => {
      const k = D.noi_bo.find((x) => x.id === t.noi_bo_id);
      return `<tr><td>${dd(t.ngay)}</td><td>${esc(nguoi(k.vay_id).ten)} → ${esc(nguoi(k.cho_vay_id).ten)}</td><td><span class="pill ${t.loai === 'goc' ? 'ok' : 'warn'}">${t.loai === 'goc' ? 'Trả gốc' : 'Trả lãi'}</span></td><td class="num">${m(t.so_tien, 1)}</td>${coNhap() ? `<td><button class="chip" data-xoatx="${t.id}">Xóa</button></td>` : ''}</tr>`;
    }).join('');

    /* lịch 60 ngày */
    const het = new Date(today); het.setDate(het.getDate() + 60);
    const ev = [];
    its.forEach((k) => k.lich.forEach((e) => { if ((e.ngay >= today && e.ngay <= het) || e.tt === 'quahan') ev.push({ k, e }); }));
    ev.sort((a, b) => a.e.ngay - b.e.ngay);
    let tin = 0, tout = 0; ev.forEach(({ k, e }) => { if (k.nhom === 'no') tout += e.goc + e.lai; else tin += e.goc + e.lai; });
    $('calSum').innerHTML = tin ? `Thu <b class="in">+${m(tin)}</b> · Trả <b class="out">−${m(tout)}</b>` : `Phải trả <b class="out">${m(tout)}</b>`;
    $('cal').innerHTML = ev.map(({ k, e }) => dongLich(k, e)).join('') || '<div class="muted">Không có khoản nào đến hạn.</div>';
    veKy(its, nb, ai, coLoi);

    /* nhật ký */
    $('log').innerHTML = '<tr><th>Lúc</th><th>Người làm</th><th style="text-align:left">Việc</th></tr>' + D.nhat_ky.map((l) => {
      const t = new Date(l.luc);
      return `<tr><td>${t.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} ${t.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</td><td>${esc(l.nguoi || '')}</td><td style="text-align:left;white-space:normal">${esc(l.viec)}</td></tr>`;
    }).join('');
  }

  /* ---------- biểu đồ ---------- */
  function nen() { Chart.defaults.font.family = css('--f-body'); Chart.defaults.color = css('--muted'); }
  function veDongTien(labels, thu, chi, haiChieu) {
    nen(); charts.cf && charts.cf.destroy();
    // Chỉ có nợ: vẽ cột phải trả hướng lên cho dễ đọc, bỏ phần "thu về"
    $('cfTen').textContent = haiChieu ? 'Dòng tiền 12 tháng tới' : 'Phải trả 12 tháng tới';
    $('cfThu').hidden = !haiChieu;
    if (!haiChieu) { chi = chi.map((v) => -v); thu = null; }
    const trong = ![...(thu || []), ...chi].some(Boolean); // chưa có khoản nào: giữ trục ±1 triệu, khỏi hiện "1 đ, 1 đ"
    charts.cf = new Chart($('cf'), {
      type: 'bar',
      data: { labels, datasets: [
        ...(thu ? [{ label: 'Thu về', data: thu, backgroundColor: css('--inv'), borderRadius: 4, borderSkipped: 'start', stack: 's' }] : []),
        { label: 'Phải trả', data: chi, backgroundColor: css('--debt'), borderRadius: 4, borderSkipped: 'start', stack: 's' }] },
      options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${m(Math.abs(c.raw))}`, footer: (it) => (thu ? 'Ròng: ' + m(it.reduce((a, i) => a + i.raw, 0)) : '') } } },
        scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ...(trong ? (thu ? { min: -1e6, max: 1e6 } : { min: 0, max: 1e6 }) : {}), grid: { color: css('--line') }, border: { display: false }, ticks: { callback: (v) => m(v) } } } },
    });
  }
  function veCoCau(g) {
    nen(); charts.mix && charts.mix.destroy();
    charts.mix = new Chart($('mix'), {
      type: 'doughnut',
      data: { labels: g.map((x) => x.t), datasets: [{ data: g.map((x) => x.v), backgroundColor: g.map((x) => x.c), borderColor: css('--panel'), borderWidth: 2 }] },
      options: { maintainAspectRatio: false, cutout: '64%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.label}: ${m(c.raw)}` } } } },
    });
  }

  /* ---------- khung nổi ---------- */
  function moSheet(html) {
    $('sheet').innerHTML = `<div class="sheet-top"><button class="hd-nut" id="xHd" aria-label="Hướng dẫn từng bước" title="Hướng dẫn từng bước">?</button><button class="close" id="x">Đóng</button></div>${html}`;
    $('modal').hidden = false; $('x').onclick = dong; $('xHd').onclick = () => HuongDan.mo(coNhap());
  }
  function dong() { $('modal').hidden = true; }
  function toast(t) { const el = $('toast'); el.textContent = t; el.hidden = false; clearTimeout(el._t); el._t = setTimeout(() => { el.hidden = true; }, 4500); }
  function oTien(el) { el.addEventListener('input', () => { const v = soTien(el.value); el.value = v ? v.toLocaleString('vi-VN') : ''; }); }
  // Xóa cần bấm 2 lần để tránh lỡ tay
  function xoaHaiBuoc(btn, lam, xong) {
    if (btn.dataset.chac !== '1') { btn.dataset.chac = '1'; btn.textContent = 'Bấm lần nữa để xóa'; setTimeout(() => { if (btn.isConnected) { btn.dataset.chac = ''; btn.textContent = 'Xóa'; } }, 4000); return; }
    btn.disabled = true;
    lam().then(() => { dong(); toast(xong); return taiLai(); }).catch((e) => { toast(e.message); btn.disabled = false; });
  }
  async function gui(form, lam, xong) {
    const b = form.querySelector('button[type=submit]'), er = form.querySelector('.ferr');
    b.disabled = true; er.hidden = true;
    try { await lam(); dong(); toast(xong); await taiLai(); }
    catch (e) { er.textContent = e.message; er.hidden = false; b.disabled = false; }
  }

  /* ---------- chi tiết một khoản ---------- */
  function moChiTiet(id) {
    const k = D.khoan.find((x) => x.id === id); if (!k) return;
    const ky = k.lich.findIndex((e) => e.tt === 'chua');
    const sua = suaKhoan(k);
    const laiTxt = k.cach === 'tai_san' ? '—' : k.don_vi_lai === 'thang' ? `${+(k.lai / 12).toFixed(4)}%/tháng` : `${k.lai}%/năm`;
    moSheet(`<div><div class="muted" style="font-size:.8rem">${NHOM[k.nhom].ten} · ${av(k.chu_id)} ${esc(nguoi(k.chu_id).ten)}</div>
      <h2 style="font-size:1.3rem">${esc(k.ten)} · ${esc(k.doi_tac)}</h2><div class="muted" style="font-size:.86rem">${CACH[k.cach]}${k.ghi_chu ? '. ' + esc(k.ghi_chu) : ''}</div></div>
      ${sua ? `<div class="acts"><button class="btn sm" id="bSua">Sửa khoản</button><button class="btn sm ghost" id="bXoa">Xóa</button></div>` : k.rieng_cua ? `<div class="hint">${esc(nguoi(k.rieng_cua).ten)} tự nhập khoản này, chỉ ${esc(nguoi(k.rieng_cua).ten)} sửa, xóa được.</div>` : ''}
      <div class="kv">
        <div><span>Số tiền gốc</span><b class="num">${m(k.goc)}</b></div>
        <div><span>${k.cach === 'tai_san' ? 'Giá ước tính' : 'Còn lại'}</span><b class="num">${m(k.conLai)}</b></div>
        <div><span>Lãi suất</span><b>${laiTxt}${(k.doi_lai || []).length ? ` → ${k.doi_lai.map((x) => x.lai + '%').join(' → ')}` : ''}</b></div>
        <div><span>Bắt đầu</span><b>${dd(k.bat_dau)}</b></div>
        <div><span>Kỳ trả</span><b>${k.ngay_chot ? 'Ngày ' + k.ngay_chot : k.lich.length ? 'Theo ngày bắt đầu' : '—'}${CO_CHU_KY.includes(k.cach) ? ', ' + CHU_KY[k.chu_ky || 1].toLowerCase() : ''}</b></div>
        <div><span>Đáo hạn</span><b>${k.daoHan ? dd(k.daoHan) : '—'}</b></div>
        <div><span>${k.cach === 'tai_san' ? 'Chênh lệch' : 'Tổng lãi cả kỳ'}</span><b class="num">${k.cach === 'tai_san' ? m(k.gia_tri - k.goc) : m(k.tongLai)}</b></div>
        ${k.cach === 'tai_san' ? '' : `<div><span>Kỳ đã qua</span><b>${k.tu_dong_da_tra ? 'Tự coi là đã trả' : 'Phải ghi nhận'}</b></div>`}
      </div>
      ${k.lich.length > 2 ? '<div class="chartbox" style="height:180px"><canvas id="bal" aria-label="Dư nợ theo thời gian"></canvas></div>' : ''}
      ${k.lich.length ? `<div class="scroll" id="lichTra"><table><tr><th>Kỳ</th><th>Ngày</th><th>Gốc</th><th>Lãi</th><th>Tổng</th><th>Dư sau kỳ</th>${sua ? '<th></th>' : ''}</tr>
        ${k.lich.map((e, i) => `<tr class="${e.tt === 'quahan' ? 'over' : i === ky ? 'next' : e.tt === 'xong' ? 'past' : ''}"><td>${i + 1}${e.tt === 'xong' ? ' ✓' : e.tt === 'quahan' ? ' !' : ''}</td><td>${dd(e.ngay)}</td><td class="num">${m(e.goc, 1)}</td><td class="num">${m(e.lai, 1)}</td><td class="num">${m(e.goc + e.lai, 1)}</td><td class="num">${m(e.du, 1)}</td>
          ${sua ? `<td>${e.tt === 'xong' ? `<button class="chip" data-ky="${T.iso(e.ngay)}" data-tt="chua_tra">Chưa ${k.nhom === 'no' ? 'trả' : 'thu'}</button>` : `<button class="chip" data-ky="${T.iso(e.ngay)}" data-tt="da_tra">Đã ${k.nhom === 'no' ? 'trả' : 'thu'}</button>`}</td>` : ''}</tr>`).join('')}</table></div>
        <div class="hint">✓ đã ${k.nhom === 'no' ? 'trả' : 'thu'} · dòng tô màu là kỳ tới · đỏ là quá hạn${k.cach === 'goc_deu' ? ' · lãi tính theo số ngày thực tế/365 như ngân hàng' : ''}</div>` : ''}`);
    const nx = $('sheet').querySelector('tr.next'); if (nx) { const sc = $('lichTra'); sc.scrollTop = nx.offsetTop - sc.clientHeight / 2; }
    if (sua) {
      $('bSua').onclick = () => moKhoan(k.id);
      $('bXoa').onclick = (e) => xoaHaiBuoc(e.currentTarget, () => api('DELETE', '/api/khoan/' + k.id), 'Đã xóa khoản.');
      $('sheet').querySelectorAll('[data-ky]').forEach((b) => { b.onclick = async () => {
        b.disabled = true;
        try { await api('POST', `/api/khoan/${k.id}/ky`, { ky_ngay: b.dataset.ky, trang_thai: b.dataset.tt }); await taiLai(); moChiTiet(k.id); toast('Đã ghi nhận.'); }
        catch (e) { toast(e.message); b.disabled = false; }
      }; });
    }
    if (k.lich.length > 2) {
      charts.bal && charts.bal.destroy();
      const c = css(NHOM[k.nhom].c), idx = Math.max(ky, 0);
      charts.bal = new Chart($('bal'), {
        type: 'line',
        data: { labels: k.lich.map((e) => `${e.ngay.getMonth() + 1}/${String(e.ngay.getFullYear()).slice(2)}`), datasets: [{ label: 'Dư nợ', data: k.lich.map((e) => e.du), borderColor: c, backgroundColor: c + '22', fill: true, borderWidth: 2, tension: 0.2, pointRadius: k.lich.map((e, i) => (i === idx ? 5 : 0)), pointBackgroundColor: c }] },
        options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (x) => ' Dư: ' + m(x.raw) } } }, scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } }, y: { grid: { color: css('--line') }, border: { display: false }, ticks: { callback: (v) => m(v) } } } },
      });
    }
  }

  /* ---------- thêm / sửa khoản ---------- */
  function moKhoan(id) {
    const k = id ? D.khoan.find((x) => x.id === id) : null;
    const v = k || { nhom: '', chu_id: xemAi || D.toi.id, bat_dau: T.iso(homNay()), ky_han: 12, cach: 'nien_kim', lai: '', don_vi_lai: 'nam', doi_lai: [], tu_dong_da_tra: false };
    const laiHien = v.lai === '' ? '' : v.don_vi_lai === 'thang' ? +(v.lai / 12).toFixed(4) : v.lai;
    const r = (n, val, lbl, chk) => `<label><input type="radio" name="${n}" value="${val}" ${chk ? 'checked' : ''}> ${lbl}</label>`;
    moSheet(`<h2 style="font-size:1.25rem">${k ? 'Sửa khoản' : 'Thêm khoản mới'}</h2>
    <form id="kf" class="pf" novalidate>
      <fieldset class="seg" id="gNhom"><legend>Loại khoản${k ? '' : ' (bấm chọn)'}</legend>${r('nhom', 'no', 'Đi vay', v.nhom === 'no')}${r('nhom', 'chovay', 'Cho vay', v.nhom === 'chovay')}${r('nhom', 'dautu', 'Đầu tư', v.nhom === 'dautu')}</fieldset>
      ${coNhap() && !v.rieng_cua ? `<fieldset class="seg" id="gChu"><legend>Khoản của ai</legend>${D.nguoi.map((x) => r('chu', x.id, esc(x.ten), v.chu_id === x.id)).join('')}</fieldset>` : ''}
      <div class="f2"><div><label for="fTen">Tên khoản</label><input id="fTen" maxlength="200" value="${esc(v.ten || '')}" placeholder="Vay mua xe"></div><div><label for="fDt">Ngân hàng / người</label><input id="fDt" maxlength="200" list="dsDoiTac" autocomplete="off" value="${esc(v.doi_tac || '')}" placeholder="Gõ hoặc chọn trong danh bạ"><datalist id="dsDoiTac">${(D.doi_tac || []).map((d) => `<option value="${esc(d.ten)}"></option>`).join('')}</datalist></div></div>
      <label for="fCach">Cách trả</label><select id="fCach">${Object.keys(CACH).map((c) => `<option value="${c}" ${v.cach === c ? 'selected' : ''}>${CACH[c]}</option>`).join('')}</select>
      <div class="f2"><div><label for="fGoc">Số tiền gốc (đồng)</label><input id="fGoc" inputmode="numeric" value="${v.goc ? Number(v.goc).toLocaleString('vi-VN') : ''}" placeholder="500.000.000"></div><div><label for="fBd">Ngày bắt đầu</label><input id="fBd" type="date" value="${esc(v.bat_dau)}"></div></div>
      <div class="f2" id="gGt"><div><label for="fGt">Giá ước tính hiện nay (đồng)</label><input id="fGt" inputmode="numeric" value="${v.gia_tri ? Number(v.gia_tri).toLocaleString('vi-VN') : ''}"></div></div>
      <div id="gKy">
        <div class="f2"><div><label for="fKy">Kỳ hạn (tháng)</label><input id="fKy" inputmode="numeric" value="${esc(v.ky_han || '')}"></div><div id="gChuKy"><label for="fChuKy">Trả gốc / lãi</label><select id="fChuKy">${Object.keys(CHU_KY).map((c) => `<option value="${c}" ${Number(v.chu_ky || 1) === Number(c) ? 'selected' : ''}>${CHU_KY[c]}</option>`).join('')}</select></div></div>
        <div class="f2" style="margin-top:8px"><div><label for="fChot">Ngày chốt (ngày mấy trong tháng)</label><input id="fChot" inputmode="numeric" value="${esc(v.ngay_chot || '')}" placeholder="Trống = theo ngày bắt đầu"></div><div></div></div>
        <div class="f2" id="gLai" style="margin-top:8px"><div><label for="fLai">Lãi suất</label><input id="fLai" inputmode="decimal" value="${esc(laiHien)}" placeholder="10,5"></div><div><label for="fDv">Đơn vị</label><select id="fDv"><option value="nam" ${v.don_vi_lai !== 'thang' ? 'selected' : ''}>%/năm</option><option value="thang" ${v.don_vi_lai === 'thang' ? 'selected' : ''}>%/tháng</option></select></div></div>
        <div id="gDoi" style="margin-top:8px"><label>Lãi suất thay đổi (hết ưu đãi, thả nổi...)</label><div id="doiLai" style="display:flex;flex-direction:column;gap:8px;margin-top:6px"></div>
          <button type="button" class="btn sm ghost" id="themDoi" style="margin-top:6px">+ Thêm lần đổi lãi</button></div>
        <label class="check" style="margin-top:10px"><input type="checkbox" id="fTd" ${v.tu_dong_da_tra ? 'checked' : ''}> Kỳ đã qua tự coi là đã ${'trả/thu'} (ngân hàng trừ tự động). Bỏ chọn nếu muốn tự ghi nhận từng kỳ.</label>
      </div>
      <label for="fGc">Ghi chú</label><textarea id="fGc" maxlength="1000">${esc(v.ghi_chu || '')}</textarea>
      <div class="preview" id="prev"></div>
      <div class="out ferr" hidden></div>
      <button class="btn" type="submit">${k ? 'Lưu thay đổi' : 'Lưu khoản'}</button>
    </form>`);
    oTien($('fGoc')); oTien($('fGt'));
    const dongDoi = (x = {}) => {
      const d = document.createElement('div'); d.className = 'lai-row';
      d.innerHTML = `<div><label>Từ ngày</label><input type="date" class="dTu" value="${esc(x.tu || '')}"></div><div><label>Lãi mới %/năm</label><input class="dLai" inputmode="decimal" value="${esc(x.lai ?? '')}"></div><button type="button" class="chip" aria-label="Bỏ dòng này">Bỏ</button>`;
      d.querySelector('button').onclick = () => { d.remove(); xemTruoc(); };
      d.querySelectorAll('input').forEach((i) => { i.oninput = xemTruoc; });
      $('doiLai').appendChild(d);
    };
    (v.doi_lai || []).forEach(dongDoi);
    $('themDoi').onclick = () => dongDoi();
    const doc = () => {
      const cach = $('fCach').value, dv = $('fDv').value, r0 = soThapPhan($('fLai').value);
      return {
        nhom: document.querySelector('input[name=nhom]:checked')?.value || '', chu_id: Number(document.querySelector('input[name=chu]:checked')?.value || v.chu_id || D.toi.id),
        ten: $('fTen').value, doi_tac: $('fDt').value, cach, goc: soTien($('fGoc').value), bat_dau: $('fBd').value,
        ky_han: Number($('fKy').value) || 0, chu_ky: CO_CHU_KY.includes(cach) ? Number($('fChuKy').value) : 1, ngay_chot: $('fChot').value.trim() === '' ? null : Number($('fChot').value),
        lai: dv === 'thang' ? r0 * 12 : r0, don_vi_lai: dv, gia_tri: cach === 'tai_san' ? soTien($('fGt').value) : null,
        doi_lai: [...$('doiLai').children].map((d) => ({ tu: d.querySelector('.dTu').value, lai: soThapPhan(d.querySelector('.dLai').value) })).filter((x) => x.tu),
        tu_dong_da_tra: $('fTd').checked, ghi_chu: $('fGc').value,
      };
    };
    const hien = () => {
      const c = $('fCach').value;
      $('gGt').hidden = c !== 'tai_san'; $('gKy').hidden = c === 'tai_san';
      $('gChuKy').style.visibility = CO_CHU_KY.includes(c) ? 'visible' : 'hidden';
      $('gLai').hidden = c === 'khong_lai'; $('gDoi').hidden = !['goc_deu', 'nien_kim', 'lai_thang'].includes(c);
    };
    function xemTruoc() {
      hien();
      const x = doc(), el = $('prev');
      if (x.cach === 'tai_san') { el.innerHTML = x.goc && x.gia_tri ? `Chênh lệch so với giá mua: <b>${m(x.gia_tri - x.goc)}</b>` : '<span class="muted">Nhập giá mua và giá ước tính.</span>'; return; }
      if (!x.goc || !x.ky_han || !x.bat_dau || (x.cach !== 'khong_lai' && !Number.isFinite(x.lai))) { el.innerHTML = '<span class="muted">Nhập số tiền, ngày bắt đầu, kỳ hạn và lãi suất để xem trước kỳ trả đầu tiên.</span>'; return; }
      const l = T.lichTra(x); if (!l.length) { el.textContent = ''; return; }
      const f = l[0], tl = l.reduce((a, e) => a + e.lai, 0);
      el.innerHTML = `Kỳ đầu <b>${dd(f.ngay)}</b>: <b class="num">${m(f.goc + f.lai, 1)}</b> (gốc ${m(f.goc)}, lãi ${m(f.lai)}) · ${l.length} kỳ · tổng lãi <b class="num">${m(tl)}</b>. Đối chiếu với hợp đồng trước khi lưu.`;
    }
    $('kf').querySelectorAll('input,select,textarea').forEach((el) => { el.addEventListener('input', xemTruoc); el.addEventListener('change', xemTruoc); });
    xemTruoc();
    $('kf').onsubmit = (e) => { e.preventDefault(); gui(e.target, () => (k ? api('PUT', '/api/khoan/' + k.id, doc()) : api('POST', '/api/khoan', doc())), k ? 'Đã lưu thay đổi.' : 'Đã thêm khoản.'); };
  }

  /* ---------- mượn qua lại ---------- */
  function moNoiBo(id) {
    const k = id ? D.noi_bo.find((x) => x.id === id) : null;
    const [a, b] = D.nguoi;
    const v = k || { cho_vay_id: a?.id, vay_id: b?.id, ngay: T.iso(homNay()), lai_thang: 0, cach_tinh: 'du_no_ngay' };
    const opt = (sel) => D.nguoi.map((x) => `<option value="${x.id}" ${sel === x.id ? 'selected' : ''}>${esc(x.ten)}</option>`).join('');
    moSheet(`<h2 style="font-size:1.25rem">${k ? 'Sửa khoản mượn' : 'Thêm khoản mượn giữa 2 người'}</h2>
    ${k ? '<div class="acts"><button class="btn sm ghost" id="nbXoa">Xóa khoản mượn</button></div>' : ''}
    <form id="nf" class="pf" novalidate>
      <div class="f2"><div><label for="nVay">Người mượn</label><select id="nVay">${opt(v.vay_id)}</select></div><div><label for="nCho">Cho mượn</label><select id="nCho">${opt(v.cho_vay_id)}</select></div></div>
      <div class="f2"><div><label for="nGoc">Số tiền (đồng)</label><input id="nGoc" inputmode="numeric" value="${v.goc ? Number(v.goc).toLocaleString('vi-VN') : ''}"></div><div><label for="nNgay">Ngày mượn</label><input id="nNgay" type="date" value="${esc(v.ngay)}"></div></div>
      <div class="f2"><div><label for="nLai">Lãi %/tháng (0 = không lãi)</label><input id="nLai" inputmode="decimal" value="${esc(v.lai_thang)}"></div><div></div></div>
      <fieldset class="seg"><legend>Cách tính lãi</legend>
        <label><input type="radio" name="ct" value="du_no_ngay" ${v.cach_tinh !== 'co_dinh' ? 'checked' : ''}> Theo dư nợ từng ngày</label>
        <label><input type="radio" name="ct" value="co_dinh" ${v.cach_tinh === 'co_dinh' ? 'checked' : ''}> Cố định trên gốc ban đầu</label></fieldset>
      <div class="hint">Theo dư nợ: trả bớt gốc là lãi giảm từ hôm sau. Cố định: mỗi tháng tròn tính lãi trên số mượn ban đầu, tới khi trả hết gốc.</div>
      <label for="nGc">Ghi chú</label><input id="nGc" maxlength="500" value="${esc(v.ghi_chu || '')}" placeholder="Mượn để làm gì">
      <div class="out ferr" hidden></div>
      <button class="btn" type="submit">${k ? 'Lưu thay đổi' : 'Lưu khoản mượn'}</button></form>`);
    oTien($('nGoc'));
    if (k) $('nbXoa').onclick = (e) => xoaHaiBuoc(e.currentTarget, () => api('DELETE', '/api/noi-bo/' + k.id), 'Đã xóa khoản mượn.');
    $('nf').onsubmit = (e) => {
      e.preventDefault();
      const body = { vay_id: Number($('nVay').value), cho_vay_id: Number($('nCho').value), goc: soTien($('nGoc').value), ngay: $('nNgay').value, lai_thang: soThapPhan($('nLai').value || '0'), cach_tinh: document.querySelector('input[name=ct]:checked').value, ghi_chu: $('nGc').value };
      gui(e.target, () => (k ? api('PUT', '/api/noi-bo/' + k.id, body) : api('POST', '/api/noi-bo', body)), 'Đã lưu khoản mượn.');
    };
  }

  function moChuyenTra(id) {
    const k = D.noi_bo.find((x) => x.id === id), st = k.st;
    const ve = nguoi(k.vay_id).ten, nhan = nguoi(k.cho_vay_id).ten;
    moSheet(`<h2 style="font-size:1.25rem">${esc(ve)} chuyển trả cho ${esc(nhan)}</h2>
      <div class="kv"><div><span>Gốc còn nợ</span><b class="num">${m(st.gocCon, 1)}</b></div><div><span>Lãi chưa trả</span><b class="num">${m(st.laiCon, 1)}</b></div><div><span>Lãi suất</span><b>${Number(k.lai_thang) ? k.lai_thang + '%/tháng' : 'Không lãi'}</b></div></div>
      <form id="pf" class="pf" novalidate>
        <fieldset class="seg"><legend>Khoản này là</legend>
          <label><input type="radio" name="loai" value="goc" ${st.laiCon > 0 && st.gocCon === 0 ? '' : 'checked'}> Trả gốc</label>
          <label><input type="radio" name="loai" value="lai" ${st.laiCon > 0 && st.gocCon === 0 ? 'checked' : ''} ${Number(k.lai_thang) ? '' : 'disabled'}> Trả lãi</label></fieldset>
        <div class="f2"><div><label for="pTien">Số tiền (đồng)</label><input id="pTien" inputmode="numeric" placeholder="5.000.000"></div><div><label for="pNgay">Ngày chuyển</label><input id="pNgay" type="date" value="${T.iso(homNay())}"></div></div>
        <div class="quick" id="quick"></div>
        <label for="pGc">Ghi chú</label><input id="pGc" maxlength="500" placeholder="Không bắt buộc">
        <div class="out ferr" hidden></div>
        <button class="btn" type="submit">Ghi nhận đã chuyển</button></form>`);
    oTien($('pTien'));
    const quick = () => {
      const l = document.querySelector('input[name=loai]:checked').value;
      const o = l === 'lai' ? [['Trả hết lãi', st.laiCon]] : [['Trả hết gốc', st.gocCon]];
      $('quick').innerHTML = o.filter((x) => x[1] >= 1).map((x) => `<button type="button" class="chip" data-v="${Math.round(x[1])}">${x[0]} · ${m(x[1])}</button>`).join('');
    };
    quick();
    document.querySelectorAll('input[name=loai]').forEach((x) => { x.onchange = quick; });
    $('quick').onclick = (e) => { const b = e.target.closest('[data-v]'); if (b) $('pTien').value = Number(b.dataset.v).toLocaleString('vi-VN'); };
    $('pf').onsubmit = (e) => {
      e.preventDefault();
      const loai = document.querySelector('input[name=loai]:checked').value;
      gui(e.target, () => api('POST', `/api/noi-bo/${k.id}/chuyen-tra`, { loai, so_tien: soTien($('pTien').value), ngay: $('pNgay').value, ghi_chu: $('pGc').value }), `Đã ghi ${loai === 'goc' ? 'trả gốc' : 'trả lãi'}.`);
    };
  }

  /* ---------- danh bạ ---------- */
  const LOAI_DT = { nguoi: 'Cá nhân', ngan_hang: 'Ngân hàng', khac: 'Khác' };
  function moDanhBa(suaId) {
    const ds = D.doi_tac || [];
    const sua = suaId ? ds.find((d) => d.id === suaId) : null;
    const thongKe = (ten) => {
      const ks = D.khoan.filter((k) => k.doi_tac.toLowerCase() === ten.toLowerCase());
      const no = ks.filter((k) => k.nhom === 'no').reduce((a, k) => a + k.conLai, 0);
      const cho = ks.filter((k) => k.nhom === 'chovay').reduce((a, k) => a + k.conLai, 0);
      return `${ks.length} khoản${no ? ` · đang nợ <b class="out">${m(no)}</b>` : ''}${cho ? ` · đang nợ mình <b class="in">${m(cho)}</b>` : ''}`;
    };
    const opt = (cur) => Object.keys(LOAI_DT).map((k) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${LOAI_DT[k]}</option>`).join('');
    moSheet(`<h2 style="font-size:1.25rem">Danh bạ người / ngân hàng</h2>
      <div class="hint">Tên trong danh bạ hiện ra để chọn nhanh khi nhập khoản. Đổi tên ở đây thì các khoản đang dùng tên cũ đổi theo.</div>
      <form id="dbf" class="pf panel" novalidate>
        <b>${sua ? 'Sửa: ' + esc(sua.ten) : 'Thêm người / ngân hàng'}</b>
        <div class="f2"><div><label for="dTen">Tên</label><input id="dTen" maxlength="200" value="${esc(sua?.ten || '')}" placeholder="Anh Hùng, Vietcombank..."></div>
          <div><label for="dLoai">Loại</label><select id="dLoai">${opt(sua?.loai || 'nguoi')}</select></div></div>
        <div class="f2"><div><label for="dSdt">Số điện thoại</label><input id="dSdt" inputmode="tel" maxlength="30" value="${esc(sua?.dien_thoai || '')}"></div>
          <div><label for="dGc">Ghi chú</label><input id="dGc" maxlength="500" value="${esc(sua?.ghi_chu || '')}"></div></div>
        <div class="out ferr" hidden></div>
        <div class="acts"><button class="btn sm" type="submit">${sua ? 'Lưu thay đổi' : 'Thêm vào danh bạ'}</button>${sua ? '<button type="button" class="btn sm ghost" id="dHuy">Thôi, không sửa</button>' : ''}</div>
      </form>
      <div class="list">${ds.length ? ds.map((d) => `<div class="cday" style="grid-template-columns:1fr auto">
          <div><b>${esc(d.ten)}</b> <span class="pill ok">${LOAI_DT[d.loai] || ''}</span>${d.dien_thoai ? ` <span class="muted">· ${esc(d.dien_thoai)}</span>` : ''}
            <div class="muted" style="font-size:.8rem">${thongKe(d.ten)}${d.ghi_chu ? ' · ' + esc(d.ghi_chu) : ''}</div></div>
          <div class="acts"><button class="chip" data-dbsua="${d.id}">Sửa</button><button class="chip" data-dbbo="${d.id}">Bỏ</button></div></div>`).join('')
        : '<div class="empty">Danh bạ trống. Thêm tên ở trên, hoặc tên sẽ tự vào danh bạ khi nhập khoản.</div>'}</div>`);
    if (sua) $('dHuy').onclick = () => moDanhBa();
    $('dbf').onsubmit = async (e) => {
      e.preventDefault();
      const body = { ten: $('dTen').value, loai: $('dLoai').value, dien_thoai: $('dSdt').value, ghi_chu: $('dGc').value };
      const b = e.target.querySelector('button[type=submit]'), er = e.target.querySelector('.ferr');
      b.disabled = true; er.hidden = true;
      try {
        const r = sua ? await api('PUT', '/api/doi-tac/' + sua.id, body) : await api('POST', '/api/doi-tac', body);
        await taiLai(); moDanhBa();
        toast(sua ? (r.so_khoan ? `Đã lưu, đổi tên trên ${r.so_khoan} khoản.` : 'Đã lưu.') : 'Đã thêm vào danh bạ.');
      } catch (err) { er.textContent = err.message; er.hidden = false; b.disabled = false; }
    };
    $('sheet').querySelectorAll('[data-dbsua]').forEach((b) => { b.onclick = () => moDanhBa(Number(b.dataset.dbsua)); });
    $('sheet').querySelectorAll('[data-dbbo]').forEach((b) => { b.onclick = () => {
      if (b.dataset.chac !== '1') { b.dataset.chac = '1'; b.textContent = 'Bấm lần nữa'; return; }
      b.disabled = true;
      api('DELETE', '/api/doi-tac/' + b.dataset.dbbo).then(async () => { await taiLai(); moDanhBa(); toast('Đã bỏ khỏi danh bạ. Các khoản đã nhập vẫn giữ nguyên.'); }).catch((err) => { toast(err.message); b.disabled = false; });
    }; });
  }

  /* Tài khoản: gom đổi mật khẩu, đăng xuất vào một bảng cho gọn đầu màn điện thoại */
  function moTaiKhoan() {
    moSheet(`<div class="tk-dau">${av(toi().id)}<div><h2 style="font-size:1.25rem">${esc(toi().ten)}</h2>
      <span class="pill ${coNhap() ? 'ok' : 'warn'}">${coNhap() ? 'Nhập liệu: thêm, sửa mọi khoản' : 'Xem, tự thêm khoản của mình'}</span></div></div>
      <div class="tb-khung"><div><b>Thông báo mỗi sáng</b><div class="muted" id="tbTt" style="font-size:.86rem">Đang kiểm tra…</div></div>
        <div class="acts"><button class="btn sm" id="tbBat" hidden>Bật thông báo</button><button class="btn sm ghost" id="tbThu" hidden>Gửi thử</button><button class="btn sm ghost" id="tbTat" hidden>Tắt</button></div></div>
      <button class="btn ghost" id="bMk">Đổi mật khẩu</button><button class="btn ghost" id="bOut">Đăng xuất</button>`);
    $('bMk').onclick = moDoiMatKhau;
    veThongBao();
    $('bOut').onclick = async () => { await api('POST', '/api/dang-xuat', {}); dong(); D = null; renderLogin(); };
  }

  /* ---------- thông báo đẩy ---------- */
  const coPush = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const laIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const moTuManHinhChinh = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const b64 = (s) => { const p = '='.repeat((4 - (s.length % 4)) % 4); const r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(r, (c) => c.charCodeAt(0)); };
  async function dangKyHienTai() {
    if (!coPush()) return null;
    const reg = await navigator.serviceWorker.ready;
    return reg.pushManager.getSubscription();
  }
  async function veThongBao() {
    const tt = $('tbTt'); if (!tt) return;
    const hien = (bat, thu, tat) => { $('tbBat').hidden = !bat; $('tbThu').hidden = !thu; $('tbTat').hidden = !tat; };
    if (!coPush()) {
      tt.textContent = laIOS() && !moTuManHinhChinh()
        ? 'Trên iPhone/iPad: bấm nút Chia sẻ của Safari, chọn "Thêm vào MH chính", rồi mở My Finance từ màn hình chính và bật ở đây.'
        : 'Trình duyệt này không nhận được thông báo.';
      hien(false, false, false); return;
    }
    if (Notification.permission === 'denied') { tt.textContent = 'Máy đang chặn thông báo của My Finance. Mở Cài đặt › Thông báo › My Finance để cho phép.'; hien(false, false, false); return; }
    const sub = await dangKyHienTai().catch(() => null);
    if (sub) { tt.textContent = 'Đang bật trên máy này. Mỗi sáng 7 giờ báo kỳ quá hạn, kỳ đến hạn trong 3 ngày tới và lãi suất sắp đổi.'; hien(false, true, true); }
    else { tt.textContent = 'Chưa bật trên máy này.'; hien(true, false, false); }
    $('tbBat').onclick = async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try {
        if (await Notification.requestPermission() !== 'granted') throw new Error('Chưa cho phép thông báo.');
        const { khoa } = await api('GET', '/api/thong-bao');
        const reg = await navigator.serviceWorker.ready;
        const s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(khoa) });
        await api('POST', '/api/thong-bao/dang-ky', s.toJSON());
        toast('Đã bật thông báo.');
      } catch (err) { toast(err.message || 'Không bật được thông báo.'); }
      b.disabled = false; veThongBao();
    };
    $('tbThu').onclick = async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try { const r = await api('POST', '/api/thong-bao/thu', {}); toast(r.gui ? 'Đã gửi, chờ vài giây.' : 'Không gửi được. Thử tắt rồi bật lại.'); }
      catch (err) { toast(err.message); }
      b.disabled = false;
    };
    $('tbTat').onclick = async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try { const s = await dangKyHienTai(); if (s) { await api('POST', '/api/thong-bao/huy', { endpoint: s.endpoint }); await s.unsubscribe(); } toast('Đã tắt thông báo trên máy này.'); }
      catch (err) { toast(err.message); }
      b.disabled = false; veThongBao();
    };
  }

  function moDoiMatKhau() {
    moSheet(`<h2 style="font-size:1.25rem">Đổi mật khẩu</h2>
      <form id="mf" class="pf"><input type="text" name="username" autocomplete="username" value="${esc(toi().ten_dang_nhap || '')}" hidden><label for="mCu">Mật khẩu hiện tại</label><input id="mCu" type="password" autocomplete="current-password">
      <label for="mMoi">Mật khẩu mới (ít nhất 8 ký tự)</label><input id="mMoi" name="new-password" type="password" autocomplete="new-password" minlength="8">
      <div class="hint">Đổi xong, các máy khác đang đăng nhập tài khoản này sẽ phải đăng nhập lại.</div>
      <div class="out ferr" hidden></div><button class="btn" type="submit">Đổi mật khẩu</button></form>`);
    $('mf').onsubmit = (e) => { e.preventDefault(); gui(e.target, () => api('POST', '/api/doi-mat-khau', { cu: $('mCu').value, moi: $('mMoi').value }).then((r) => { luuMatKhau(toi().ten_dang_nhap, $('mMoi').value); return r; }), 'Đã đổi mật khẩu.'); };
  }

  /* ---------- khởi động ---------- */
  $('modal').onclick = (e) => { if (e.target.id === 'modal') dong(); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') dong(); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => D && veSoLieu());
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  taiLai().catch(() => { if (!D && !$('lf')) renderLogin(); });
})();
