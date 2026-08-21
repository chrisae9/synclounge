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
const npmTimeoutMs = 120000;
const shutdownTimeoutMs = 5000;

function parseNpmJsonOutput(stdout, requiredField) {
  const candidates = [...stdout.matchAll(/(^|\n)\s*\[/g)]
    .map((match) => match.index + match[0].lastIndexOf('['));
  let parseError;

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    try {
      const parsed = JSON.parse(stdout.slice(candidates[index]).trim());
      if (Array.isArray(parsed) && parsed.length === 1 && parsed[0]?.[requiredField]) {
        return parsed;
      }
    } catch (error) {
      parseError = error;
    }
  }

  throw parseError ?? new SyntaxError(`npm pack did not return ${requiredField} JSON`);
}

async function getFreePort() {
  const server = http.createServer();
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve) => {
    server.close(resolve);
  });
  return port;
}

async function waitForHealth(url, serverProcess, stderr) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (serverProcess.exitCode != null) {
      assert.fail(`installed server exited before becoming healthy:\n${stderr()}`);
    }
    try {
      // Polling must remain serial so process exit is checked before each request.
      // eslint-disable-next-line no-await-in-loop
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch {
      // The listener may not be ready yet.
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => {
      setTimeout(resolve, 200);
    });
  }
  assert.fail(`installed server did not become healthy:\n${stderr()}`);
}

async function stopServer(serverProcess, serverExit) {
  if (!serverProcess || !serverExit) return;
  if (serverProcess.exitCode != null || serverProcess.signalCode != null) return;

  serverProcess.kill('SIGTERM');
  const waitForExit = async () => {
    let shutdownTimer;
    const exited = await Promise.race([
      serverExit.then(() => true),
      new Promise((resolve) => {
        shutdownTimer = setTimeout(() => resolve(false), shutdownTimeoutMs);
      }),
    ]);
    clearTimeout(shutdownTimer);
    return exited;
  };

  if (!await waitForExit() && serverProcess.exitCode == null && serverProcess.signalCode == null) {
    serverProcess.kill('SIGKILL');
    assert.ok(await waitForExit(), 'installed server did not exit after SIGKILL');
  }
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
      {
        cwd: projectRoot,
        encoding: 'utf8',
        env: { ...process.env, SKIP_BUILD: 'true' },
        timeout: npmTimeoutMs,
      },
    );

    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    const [artifact] = parseNpmJsonOutput(result.stdout, 'files');
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
      /(^|\/)(node_modules|test|\.circleci)(\/|$)/.test(filePath)
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
        {
          cwd: projectRoot,
          encoding: 'utf8',
          env: { ...process.env, SKIP_BUILD: 'true' },
          timeout: npmTimeoutMs,
        },
      );
      assert.ifError(packResult.error);
      assert.equal(packResult.status, 0, packResult.stderr);
      const [artifact] = parseNpmJsonOutput(packResult.stdout, 'filename');
      const tarballPath = path.join(installRoot, artifact.filename);

      fs.writeFileSync(
        path.join(installRoot, 'package.json'),
        '{"name":"synclounge-install-test","private":true}',
      );
      const installResult = spawnSync(
        npmCommand,
        ['install', '--ignore-scripts', '--omit=dev', '--package-lock=false', tarballPath],
        { cwd: installRoot, encoding: 'utf8', timeout: npmTimeoutMs },
      );
      assert.ifError(installResult.error);
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
      serverExit = new Promise((resolve) => {
        serverProcess.once('error', resolve);
        serverProcess.once('close', resolve);
      });
      serverProcess.stderr.on('data', (chunk) => {
        serverStderr += chunk;
      });

      await waitForHealth(
        `http://127.0.0.1:${port}/health`,
        serverProcess,
        () => serverStderr,
      );
    } finally {
      try {
        await stopServer(serverProcess, serverExit);
      } finally {
        fs.rmSync(installRoot, { recursive: true, force: true });
      }
    }
  });
});
