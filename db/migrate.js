/* Chạy các tệp db/NNN-*.sql chưa chạy, theo thứ tự, mỗi tệp trong một giao dịch. */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function migrate(pool) {
  await pool.query('CREATE TABLE IF NOT EXISTS _migration (ten TEXT PRIMARY KEY, luc TIMESTAMPTZ NOT NULL DEFAULT now())');
  const daChay = new Set((await pool.query('SELECT ten FROM _migration')).rows.map((r) => r.ten));
  const tep = fs.readdirSync(__dirname).filter((f) => /^\d{3}-.*\.sql$/.test(f)).sort();
  for (const f of tep) {
    if (daChay.has(f)) continue;
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(fs.readFileSync(path.join(__dirname, f), 'utf8'));
      await c.query('INSERT INTO _migration (ten) VALUES ($1)', [f]);
      await c.query('COMMIT');
      console.log('migration:', f);
    } catch (e) {
      await c.query('ROLLBACK');
      throw new Error(`migration ${f} lỗi: ${e.message}`);
    } finally {
      c.release();
    }
  }
}

module.exports = { migrate };

if (require.main === module) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  migrate(pool).then(() => pool.end()).catch((e) => { console.error(e.message); process.exit(1); });
}
