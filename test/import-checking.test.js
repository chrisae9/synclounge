const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const linter = import('eslint').then(({ ESLint }) => new ESLint({ cwd: root }));

async function lintFixture(t, files, entry = 'entry.js') {
  const directory = fs.mkdtempSync(path.join(root, 'src', '__tests__', 'import-check-fixture-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const [name, source] of Object.entries(files)) fs.writeFileSync(path.join(directory, name), source);
  const instance = await linter;
  const results = await instance.lintFiles([path.join(directory, entry)]);
  return results.flatMap((result) => result.messages);
}

const hasError = (messages, rule) => messages.some((message) => message.ruleId === rule && message.severity === 2);

test('replacement import checks reject missing modules', async (t) => {
  const messages = await lintFixture(t, {
    'entry.js': "import missing from './does-not-exist';\nexport default missing;\n",
  });
  assert.ok(hasError(messages, 'import-x/no-unresolved'));
});

test('replacement import checks reject nonexistent named exports', async (t) => {
  const messages = await lintFixture(t, {
    'entry.js': "import { missing } from './value';\nexport default missing;\n",
    'value.js': 'export const present = 42;\n',
  });
  assert.ok(hasError(messages, 'import-x/named'));
});

test('replacement import checks reject circular dependency graphs', async (t) => {
  const messages = await lintFixture(t, {
    'entry.js': "import next from './next';\nexport default () => next;\n",
    'next.js': "import first from './entry';\nexport default () => first;\n",
  });
  assert.ok(hasError(messages, 'import-x/no-cycle'));
});

test('replacement import checks enforce dependency declarations and ordering', async (t) => {
  const messages = await lintFixture(t, {
    'package.json': '{"name":"import-regression-fixture","private":true}\n',
    'entry.js': "import value from './value';\nimport { ESLint } from 'eslint';\nexport default [value, ESLint];\n",
    'value.js': 'export default 42;\n',
  });
  assert.ok(hasError(messages, 'import-x/no-extraneous-dependencies'));
  assert.ok(hasError(messages, 'import-x/order'));
});

test('replacement import checks inspect Vue script imports', async (t) => {
  const messages = await lintFixture(t, {
    'entry.vue': [
      '<script>',
      'import missing from "./does-not-exist";',
      'export default { setup: () => missing };',
      '</script>',
    ].join('\n'),
  }, 'entry.vue');
  assert.ok(hasError(messages, 'import-x/no-unresolved'));
});

test('replacement resolver resolves existing aliases and rejects missing aliases', async (t) => {
  const instance = await linter;
  const valid = await instance.lintText("import value from '@/utils/customformatduration';\nexport default value;\n", {
    filePath: path.join(root, 'src', '__tests__', 'alias-import-check.js'),
  });
  assert.ok(!hasError(valid.flatMap((result) => result.messages), 'import-x/no-unresolved'));
  const messages = await lintFixture(t, {
    'entry.js': "import missing from '@/__tests__/missing-alias-target';\nexport default missing;\n",
  });
  assert.ok(hasError(messages, 'import-x/no-unresolved'));
});
