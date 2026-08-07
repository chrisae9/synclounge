const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const rootPackage = require('../package.json');
const socketServerPackage = require('../packages/syncloungeserver/package.json');

const projectRoot = path.resolve(__dirname, '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

async function getFreePort() {
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForHealth(url, serverProcess, stderr) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (serverProcess.exitCode != null) {
      assert.fail(`installed server exited before becoming healthy:\n${stderr()}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The listener may not be ready yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.fail(`installed server did not become healthy:\n${stderr()}`);
}

describe('npm package artifact', () => {
  it('declares every bundled socket-server runtime dependency at the package root', () => {
    const dependencyGroups = [
      ['dependencies', 'dependencies'],
      ['optionalDependencies', 'optionalDependencies'],
    ];

    for (const [nestedGroup, rootGroup] of dependencyGroups) {
      for (const dependencyName of Object.keys(socketServerPackage[nestedGroup] ?? {})) {
        assert.ok(
          rootPackage[rootGroup]?.[dependencyName],
          `${dependencyName} must be installable with the root package`,
        );
      }
    }
  });

  it('contains required runtime files without nested dependencies or fixtures', () => {
    const result = spawnSync(
      npmCommand,
      ['pack', '--dry-run', '--json', '--ignore-scripts'],
      { cwd: projectRoot, encoding: 'utf8' },
    );

    assert.equal(result.status, 0, result.stderr);
    const [artifact] = JSON.parse(result.stdout);
    const paths = artifact.files.map(({ path: filePath }) => filePath);

    for (const requiredPath of [
      'cache.js',
      'poster-proxy.js',
      'request-abort.js',
      'server.js',
      'packages/syncloungeserver/package.json',
      'packages/syncloungeserver/dist/lib.js',
    ]) {
      assert.ok(paths.includes(requiredPath), `${requiredPath} should be packaged`);
    }

    const forbiddenPaths = paths.filter((filePath) => (
      filePath.includes('/node_modules/')
      || filePath.includes('/test/')
      || filePath.includes('/.circleci/')
    ));
    assert.deepEqual(forbiddenPaths, []);
  });

  it('installs and launches from the production tarball', async () => {
    const installRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'synclounge-package-'));
    let serverProcess;
    let serverExit;
    let serverStderr = '';

    try {
      const packResult = spawnSync(
        npmCommand,
        ['pack', '--json', '--ignore-scripts', '--pack-destination', installRoot],
        { cwd: projectRoot, encoding: 'utf8' },
      );
      assert.equal(packResult.status, 0, packResult.stderr);
      const [artifact] = JSON.parse(packResult.stdout);
      const tarballPath = path.join(installRoot, artifact.filename);

      fs.writeFileSync(
        path.join(installRoot, 'package.json'),
        '{"name":"synclounge-install-test","private":true}',
      );
      const installResult = spawnSync(
        npmCommand,
        ['install', '--ignore-scripts', '--omit=dev', '--package-lock=false', tarballPath],
        { cwd: installRoot, encoding: 'utf8' },
      );
      assert.equal(installResult.status, 0, installResult.stderr);

      const port = await getFreePort();
      const installedServer = path.join(
        installRoot,
        'node_modules',
        rootPackage.name,
        'server.js',
      );
      serverProcess = spawn(process.execPath, [installedServer], {
        cwd: installRoot,
        env: {
          ...process.env,
          PORT: String(port),
          SL_METADATA_RATE_LIMIT: '0',
          SL_POSTER_RATE_LIMIT: '0',
        },
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      serverExit = new Promise((resolve) => serverProcess.once('exit', resolve));
      serverProcess.stderr.on('data', (chunk) => {
        serverStderr += chunk;
      });

      await waitForHealth(
        `http://127.0.0.1:${port}/health`,
        serverProcess,
        () => serverStderr,
      );
    } finally {
      if (serverProcess?.exitCode == null) serverProcess.kill('SIGTERM');
      if (serverExit) await serverExit;
      fs.rmSync(installRoot, { recursive: true, force: true });
    }
  });
});
