-- Đăng nhập bằng vân tay / khuôn mặt (passkey, WebAuthn). Mỗi máy đã bật là một dòng.
CREATE TABLE IF NOT EXISTS passkey (
  id          TEXT PRIMARY KEY,            -- mã khóa (base64url) do máy tạo
  nguoi_id    INTEGER NOT NULL REFERENCES nguoi_dung(id) ON DELETE CASCADE,
  khoa_cong   BYTEA NOT NULL,              -- khóa công khai; máy chủ không giữ bí mật nào
  dem         BIGINT NOT NULL DEFAULT 0,
  cach_noi    TEXT[] NOT NULL DEFAULT '{}',
  ten_may     TEXT NOT NULL DEFAULT '',
  tao_luc     TIMESTAMPTZ NOT NULL DEFAULT now(),
  dung_luc    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS passkey_nguoi ON passkey (nguoi_id);
