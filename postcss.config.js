/**
 * BSDC — postcss.config.js
 * Purpose : PostCSS pipeline: Tailwind token compilation, nesting-free component CSS, autoprefixer.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Tailwind reads tailwind.config.ts, which maps every utility to a CSS custom property
 *           so themes swap by changing `:root[data-theme]` without rebuilding class names (ADR-008).
 *           autoprefixer targets the browserslist declared in package.json (Android 7+, iOS 15+).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */

/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};

export default config;
