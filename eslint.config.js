const GLOBALS = {
  __dirname: 'readonly',
  __filename: 'readonly',
  process: 'readonly',
  console: 'readonly',
  Buffer: 'readonly',
  FormData: 'readonly',
  Blob: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  fetch: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  global: 'readonly',
  require: 'readonly',
  module: 'readonly',
  exports: 'writable',
};

module.exports = [
  {
    files: ['**/*.js'],
    ignores: ['node_modules/**', 'public/**', 'data/**'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: GLOBALS,
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-dupe-keys': 'error',
    },
  },
];