const test = require('node:test');
const assert = require('node:assert');
const T = require('../public/tinh.js');

const gan = (a, b, sai = 1) => assert.ok(Math.abs(a - b) <= sai, `${a} khác ${b}`);

test('trả đều hàng tháng: tổng gốc đúng bằng số vay, kỳ trả khớp công thức', () => {
  const kh = { goc: 300e6, bat_dau: '2025-06-10', ky_han: 36, cach: 'nien_kim', lai: 14 };
  const l = T.lichTra(kh);
  assert.equal(l.length, 36);
  const r = 0.14 / 12, pmt = 300e6 * r / (1 - Math.pow(1 + r, -36));
  gan(l[0].goc + l[0].lai, pmt);
  gan(l[0].lai, 3.5e6);
  gan(l.reduce((a, e) => a + e.goc, 0), 300e6);
  gan(l[35].du, 0);
  assert.equal(T.iso(l[0].ngay), '2025-07-10');
});

test('gốc đều: lãi theo số ngày thực tế / 365', () => {
  const kh = { goc: 1.2e9, bat_dau: '2026-01-15', ky_han: 120, cach: 'goc_deu', lai: 9 };
  const l = T.lichTra(kh);
  gan(l[0].goc, 10e6);
  gan(l[0].lai, 1.2e9 * 0.09 * 31 / 365); // 15/1 -> 15/2 = 31 ngày
  gan(l[1].lai, 1.19e9 * 0.09 * 28 / 365); // 15/2 -> 15/3 = 28 ngày
});

test('đổi lãi suất: kỳ sau ngày đổi dùng lãi mới, trả đều được tính lại', () => {
  const kh = { goc: 100e6, bat_dau: '2026-01-01', ky_han: 12, cach: 'nien_kim', lai: 12, doi_lai: [{ tu: '2026-07-01', lai: 24 }] };
  const l = T.lichTra(kh);
  assert.equal(l[5].lai_suat, 12);
  assert.equal(l[6].lai_suat, 24);
  gan(l[6].lai, l[5].du * 0.02);
  gan(l.reduce((a, e) => a + e.goc, 0), 100e6);
  assert.ok(l[6].goc + l[6].lai > l[5].goc + l[5].lai);
});

test('ngày chốt lãi: kỳ rơi đúng ngày chốt, tháng thiếu ngày thì lấy cuối tháng', () => {
  const kh = { goc: 10e6, bat_dau: '2026-01-05', ky_han: 3, cach: 'lai_thang', lai: 12, ngay_chot: 31 };
  const l = T.lichTra(kh);
  assert.deepEqual(l.map((e) => T.iso(e.ngay)), ['2026-02-28', '2026-03-31', '2026-04-30']);
  gan(l[0].lai, 100000);
  assert.equal(l[2].goc, 10e6);
});

test('tiết kiệm và chia lợi nhuận quý', () => {
  const tk = T.lichTra({ goc: 500e6, bat_dau: '2025-12-18', ky_han: 12, cach: 'tiet_kiem', lai: 6.2 });
  assert.equal(tk.length, 1); gan(tk[0].lai, 31e6);
  const q = T.lichTra({ goc: 400e6, bat_dau: '2026-01-01', ky_han: 36, cach: 'chia_quy', lai: 18 });
  assert.equal(q.length, 12); gan(q[0].lai, 18e6); assert.equal(q[11].goc, 400e6);
});

test('trạng thái kỳ: tự trừ coi là đã trả, khoản thường chưa ghi nhận là quá hạn', () => {
  const base = { goc: 12e6, bat_dau: '2026-01-10', ky_han: 12, cach: 'nien_kim', lai: 0 };
  const a = T.tomTat({ ...base, tu_dong_da_tra: true }, [{ ky_ngay: '2026-03-10', trang_thai: 'chua_tra' }], '2026-04-01');
  // kỳ 10/02, 10/03 đã qua; 10/04 chưa tới
  assert.deepEqual(a.lich.slice(0, 3).map((e) => e.tt), ['xong', 'quahan', 'chua']);
  gan(a.conLai, 11e6);
  const b = T.tomTat({ ...base, tu_dong_da_tra: false }, [{ ky_ngay: '2026-02-10', trang_thai: 'da_tra' }], '2026-04-01');
  const c = T.tomTat({ ...base, tu_dong_da_tra: false }, [], '2026-04-01');
  assert.deepEqual(c.lich.slice(0, 3).map((e) => e.tt), ['quahan', 'quahan', 'chua']);
  assert.deepEqual(b.lich.slice(0, 3).map((e) => e.tt), ['xong', 'quahan', 'chua']);
  assert.equal(b.quaHan.length, 1);
  assert.equal(T.iso(b.kyToi.ngay), '2026-04-10');
});

test('mượn nội bộ, tính theo dư nợ từng ngày', () => {
  const k = { id: 1, goc: 60e6, ngay: '2026-10-01', lai_thang: 1, cach_tinh: 'du_no_ngay' };
  const tr = [{ ngay: '2026-11-01', so_tien: 600e3, loai: 'lai' }, { ngay: '2026-11-10', so_tien: 15e6, loai: 'goc' }];
  const s = T.noiBo(k, tr, '2026-11-26');
  // 1/10 -> 9/11 = 40 ngày trên 60tr, 10/11 -> 25/11 = 16 ngày trên 45tr
  gan(s.laiPS, 60e6 * 0.01 / 30 * 40 + 45e6 * 0.01 / 30 * 16);
  gan(s.gocCon, 45e6); gan(s.laiTra, 600e3); gan(s.laiCon, s.laiPS - 600e3);
});

test('mượn nội bộ, lãi cố định theo tháng tròn trên gốc ban đầu, dừng khi trả hết gốc', () => {
  const k = { id: 2, goc: 60e6, ngay: '2026-08-01', lai_thang: 1, cach_tinh: 'co_dinh' };
  const s = T.noiBo(k, [{ ngay: '2026-09-15', so_tien: 30e6, loai: 'goc' }], '2026-11-26');
  gan(s.laiPS, 60e6 * 0.01 * 3); // 1/9, 1/10, 1/11
  const het = T.noiBo(k, [{ ngay: '2026-09-15', so_tien: 60e6, loai: 'goc' }], '2026-11-26');
  gan(het.laiPS, 60e6 * 0.01 * 1); // chỉ tháng 1/9 trước khi trả hết
  assert.equal(het.gocCon, 0);
});
