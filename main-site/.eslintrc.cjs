/* eslint-env node */
module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended-type-checked',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
    'plugin:jsx-a11y/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    project: ['./tsconfig.json'],
    tsconfigRootDir: __dirname,
  },
  plugins: ['@typescript-eslint', 'react-refresh'],
  settings: { react: { version: 'detect' } },
  ignorePatterns: ['dist', 'dev-dist', 'node_modules', '.eslintrc.cjs', 'postcss.config.js', 'functions'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    'no-console': ['error', { allow: ['warn', 'error'] }],
    eqeqeq: ['error', 'always'],
  },
  overrides: [
    {
      files: ['scripts/**/*.mjs'],
      env: { node: true, browser: false },
      extends: ['plugin:@typescript-eslint/disable-type-checked'],
      parserOptions: { project: null },
      rules: {
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-argument': 'off',
      },
    },
    {
      files: ['src/**/*.test.{ts,tsx}', 'src/test/**/*.ts'],
      env: { node: true },
    },
  ],
};
