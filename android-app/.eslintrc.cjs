module.exports = {
  root: true,
  env: { es2022: true, browser: true, node: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  ignorePatterns: ['dist', 'android'],
  rules: {
    '@typescript-eslint/consistent-type-imports': 'error',
    'no-console': ['error', { allow: ['warn', 'error'] }],
  },
};
