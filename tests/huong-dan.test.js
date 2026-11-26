/* Nút ? chỉ có ích khi khoanh đúng chỗ: mọi id trong các bước hướng dẫn phải còn trong giao diện.
 * Đổi id hoặc bỏ nút trong app.js mà quên sửa public/huong-dan.js thì bài này đỏ. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('các bước hướng dẫn trỏ đúng phần tử có thật', () => {
  const g = { window: {} };
  new Function('window', fs.readFileSync(path.join(__dirname, '../public/huong-dan.js'), 'utf8'))(g.window);
  const MAN = g.window.HuongDan.MAN;
  const giaoDien = ['app.js', 'index.html'].map((f) => fs.readFileSync(path.join(__dirname, '../public', f), 'utf8')).join('\n');
  const thieu = [];
  for (const [man, buoc] of Object.entries(MAN)) {
    assert.ok(buoc.length > 0, `màn ${man} chưa có bước nào`);
    for (const b of buoc) {
      assert.ok(b.t && b.t.length <= 120, `${man}: chữ bước quá dài hoặc trống: ${b.t}`);
      for (const [, id] of b.s.matchAll(/#([A-Za-z][\w-]*)/g)) if (!giaoDien.includes(`id="${id}"`)) thieu.push(`${man}: #${id}`);
      for (const [, a] of b.s.matchAll(/\[(data-[\w-]+)/g)) if (!giaoDien.includes(a)) thieu.push(`${man}: [${a}]`);
    }
  }
  assert.deepEqual(thieu, [], 'Sửa public/huong-dan.js cho khớp giao diện');
});
