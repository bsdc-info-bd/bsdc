/* ESLint 8 classic config — TS + React hooks + JSX a11y (brief §11). */
module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
    'plugin:jsx-a11y/recommended',
    'prettier',
  ],
  ignorePatterns: [
    'dist',
    'coverage',
    'shots',
    'test-results',
    'playwright-report',
    'node_modules',
    '*.cjs',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['@typescript-eslint', 'react-refresh', 'jsx-a11y'],
  settings: {},
  rules: {
    // Route/config modules legitimately export non-components (e.g. appRoutes).
    'react-refresh/only-export-components': 'off',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    'no-console': ['error', { allow: ['warn', 'error'] }],
    eqeqeq: ['error', 'always'],
  },
  overrides: [
    {
      files: ['scripts/**/*.mjs'],
      env: { node: true },
      rules: { 'no-console': 'off' },
    },
  ],
};
