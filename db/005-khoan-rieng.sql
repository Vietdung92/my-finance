-- Khoản do tài khoản "xem" (anh Dũng) tự nhập: chỉ người đó sửa, xóa, ghi nhận được.
-- NULL = khoản do tài khoản nhập liệu (Tú) nhập, Tú quản như cũ.
ALTER TABLE khoan ADD COLUMN IF NOT EXISTS rieng_cua INTEGER REFERENCES nguoi_dung(id);
