// Use public rule entry points: the package's aggregate entry eagerly loads
// no-internal-modules, an unused rule that imports an API removed in patched minimatch 11.
const ruleNames = [
  'default',
  'export',
  'extensions',
  'first',
  'named',
  'namespace',
  'newline-after-import',
  'no-absolute-path',
  'no-amd',
  'no-cycle',
  'no-duplicates',
  'no-dynamic-require',
  'no-extraneous-dependencies',
  'no-import-module-exports',
  'no-mutable-exports',
  'no-named-as-default',
  'no-named-as-default-member',
  'no-named-default',
  'no-relative-packages',
  'no-self-import',
  'no-unresolved',
  'no-useless-path-segments',
  'no-webpack-loader-syntax',
  'order',
  'prefer-default-export',
];

const rules = Object.fromEntries(await Promise.all(ruleNames.map(async (name) => {
  const { default: rule } = await import(`eslint-plugin-import-x/rules/${name}`);
  return [name, rule];
})));

export default {
  meta: { name: 'eslint-plugin-import-x' },
  rules,
};
