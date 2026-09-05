/* eslint-disable max-classes-per-file */
const { it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

it('ships lockfile-pinned receiver dependencies with a CSP-compatible bootstrap', async () => {
  const dist = path.join(__dirname, '../dist');
  const html = fs.readFileSync(path.join(dist, 'cast-receiver.html'), 'utf8');
  assert.ok(!html.includes('cdn.jsdelivr.net'));
  assert.ok(!html.includes('src="//'));
  assert.ok(html.includes("script-src 'self' https://www.gstatic.com"));
  for (const [asset, modulePath] of [
    ['cast-vendor/mux.min.js', 'cast-mux.js/dist/mux.min.js'],
    ['cast-vendor/shaka-player.compiled.js', 'shaka-player/dist/shaka-player.compiled.js'],
  ]) {
    assert.deepEqual(fs.readFileSync(path.join(dist, asset)), fs.readFileSync(require.resolve(modulePath)));
  }
  const muxContext = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(dist, 'cast-vendor/mux.min.js'), 'utf8'), muxContext);
  assert.ok(muxContext.muxjs);
  let receiverStarted = false;
  const video = {};
  const context = vm.createContext({
    document: { getElementById: () => video },
    shaka: {
      polyfill: { installAll() {} },
      Player: class { async attach(element) { assert.equal(element, video); } },
      cast: { CastReceiver: class { constructor(element) { assert.equal(element, video); receiverStarted = true; } } },
    },
  });
  vm.runInContext(fs.readFileSync(path.join(dist, 'cast-receiver.js'), 'utf8'), context);
  await new Promise((resolve) => { setImmediate(resolve); });
  assert.equal(receiverStarted, true);
});
