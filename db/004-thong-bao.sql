-- Thông báo đẩy: mỗi máy (trình duyệt) đã bật là một đăng ký.
CREATE TABLE IF NOT EXISTS dang_ky_thong_bao (
  id        SERIAL PRIMARY KEY,
  nguoi_id  INT NOT NULL REFERENCES nguoi_dung(id) ON DELETE CASCADE,
  endpoint  TEXT NOT NULL UNIQUE,
  p256dh    TEXT NOT NULL,
  auth      TEXT NOT NULL,
  tao_luc   TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Cấu hình nhỏ của app: khóa VAPID, ngày đã gửi báo sáng.
CREATE TABLE IF NOT EXISTS cau_hinh (
  khoa     TEXT PRIMARY KEY,
  gia_tri  JSONB NOT NULL
);
