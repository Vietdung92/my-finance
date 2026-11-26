-- Danh bạ người / ngân hàng: chọn nhanh khi nhập khoản. Khoản vẫn lưu tên (khoan.doi_tac) để đọc dễ.
CREATE TABLE IF NOT EXISTS doi_tac (
  id          SERIAL PRIMARY KEY,
  ten         TEXT NOT NULL,
  loai        TEXT NOT NULL DEFAULT 'nguoi' CHECK (loai IN ('nguoi','ngan_hang','khac')),
  dien_thoai  TEXT NOT NULL DEFAULT '',
  ghi_chu     TEXT NOT NULL DEFAULT '',
  da_xoa      BOOLEAN NOT NULL DEFAULT false,
  tao_luc     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS doi_tac_ten ON doi_tac (lower(ten)) WHERE NOT da_xoa;
-- Đưa sẵn các tên đã nhập ở khoản vào danh bạ
INSERT INTO doi_tac (ten)
  SELECT DISTINCT ON (lower(doi_tac)) doi_tac FROM khoan WHERE NOT da_xoa AND doi_tac <> ''
  ON CONFLICT DO NOTHING;
