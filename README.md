# My Finance

App quản lý các khoản vay ngân hàng, vay cá nhân, cho vay, đầu tư và khoản mượn qua lại giữa 2 người.

- **Tú** (tài khoản `tu`, quyền nhập liệu): thêm, sửa, xóa khoản; ghi nhận kỳ đã trả/chưa trả; nhập khoản mượn và các lần chuyển trả (trả gốc / trả lãi). Xem được tất cả.
- **Dũng** (tài khoản `dung`, chỉ xem): xem khoản của mình và khoản mượn qua lại có mình, không sửa được gì.
- Mọi thay đổi ghi vào **Nhật ký** (ai, lúc nào, đổi gì).

## Cách tính
Toàn bộ phép tính ở `public/tinh.js` (có bài kiểm tra ở `tests/tinh.test.js`):

| Cách trả | Tính thế nào |
|---|---|
| Trả đều hàng tháng | Công thức niên kim; lãi đổi thì tính lại số tiền trả đều trên dư nợ và số kỳ còn lại |
| Gốc đều, lãi giảm dần | Gốc chia đều; lãi = dư nợ × lãi năm × số ngày thực tế / 365 (như ngân hàng) |
| Lãi tháng, gốc cuối kỳ | Lãi mỗi kỳ = gốc × lãi năm / 12 |
| Tiết kiệm | Lãi đơn, nhận gốc + lãi khi đáo hạn |
| Chia lợi nhuận quý | Gốc × lãi năm / 4 mỗi quý |
| Mượn giữa 2 người | Chọn từng khoản: **theo dư nợ từng ngày** (gốc còn × lãi tháng / 30 mỗi ngày) hoặc **cố định** (gốc ban đầu × lãi tháng cho mỗi tháng tròn, tới khi trả hết gốc) |

Ngày chốt lãi: kỳ rơi vào ngày đó hàng tháng (tháng thiếu ngày thì lấy ngày cuối tháng).
Kỳ đã qua: khoản bật "tự coi là đã trả" (ngân hàng trừ tự động) thì tính là đã trả, trừ khi ghi nhận "chưa trả"; khoản khác phải ghi nhận, chưa ghi nhận là **quá hạn**.

## Cài lần đầu trên máy chủ (một lần)
1. AZDIGI: thêm bản ghi **A** tên `taichinh` trỏ về `103.221.222.172`.
2. Tạo deploy key trên máy chủ (bí danh `github-my-finance` trong `/root/.ssh/config`, key `/root/.ssh/deploy_my_finance`), gắn phần `.pub` vào GitHub › Settings › Deploy keys (chỉ đọc).
3. Trên máy chủ (Termius, đã đăng nhập sẵn):
```
git clone git@github-my-finance:Vietdung92/my-finance.git /root/kho/my-finance && bash /root/kho/my-finance/trien-khai/cai-dat.sh
```
Mật khẩu 2 tài khoản in ra cuối lệnh và lưu ở `/root/my-finance-tai-khoan.txt` trên máy chủ.

## Cập nhật bản mới (sau khi gộp Pull Request)
```
bash /root/kho/my-finance/trien-khai/cap-nhat.sh
```

## Cấp lại mật khẩu
```
cd /var/www/my-finance && node scripts/tao-nguoi-dung.js dung "Dũng" xem
```

## Chạy thử trên máy (cho người viết code)
```
npm install
TEST_DATABASE_URL=postgresql://user:pass@localhost/db_thu npm test   # database THỬ, bị xóa sạch mỗi lần
```
Kho này phải để **Private**. Không đưa `.env` lên GitHub.
