const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const configModule = import(pathToFileURL(path.join(__dirname, '..', 'vite.config.mjs')).href);
const files = {
  'src/pwa/service-worker.js': 'const CACHE_NAME = "__SL_CACHE_NAME__";',
  'index.html': '<title>SyncLounge</title>',
  'public/manifest.webmanifest': '{"name":"SyncLounge"}',
  'public/offline.html': '<h1>Offline</h1>',
  'public/offline.css': 'body{color:white}',
  'public/offline-report.js': 'void 0;',
  'public/icons/icon-192.png': new Uint8Array([1, 2, 3]),
  'public/icons/icon.svg': '<svg/>',
};
const bundle = {
  'assets/app.js': { type: 'chunk', code: 'console.log("SyncLounge")' },
  'assets/app.css': { type: 'asset', source: 'body{background:black}' },
  'assets/logo.png': { type: 'asset', source: new Uint8Array([4, 5, 6]) },
};

async function generateWorker({ inputFiles = files, inputBundle = bundle } = {}) {
  const { generatePwaPlugin } = await configModule;
  const emitted = [];
  const plugin = generatePwaPlugin({
    readFile: (name) => {
      assert.ok(Object.hasOwn(inputFiles, name), `Unknown build input: ${name}`);
      return inputFiles[name];
    },
  });
  plugin.generateBundle.call({ emitFile: (asset) => emitted.push(asset) }, {}, inputBundle);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].fileName, 'sw.js');
  assert.ok(!emitted[0].source.includes('__SL_CACHE_NAME__'));
  return emitted[0].source;
}

test('worker revision changes for CSS-only and other emitted asset updates', async () => {
  const before = await generateWorker();
  for (const [fileName, changed] of [
    ['assets/app.css', { type: 'asset', source: 'body{background:navy}' }],
    ['assets/logo.png', { type: 'asset', source: new Uint8Array([7, 8, 9]) }],
    ['assets/app.js', { type: 'chunk', code: 'console.log("Updated SyncLounge")' }],
  ]) {
    // Compare each independent one-file change against the same unchanged build.
    // eslint-disable-next-line no-await-in-loop
    const after = await generateWorker({ inputBundle: { ...bundle, [fileName]: changed } });
    assert.notEqual(after, before, `${fileName} must invalidate the worker revision`);
  }
});

test('worker revision changes for HTML or manifest metadata without changing the app bundle', async () => {
  const before = await generateWorker();
  await Promise.all([
    ['index.html', '<title>SyncLounge · Movie night</title>'],
    ['public/manifest.webmanifest', '{"name":"SyncLounge","theme_color":"#141418"}'],
    ['public/offline.css', 'body{color:gold}'],
  ].map(async ([fileName, source]) => {
    const after = await generateWorker({ inputFiles: { ...files, [fileName]: source } });
    assert.notEqual(after, before, `${fileName} must invalidate the worker revision`);
  }));
});

test('unchanged or reordered builds keep the same revision while asset renames change it', async () => {
  const before = await generateWorker();
  assert.equal(await generateWorker(), before);
  const reordered = Object.fromEntries(Object.entries(bundle).reverse());
  assert.equal(await generateWorker({ inputBundle: reordered }), before);
  const renamed = { ...bundle, 'assets/renamed.css': bundle['assets/app.css'] };
  delete renamed['assets/app.css'];
  assert.notEqual(await generateWorker({ inputBundle: renamed }), before);
});
