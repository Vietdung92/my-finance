/* Tạo hoặc đặt lại mật khẩu cho một tài khoản. In mật khẩu ra màn hình một lần duy nhất.
 *   node scripts/tao-nguoi-dung.js <ten_dang_nhap> "<Tên hiển thị>" <nhap|xem> [mau]
 * Ví dụ:
 *   node scripts/tao-nguoi-dung.js tu "Tú" nhap '#6a4ce2'
 *   node scripts/tao-nguoi-dung.js dung "Dũng" xem '#0f6b55'
 * Chạy lại với tên đã có = cấp mật khẩu mới và đăng xuất mọi máy đang đăng nhập tài khoản đó. */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const { migrate } = require('../db/migrate');

(async () => {
  const [ten, hienThi, quyen, mau = '#0f6b55'] = process.argv.slice(2);
  if (!ten || !hienThi || !['nhap', 'xem'].includes(quyen)) {
    console.error('Dùng: node scripts/tao-nguoi-dung.js <ten_dang_nhap> "<Tên hiển thị>" <nhap|xem> [mau]');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await migrate(pool);
  // 12 ký tự dễ đọc, bỏ các ký tự dễ nhầm (0/O, 1/l/I)
  const bang = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const mk = Array.from(crypto.randomBytes(12), (b) => bang[b % bang.length]).join('');
  await pool.query(
    `INSERT INTO nguoi_dung (ten_dang_nhap, ten_hien_thi, mat_khau_hash, quyen, mau) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (ten_dang_nhap) DO UPDATE SET ten_hien_thi=EXCLUDED.ten_hien_thi, mat_khau_hash=EXCLUDED.mat_khau_hash,
       quyen=EXCLUDED.quyen, mau=EXCLUDED.mau, phien=nguoi_dung.phien+1`,
    [ten.toLowerCase(), hienThi, await bcrypt.hash(mk, 12), quyen, mau]);
  console.log(`Tài khoản: ${ten.toLowerCase()}   Mật khẩu: ${mk}   (${quyen === 'nhap' ? 'nhập liệu' : 'chỉ xem'})`);
  await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
