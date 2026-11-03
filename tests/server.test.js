import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createAppServer } from '../scripts/serve.mjs';

test('試作を配信し、設定・テスト・ディレクトリ外のファイルは公開しない', async context => {
  const server = createAppServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const home = await fetch(base);
  assert.equal(home.status, 200);
  assert.match(home.headers.get('content-type'), /text\/html/);
  assert.match(await home.text(), /日報入力/);
  assert.match(home.headers.get('content-security-policy'), /connect-src 'none'/);
  for (const path of ['/public/styles.css', '/src/ui/app.js', '/src/domain/reports.js', '/src/data/demo.js']) {
    assert.equal((await fetch(base + path)).status, 200, path);
  }
  for (const path of ['/README.md', '/package.json', '/.env', '/tests/reports.test.js', '/public/%2e%2e%2fpackage.json', '/src/../../package.json']) {
    assert.equal((await fetch(base + path)).status, 404, path);
  }
  assert.equal((await fetch(base + '/%ZZ')).status, 400);
  assert.equal((await fetch(base, { method: 'POST' })).status, 405);
  assert.equal(await (await fetch(base, { method: 'HEAD' })).text(), '');
});
