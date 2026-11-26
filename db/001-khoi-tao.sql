-- My Finance: cấu trúc dữ liệu ban đầu
CREATE TABLE IF NOT EXISTS nguoi_dung (
  id            SERIAL PRIMARY KEY,
  ten_dang_nhap TEXT NOT NULL UNIQUE,
  ten_hien_thi  TEXT NOT NULL,
  mat_khau_hash TEXT NOT NULL,
  quyen         TEXT NOT NULL CHECK (quyen IN ('nhap','xem')),
  mau           TEXT NOT NULL DEFAULT '#0f6b55',
  phien         INTEGER NOT NULL DEFAULT 0,  -- tăng khi đổi mật khẩu để đăng xuất các máy cũ
  tao_luc       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Một khoản: đi vay, cho người ngoài vay, hoặc đầu tư / tài sản
CREATE TABLE IF NOT EXISTS khoan (
  id              SERIAL PRIMARY KEY,
  chu_id          INTEGER NOT NULL REFERENCES nguoi_dung(id),
  nhom            TEXT NOT NULL CHECK (nhom IN ('no','chovay','dautu')),
  ten             TEXT NOT NULL,
  doi_tac         TEXT NOT NULL,
  goc             NUMERIC(16,0) NOT NULL CHECK (goc > 0),
  bat_dau         DATE NOT NULL,
  ky_han          INTEGER NOT NULL DEFAULT 0 CHECK (ky_han >= 0 AND ky_han <= 600),
  cach            TEXT NOT NULL CHECK (cach IN ('goc_deu','nien_kim','lai_thang','khong_lai','tiet_kiem','chia_quy','tai_san')),
  lai             NUMERIC(8,4) NOT NULL DEFAULT 0,     -- %/năm
  don_vi_lai      TEXT NOT NULL DEFAULT 'nam' CHECK (don_vi_lai IN ('nam','thang')),
  doi_lai         JSONB NOT NULL DEFAULT '[]',          -- [{tu:'YYYY-MM-DD', lai: %/năm}]
  ngay_chot       INTEGER CHECK (ngay_chot BETWEEN 1 AND 31),
  tu_dong_da_tra  BOOLEAN NOT NULL DEFAULT false,
  gia_tri         NUMERIC(16,0),                        -- giá ước tính, chỉ cho tài sản
  ghi_chu         TEXT NOT NULL DEFAULT '',
  da_xoa          BOOLEAN NOT NULL DEFAULT false,
  tao_luc         TIMESTAMPTZ NOT NULL DEFAULT now(),
  sua_luc         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ghi nhận từng kỳ đã trả / chưa trả
CREATE TABLE IF NOT EXISTS thanh_toan (
  id          SERIAL PRIMARY KEY,
  khoan_id    INTEGER NOT NULL REFERENCES khoan(id),
  ky_ngay     DATE NOT NULL,
  trang_thai  TEXT NOT NULL CHECK (trang_thai IN ('da_tra','chua_tra')),
  ghi_chu     TEXT NOT NULL DEFAULT '',
  tao_boi     INTEGER REFERENCES nguoi_dung(id),
  tao_luc     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (khoan_id, ky_ngay)
);

-- Khoản mượn giữa 2 tài khoản
CREATE TABLE IF NOT EXISTS noi_bo (
  id          SERIAL PRIMARY KEY,
  cho_vay_id  INTEGER NOT NULL REFERENCES nguoi_dung(id),
  vay_id      INTEGER NOT NULL REFERENCES nguoi_dung(id),
  goc         NUMERIC(16,0) NOT NULL CHECK (goc > 0),
  ngay        DATE NOT NULL,
  lai_thang   NUMERIC(8,4) NOT NULL DEFAULT 0,   -- %/tháng
  cach_tinh   TEXT NOT NULL DEFAULT 'du_no_ngay' CHECK (cach_tinh IN ('du_no_ngay','co_dinh')),
  ghi_chu     TEXT NOT NULL DEFAULT '',
  da_xoa      BOOLEAN NOT NULL DEFAULT false,
  tao_luc     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (cho_vay_id <> vay_id)
);

-- Mỗi lần chuyển trả: trả gốc hay trả lãi
CREATE TABLE IF NOT EXISTS chuyen_tra (
  id          SERIAL PRIMARY KEY,
  noi_bo_id   INTEGER NOT NULL REFERENCES noi_bo(id),
  ngay        DATE NOT NULL,
  so_tien     NUMERIC(16,0) NOT NULL CHECK (so_tien > 0),
  loai        TEXT NOT NULL CHECK (loai IN ('goc','lai')),
  ghi_chu     TEXT NOT NULL DEFAULT '',
  da_xoa      BOOLEAN NOT NULL DEFAULT false,
  tao_boi     INTEGER REFERENCES nguoi_dung(id),
  tao_luc     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Nhật ký: ai làm gì, lúc nào. lien_quan = những người được xem dòng này
CREATE TABLE IF NOT EXISTS nhat_ky (
  id          SERIAL PRIMARY KEY,
  luc         TIMESTAMPTZ NOT NULL DEFAULT now(),
  nguoi_id    INTEGER REFERENCES nguoi_dung(id),
  viec        TEXT NOT NULL,
  lien_quan   INTEGER[] NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS nhat_ky_luc ON nhat_ky (luc DESC);
