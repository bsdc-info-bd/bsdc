/**
 * BSDC — eslint.config.js
 * Purpose : Flat ESLint configuration enforcing the engineering rules of conduct (PART 01.04)
 *           and the platform laws (PART 04) as build-breaking errors.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Warnings are errors: CI runs `eslint . --max-warnings 0` (ADR-014).
 *           The layering rule (app -> pages -> widgets -> features -> entities -> shared)
 *           is enforced with import restrictions so architecture cannot rot.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import js from '@eslint/js';
import tsEslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';
import bsdc from './tools/lint/eslint-plugin-bsdc.mjs';

/** Directories that are generated, vendored or otherwise not ours to lint. */
const IGNORED = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/output/**',
  '**/coverage/**',
  '**/android/**',
  '**/functions/lib/**',
  '**/.vite/**',
  '**/public/sw.js',
  '**/public/firebase-messaging-sw.js',
  '**/public/OneSignalSDKWorker.js',
  // Cloud Functions are a separate deployment unit with their own tsconfig, toolchain and
  // typecheck gate (`npm run verify:functions`). They are excluded here so the browser lint run
  // never needs the Functions toolchain installed.
  '**/functions/**',
];

/**
 * Layer order used by the architecture import guard (ADR-003).
 * A layer may import from itself and from every layer to its right; importing leftwards is an
 * error. `core` is the deepest layer (configuration, errors, logging, events): it depends on
 * nothing but the platform. `shared` is the UI kit, hooks and libraries: it may read core.
 */
const LAYER_ORDER = [
  'app',
  'pages',
  'widgets',
  'features',
  'entities',
  'services',
  'shared',
  'core',
];

/** Per-layer import guard blocks, generated from LAYER_ORDER (one rule, no drift). */
const layerBlocks = LAYER_ORDER.map((layer, index) => {
  const above = LAYER_ORDER.slice(0, index);
  return {
    files: [`src/${layer}/**/*.{ts,tsx}`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: above.flatMap((higher) => [`@/${higher}/*`, `**/${higher}/*`]),
              message: `ADR-003: ${layer} must not import from a layer above it (${
                above.join(', ') || 'none'
              }). Import direction is app -> pages -> widgets -> features -> entities -> services -> shared -> core.`,
            },
          ],
        },
      ],
    },
  };
}).filter((block) => block.rules['no-restricted-imports'][1].patterns[0]?.group.length !== 0);

export default tsEslint.config(
  { ignores: IGNORED },
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    extends: [js.configs.recommended],
    plugins: { bsdc },
    rules: {
      'bsdc/no-emoji': 'error',
      'no-console': ['error', { allow: ['warn', 'error', 'info'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-implicit-coercion': 'error',
      curly: ['error', 'all'],
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        ecmaFeatures: { jsx: true },
        // Type-aware rules (no-floating-promises, await-thenable, strictTypeChecked) need a
        // program. Both project references are listed so src, scripts and tools are covered.
        project: ['./tsconfig.app.json', './tsconfig.node.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    extends: [
      js.configs.recommended,
      ...tsEslint.configs.strictTypeChecked,
      ...tsEslint.configs.stylisticTypeChecked,
    ],
    plugins: { 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y, bsdc },
    settings: {
      'import/resolver': { typescript: { alwaysTryTypes: true } },
    },
    rules: {
      // ---- platform laws -------------------------------------------------
      'bsdc/no-emoji': 'error',
      'bsdc/no-placeholder-text': 'error',

      // ---- react ---------------------------------------------------------
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',

      // ---- accessibility --------------------------------------------------
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/anchor-is-valid': 'error',
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/aria-proptypes': 'error',
      'jsx-a11y/aria-unsupported-elements': 'error',
      'jsx-a11y/click-events-have-key-events': 'error',
      'jsx-a11y/heading-has-content': 'error',
      'jsx-a11y/iframe-has-title': 'error',
      'jsx-a11y/label-has-associated-control': 'error',
      'jsx-a11y/media-has-caption': 'error',
      'jsx-a11y/no-autofocus': 'error',
      'jsx-a11y/no-redundant-roles': 'error',
      'jsx-a11y/role-has-required-aria-props': 'error',
      'jsx-a11y/role-supports-aria-props': 'error',

      // ---- typescript discipline -------------------------------------------
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-confusing-void-expression': [
        'error',
        { ignoreArrowShorthand: true, ignoreVoidOperator: true },
      ],
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true },
      ],
      '@typescript-eslint/no-invalid-void-type': ['error', { allowAsThisParameter: true }],
      // Return-position generics (fromDocument<T>, mirrorList<T>, readThrough<T>) are the
      // boundary where an untyped backend payload becomes a typed entity. The rule's alternative
      // — return `unknown` and assert at every call site — spreads the same unchecked cast over
      // hundreds of lines instead of confining it to one audited converter.
      '@typescript-eslint/no-unnecessary-type-parameters': 'off',
      '@typescript-eslint/no-restricted-imports': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-expect-error': 'allow-with-description', 'ts-ignore': 'allow-with-description' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSTypeReference[typeName.name="any"]',
          message:
            'LAW of types: `any` is forbidden. Use `unknown` and narrow, or a precise generic.',
        },
      ],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      // Nested ternaries are allowed when they stay single-expression: the alternative in most
      // call sites is a helper function that spreads one decision over ten lines.
      'no-nested-ternary': 'off',
      'default-case-last': 'error',
    },
  },
  // ---- layering guard (ADR-003) -------------------------------------------
  ...layerBlocks,

  {
    files: ['**/*.test.{ts,tsx}', 'src/tests/**/*.{ts,tsx}', '**/*.config.{ts,js,mjs}'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      'no-console': 'off',
    },
  },
  {
    files: ['scripts/**/*.ts', 'build/**/*.ts', 'tools/**/*.mjs'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },
);
