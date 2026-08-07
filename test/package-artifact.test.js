const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const rootPackage = require('../package.json');
const socketServerPackage = require('../packages/syncloungeserver/package.json');

const projectRoot = path.resolve(__dirname, '..');

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
    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
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
});
