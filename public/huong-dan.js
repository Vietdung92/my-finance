/* Nút ? hướng dẫn từng bước: khoanh cam đúng chỗ cần bấm, kèm một câu ngắn.
 * Mỗi màn một danh sách bước { s: bộ chọn CSS, t: chữ }. Bước nào không thấy trên màn (ẩn, không có quyền) thì tự bỏ qua.
 * Sửa giao diện (đổi id, thêm nút) thì sửa luôn bước ở đây. */
(function () {
  'use strict';

  const MAN = {
    chinh_nhap: [
      { s: '#members', t: 'Mỗi người một ví riêng. Chọn xem ví của anh Dũng hay ví của Tú.' },
      { s: '#dbBtn', t: 'Mới bắt đầu thì vào Danh bạ trước, thêm tên ngân hàng và người cho vay, người vay.' },
      { s: '#addBtn', t: 'Sau đó bấm + Thêm khoản để nhập từng khoản vay, cho vay, đầu tư.' },
      { s: '#addNb', t: 'Tiền mượn qua lại giữa anh Dũng và Tú thì bấm + Khoản mượn.' },
      { s: '#hero', t: 'Tổng quan: tài sản ròng, nợ còn lại, tiền cho vay và đầu tư, lãi tháng này.' },
      { s: '#kyLoai', t: 'Chọn xem theo tháng, quý hay năm: phải trả, thu về, lãi bao nhiêu.' },
      { s: '.ky-dieu', t: 'Bấm ‹ › để lùi, tiến từng kỳ. Bấm Các kỳ trả để xem chi tiết.' },
      { s: '#cf', t: 'Dòng tiền 12 tháng tới. Cột xanh là tiền thu về, cột cam là tiền phải trả. Chạm vào cột để xem số.' },
      { s: '#alerts', t: 'Những việc cần chú ý: kỳ quá hạn, kỳ sắp đến hạn, sắp hết ưu đãi lãi.' },
      { s: '#tabs', t: 'Lọc danh sách theo loại: đang nợ, cho vay, đầu tư.' },
      { s: '#list', t: 'Bấm vào một khoản để xem lịch trả và ghi nhận kỳ đã trả.' },
      { s: '#owes', t: 'Mỗi lần chuyển tiền trả nhau, bấm Ghi nhận chuyển trả và chọn trả gốc hay trả lãi.' },
      { s: '#pNguoi', t: 'Nợ theo từng người. Bấm một người để chỉ xem các khoản của người đó.' },
      { s: '#cal', t: 'Lịch các kỳ đến hạn trong 60 ngày tới.' },
      { s: '#log', t: 'Nhật ký: ai thêm, sửa, ghi nhận gì và lúc nào.' },
      { s: '#bTk', t: 'Bấm vào tên mình để đổi mật khẩu hoặc đăng xuất.' },
    ],
    chinh_xem: [
      { s: '#hero', t: 'Tổng quan: tài sản ròng, nợ còn lại, tiền cho vay và đầu tư, lãi tháng này.' },
      { s: '#kyLoai', t: 'Chọn xem theo tháng, quý hay năm: phải trả, thu về, lãi bao nhiêu.' },
      { s: '.ky-dieu', t: 'Bấm ‹ › để lùi, tiến từng kỳ. Bấm Các kỳ trả để xem chi tiết.' },
      { s: '#cf', t: 'Dòng tiền 12 tháng tới. Cột xanh là tiền thu về, cột cam là tiền phải trả. Chạm vào cột để xem số.' },
      { s: '#alerts', t: 'Những việc cần chú ý: kỳ quá hạn, kỳ sắp đến hạn, sắp hết ưu đãi lãi.' },
      { s: '#tabs', t: 'Lọc danh sách theo loại: đang nợ, cho vay, đầu tư.' },
      { s: '#list', t: 'Bấm vào một khoản để xem lịch trả từng kỳ.' },
      { s: '#owes', t: 'Tiền mượn qua lại giữa anh và Tú: gốc còn nợ, lãi chưa trả.' },
      { s: '#pNguoi', t: 'Nợ theo từng người. Bấm một người để chỉ xem các khoản của người đó.' },
      { s: '#cal', t: 'Lịch các kỳ đến hạn trong 60 ngày tới.' },
      { s: '#log', t: 'Nhật ký: Tú thêm, sửa, ghi nhận gì và lúc nào.' },
      { s: '#bTk', t: 'Bấm vào tên mình để đổi mật khẩu hoặc đăng xuất.' },
    ],
    khoan: [
      { s: '#kf fieldset:nth-of-type(1)', t: 'Chọn loại khoản: Đi vay, Cho vay hay Đầu tư.' },
      { s: '#kf fieldset:nth-of-type(2)', t: 'Khoản này của ai: anh Dũng hay Tú.' },
      { s: '#fTen', t: 'Đặt tên cho dễ nhớ, ví dụ Vay mua xe.' },
      { s: '#fDt', t: 'Gõ vài chữ tên ngân hàng hoặc người, app gợi ý từ danh bạ.' },
      { s: '#fCach', t: 'Chọn cách trả đúng như hợp đồng.' },
      { s: '#fGoc', t: 'Số tiền gốc.' },
      { s: '#fBd', t: 'Ngày bắt đầu (ngày nhận tiền).' },
      { s: '#fKy', t: 'Kỳ hạn, tính bằng tháng. Ví dụ 5 năm là 60.' },
      { s: '#gChuKy', t: 'Trả gốc, lãi mỗi tháng, mỗi quý, mỗi 6 tháng hay mỗi năm.' },
      { s: '#fChot', t: 'Ngày trả trong tháng. Để trống thì theo ngày bắt đầu.' },
      { s: '#fLai', t: 'Lãi suất. Chọn %/năm hoặc %/tháng ở ô bên cạnh.' },
      { s: '#themDoi', t: 'Hết ưu đãi hoặc lãi thả nổi: thêm ngày đổi lãi và lãi mới.' },
      { s: '#fTd', t: 'Ngân hàng tự trừ tiền thì tick ô này. Không tick thì phải ghi nhận từng kỳ đã trả.' },
      { s: '#prev', t: 'Xem trước kỳ đầu và tổng lãi. Đối chiếu với hợp đồng.' },
      { s: '#kf button[type=submit]', t: 'Bấm Lưu khoản là xong.' },
    ],
    chitiet: [
      { s: '#sheet .kv', t: 'Thông tin chính: gốc, còn lại, lãi suất, kỳ trả, đáo hạn.' },
      { s: '#bSua', t: 'Sửa khoản khi lãi suất hoặc hợp đồng thay đổi.' },
      { s: '#bal', t: 'Dư nợ giảm dần theo thời gian.' },
      { s: '#lichTra', t: 'Lịch trả từng kỳ. Dòng tô màu là kỳ tới, chữ đỏ là quá hạn.' },
      { s: '#lichTra [data-ky]', t: 'Kỳ nào đã trả thì bấm Đã trả. Bấm nhầm thì bấm Chưa trả để đổi lại.' },
      { s: '#bXoa', t: 'Xóa khoản: bấm 2 lần để chắc chắn.' },
    ],
    noibo: [
      { s: '#nVay', t: 'Chọn người mượn và người cho mượn.' },
      { s: '#nGoc', t: 'Số tiền mượn.' },
      { s: '#nNgay', t: 'Ngày mượn.' },
      { s: '#nLai', t: 'Lãi %/tháng. Không tính lãi thì để 0.' },
      { s: '#nf fieldset', t: 'Theo dư nợ: trả bớt gốc thì lãi giảm ngay. Cố định: lãi luôn tính trên số mượn ban đầu.' },
      { s: '#nf button[type=submit]', t: 'Bấm lưu là xong.' },
    ],
    chuyentra: [
      { s: '#pf fieldset', t: 'Chọn lần chuyển này là trả gốc hay trả lãi.' },
      { s: '#pTien', t: 'Số tiền đã chuyển.' },
      { s: '#quick', t: 'Hoặc bấm số gợi ý để điền nhanh.' },
      { s: '#pNgay', t: 'Ngày chuyển tiền.' },
      { s: '#pf button[type=submit]', t: 'Bấm Ghi nhận đã chuyển.' },
    ],
    danhba: [
      { s: '#dTen', t: 'Gõ tên ngân hàng hoặc người.' },
      { s: '#dLoai', t: 'Chọn là người hay ngân hàng.' },
      { s: '#dSdt', t: 'Số điện thoại, không bắt buộc.' },
      { s: '#dbf button[type=submit]', t: 'Bấm lưu để thêm vào danh bạ.' },
      { s: '[data-dbsua]', t: 'Sửa tên: các khoản đang dùng tên cũ tự đổi theo.' },
      { s: '[data-dbbo]', t: 'Bỏ khỏi danh bạ: bấm 2 lần. Các khoản đã nhập vẫn giữ nguyên.' },
    ],
    taikhoan: [
      { s: '#tbBat', t: 'Bật để mỗi sáng 7 giờ nhận thông báo kỳ sắp đến hạn, quá hạn.' },
      { s: '#tbThu', t: 'Gửi thử một thông báo để xem máy đã nhận được chưa.' },
      { s: '#bMk', t: 'Đổi mật khẩu đăng nhập.' },
      { s: '#bOut', t: 'Đăng xuất khỏi máy này.' },
    ],
    matkhau: [
      { s: '#mCu', t: 'Nhập mật khẩu đang dùng.' },
      { s: '#mMoi', t: 'Nhập mật khẩu mới.' },
      { s: '#mf button[type=submit]', t: 'Bấm lưu. Các máy đang đăng nhập sẽ phải đăng nhập lại.' },
    ],
  };

  /* Màn đang mở: có bảng (sheet) thì theo bảng, không thì màn chính. */
  function manHienTai(coNhap) {
    const modal = document.getElementById('modal');
    if (modal && !modal.hidden) {
      if (document.getElementById('kf')) return 'khoan';
      if (document.getElementById('nf')) return 'noibo';
      if (document.getElementById('pf')) return 'chuyentra';
      if (document.getElementById('dbf')) return 'danhba';
      if (document.getElementById('mf')) return 'matkhau';
      if (document.getElementById('bOut')) return 'taikhoan';
      return 'chitiet';
    }
    return coNhap ? 'chinh_nhap' : 'chinh_xem';
  }

  const thay = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  };

  let lop = null;
  function dong() {
    if (!lop) return;
    lop.remove(); lop = null;
    window.removeEventListener('resize', lop_dat, true);
    window.removeEventListener('scroll', lop_dat, true);
    document.removeEventListener('keydown', phim, true);
  }
  let lop_dat = () => {};
  function phim(e) {
    if (!lop) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); dong(); }
    else if (e.key === 'ArrowRight') lop.querySelector('[data-hd=tiep]').click();
    else if (e.key === 'ArrowLeft') lop.querySelector('[data-hd=truoc]').click();
  }

  function mo(coNhap) {
    dong();
    const buoc = (MAN[manHienTai(coNhap)] || []).map((b) => ({ ...b, el: document.querySelector(b.s) })).filter((b) => thay(b.el));
    if (!buoc.length) return;
    let i = 0;
    lop = document.createElement('div');
    lop.className = 'hd-lop';
    lop.innerHTML = `<div class="hd-khoanh"></div>
      <div class="hd-the" role="dialog" aria-live="polite" aria-label="Hướng dẫn">
        <div class="hd-dem"></div><div class="hd-chu"></div>
        <div class="hd-nut-hang"><button type="button" class="btn ghost sm" data-hd="dong">Tắt</button>
          <span style="flex:1"></span><button type="button" class="btn ghost sm" data-hd="truoc">Trước</button><button type="button" class="btn sm" data-hd="tiep">Tiếp</button></div>
      </div>`;
    document.body.appendChild(lop);
    const khoanh = lop.querySelector('.hd-khoanh'), the = lop.querySelector('.hd-the');

    lop_dat = () => {
      if (!lop) return;
      const r = buoc[i].el.getBoundingClientRect(), pad = 6, W = innerWidth, H = innerHeight;
      Object.assign(khoanh.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
      const tw = Math.min(360, W - 32);
      the.style.width = tw + 'px';
      const th = the.offsetHeight;
      let top = r.bottom + pad + 10;
      if (top + th > H - 12) top = r.top - pad - 10 - th;   // không đủ chỗ dưới thì đặt lên trên
      if (top < 12) top = Math.max(12, H - th - 16);          // phần tử cao quá màn: đặt sát đáy
      the.style.top = top + 'px';
      the.style.left = Math.min(Math.max(16, r.left + r.width / 2 - tw / 2), W - tw - 16) + 'px';
    };

    const ve = () => {
      const b = buoc[i];
      lop.querySelector('.hd-dem').textContent = `Bước ${i + 1}/${buoc.length}`;
      lop.querySelector('.hd-chu').textContent = b.t;
      lop.querySelector('[data-hd=truoc]').disabled = i === 0;
      lop.querySelector('[data-hd=tiep]').textContent = i === buoc.length - 1 ? 'Xong' : 'Tiếp';
      b.el.scrollIntoView({ block: 'center', behavior: 'instant' in document.documentElement.style ? 'instant' : 'auto' });
      lop_dat();
      requestAnimationFrame(lop_dat);
      lop.querySelector('[data-hd=tiep]').focus({ preventScroll: true });
    };

    lop.addEventListener('click', (e) => {
      const n = e.target.closest('[data-hd]');
      if (!n) { if (!e.target.closest('.hd-the')) dong(); return; }   // bấm ra ngoài thì tắt
      if (n.dataset.hd === 'dong') dong();
      else if (n.dataset.hd === 'truoc' && i > 0) { i--; ve(); }
      else if (n.dataset.hd === 'tiep') { if (i < buoc.length - 1) { i++; ve(); } else dong(); }
    });
    window.addEventListener('resize', lop_dat, true);
    window.addEventListener('scroll', lop_dat, true);
    document.addEventListener('keydown', phim, true);
    ve();
  }

  window.HuongDan = { mo, dong, MAN };
})();
