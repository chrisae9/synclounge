const path = require('node:path');

module.exports = {
  root: true,
  env: {
    browser: true,
    es2020: true,
  },
  extends: ['plugin:vue/vue3-recommended', 'airbnb-base'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  rules: {
    'max-len': [
      'error',
      {
        code: 120,
      },
    ],

    'no-console': 'off',
    'no-param-reassign': ['error', {
      props: true,
      ignorePropertyModificationsFor: ['state', 'el'],
    }],
    'no-restricted-syntax': 'off',
    'no-underscore-dangle': 'off',
    'class-methods-use-this': 'off',
    'import/no-extraneous-dependencies': ['error', { devDependencies: true }],
    'vuejs-accessibility/alt-text': 'off',
    'vuejs-accessibility/mouse-events-have-key-events': 'off',
    'vuejs-accessibility/label-has-for': 'off',
    'vuejs-accessibility/media-has-caption': 'off',
    'vuejs-accessibility/click-events-have-key-events': 'off',
    'vue/no-v-text-v-html-on-component': 'off',
    'vue/no-template-target-blank': 'off',
    'import/no-unresolved': ['error', {
      ignore: ['^@/'],
    }],
  },
  settings: {
    'import/resolver': {
      alias: {
        map: [['@', path.resolve(__dirname, './src')]],
        extensions: ['.js', '.vue', '.json'],
      },
    },
  },
};
