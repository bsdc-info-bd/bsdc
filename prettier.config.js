/**
 * BSDC — prettier.config.js
 * Purpose : Deterministic formatting for TS/TSX/JS/CSS/JSON/MD/HTML/YAML.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Kept aligned with .editorconfig (2 spaces, LF, final newline).
 *           ADR-014: formatting is enforced in CI through `npm run format:check`.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */

/** @type {import('prettier').Config} */
const config = {
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  arrowParens: 'always',
  bracketSpacing: true,
  endOfLine: 'lf',
  overrides: [
    {
      files: ['*.md', '*.yml', '*.yaml'],
      options: { printWidth: 100, proseWrap: 'preserve' },
    },
    {
      files: ['*.css'],
      options: { singleQuote: false },
    },
  ],
};

export default config;
