-- Chu kỳ trả: mỗi kỳ cách nhau bao nhiêu tháng (1 = tháng, 3 = quý, 6 = nửa năm, 12 = năm).
ALTER TABLE khoan ADD COLUMN IF NOT EXISTS chu_ky SMALLINT NOT NULL DEFAULT 1 CHECK (chu_ky IN (1, 3, 6, 12));
-- "Chia lợi nhuận mỗi quý" nay là "chỉ trả lãi mỗi kỳ" với chu kỳ quý
UPDATE khoan SET cach = 'lai_thang', chu_ky = 3 WHERE cach = 'chia_quy';
