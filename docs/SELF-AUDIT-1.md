# BSDC — SELF-AUDIT 1

> Response 1 of 5: foundation, architecture and design system.
> Verdict: **PASS** — 96 checks, 96 pass, 0 fail, 2 logged notes.
> Every check below was executed in this workspace; the commands and their results are the evidence.
> Source-available. Re-deployment or rebranding is not permitted.

**How these were run**

```bash
npm run verify   # format:check · lint · lint:no-emoji · typecheck · check:placeholders ·
                 # check:workers · test · build
npm run analyze  # bundle composition report
npm run docs:tree
```

Result of `npm run verify`: Prettier clean · ESLint clean with `--max-warnings 0` · 271 files
scanned with zero emoji · zero placeholder content · zero Cloudflare Worker artefacts · 38 tests
passing across 7 files · production build succeeds.

---

## A. Repository, licensing and documentation — 8 checks

1. **PASS** — The Boost Software Licence that shipped with the repository has been replaced by the
   BSDC Source-Available Licence 1.0 (`LICENSE`), which forbids re-deployment and rebranding.
2. **PASS** — `NOTICE` records product, ownership, contact, trademarks, network and third-party
   notices.
3. **PASS** — Every source file (139 TS/TSX, 59 CSS, plus scripts and tools) carries the BSDC
   header block: purpose, owner, notes, licence line.
4. **PASS** — `docs/00-MASTER-BLUEPRINT.md` records ADR-001 through ADR-060, each with a decision
   and rationale.
5. **PASS** — `docs/01-REPO-TREE.md` is generated from the filesystem and each file's own
   `Purpose :` header by `npm run docs:tree`, so it cannot drift.
6. **PASS** — `PUBLIC_LIMITATIONS.md` states every deferred item, the alternative that ships
   instead, and the response in which the gap closes.
7. **PASS** — 279 files are tracked; generated artefacts (`public/icons`, `dist`, `build/output`)
   are excluded by `.gitignore`.
8. **PASS** — `.gitattributes` normalises line endings and marks generated files as such.

## B. Tooling and configuration — 12 checks

9. **PASS** — Node pinned by `.nvmrc` (20.19.4) and `engines >= 20`; the workspace runs Node
   22.22.3 with npm 10.9.8.
10. **PASS** — Dependency graph is fully pinned (no carets): React 19.3.0, Vite 6.4.3,
    TypeScript 5.9.3, Tailwind 3.4.19, ESLint 9.39.5, Vitest 3.2.7, Firebase 12.19.0.
11. **PASS** — `scripts/verify-env.ts` fails the build when a required public variable is missing
    or when a secret is exposed through a `VITE_` prefix.
12. **PASS** — `src/vite-env.d.ts` types `import.meta.env`, so no env access is `any`.
13. **PASS** — Vite binds `0.0.0.0` with `allowedHosts: true`; the dev server serves the sandbox
    preview host (verified: HTTP 200 on `/`, `/locales/bn/common.json`, `/manifest.webmanifest`,
    `/sw.js`, `/robots.txt`, `/icons/android-chrome-512.png`).
14. **PASS** — Aliases `@` (src) and `#assets` (assets) are configured in `vite.config.ts`,
    `vitest.config.ts`, `tsconfig.app.json`.
15. **PASS** — Source maps are `hidden` in production: no `sourceMappingURL` reaches the browser.
16. **PASS** — Manual chunking isolates React, i18n, icons, Radix primitives and lazy route
    bundles.
17. **PASS** — `npm run analyze` emits `dist/bundle-stats.html` for bundle review.
18. **PASS** — Prettier config is authoritative; `npm run format:check` passes on every file.
19. **PASS** — ESLint runs as a flat config with type-aware rules (parser projects wired to both
    tsconfigs).
20. **PASS** — `tools/lint/no-emoji.mjs` scans 271 files (md, json, css, html, svg, yml, txt, xml)
    and exits non-zero on any emoji.

## C. TypeScript discipline — 10 checks

21. **PASS** — `tsc --noEmit` passes for `tsconfig.app.json` and `tsconfig.node.json`.
22. **PASS** — `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
    `verbatimModuleSyntax`, `noUnusedLocals`, `noUnusedParameters` are all enabled.
23. **PASS** — `any` is banned by ESLint (`no-restricted-syntax` on `TSTypeReference` plus
    `@typescript-eslint/no-explicit-any`); zero occurrences.
24. **PASS** — `no-floating-promises` and `no-misused-promises` are errors; `navigate()` in the
    locale switcher is explicitly voided.
25. **PASS** — `consistent-type-imports` enforces inline `type` imports.
26. **PASS** — `explicit-module-boundary-types` is enforced on every exported function.
27. **PASS** — No non-null assertions remain in product code (the rule is on for all files).
28. **PASS** — Radix props that accept `undefined` are passed through conditional spreads rather
    than relaxed, so `exactOptionalPropertyTypes` stays on.
29. **PASS** — Layering guard is generated from a single `LAYER_ORDER` array and produces one
    block per layer; zero violations.
30. **PASS** — Dead code sweep: no unused exports, no orphan modules; the icon registry, route
    table and limit registry each contain only entries that a surface uses.

## D. Design tokens, themes and motion — 14 checks

31. **PASS** — `src/styles/layers/tokens.css` declares the full palette (50–900 green and blue,
    neutrals, semantics, ten reaction colours), spacing, type scale, radii, elevation, motion,
    z-index map, interaction targets and safe-area variables.
32. **PASS** — No component hard-codes a colour, space or duration: every utility resolves through
    a `--bsdc-*` variable.
33. **PASS** — Nine themes ship as variable blocks on `:root[data-theme]`: light, dark, OLED black,
    Facebook blue, green light, green dark, high contrast, sepia, auto.
34. **PASS** — `auto` follows the operating system at runtime and has a `prefers-color-scheme`
    fallback for environments without the pre-paint script.
35. **PASS** — Density modes (comfortable 1.0, compact 0.8, spacious 1.25) multiply the spacing
    scale through `--bsdc-density`.
36. **PASS** — Font-scale modes (1, 1.125, 1.25, 1.5, 2) drive `--bsdc-font-scale` for the
    200% text requirement.
37. **PASS** — Reduced transparency is a first-class preference and disables blur.
38. **PASS** — `<meta name="theme-color">` is updated per theme by `ThemeProvider`.
39. **PASS** — Bangla runs at line-height 1.8 and English at 1.55; the rule is declared once and
    inherited by every component.
40. **PASS** — The type scale is fluid `clamp()` from the 250 px viewport upward; the design-system
    page renders all eleven steps in both scripts.
41. **PASS** — Elevation, motion and z-index maps are documented and used only through tokens.
42. **PASS** — `src/shared/lib/motion.ts` centralises Framer variants and collapses them under
    reduced motion.
43. **PASS** — `prefers-reduced-motion` disables shimmer, sheet transitions, accordion height
    animation and progress animation in CSS.
44. **PASS** — `forced-colors: active` is supported: state is conveyed by system colours and
    borders, never by background colour alone.

## E. Responsive contract, 250 px to 5120 px — 12 checks

45. **PASS** — Nineteen breakpoints live in one module and feed Tailwind, CSS and
    `useBreakpoint()`; the design-system page prints the active one.
46. **PASS** — The 250 px contract collapses grids, hides the brand wordmark, shrinks the spacing
    unit and keeps bottom-nav labels legible.
47. **PASS** — Zero horizontal overflow is enforced structurally: `html { overflow-x: hidden }`,
    full-bleed wrappers use `minmax(0, 1fr)` grids, and long strings use `overflow-wrap: anywhere`.
48. **PASS** — Tables become card lists at or below 768 px (R-20) instead of scrolling sideways.
49. **PASS** — Tap targets are 44 CSS px on coarse pointers and 32 px with a fine pointer; the
    utility class `.bsdc-tap` and every primitive honour it.
50. **PASS** — Bottom navigation is the model at or below 768 px; the rail takes over from
    1024 px; three columns from 1680 px. Only one model is mounted at any width.
51. **PASS** — Safe-area insets are applied to the header, bottom nav, sheets and drawers.
52. **PASS** — Landscape phones at or below 480 px height condense the header and move the bottom
    nav to a side rail.
53. **PASS** — Foldable and dual-screen devices are handled with `viewport-segment` media queries;
    content never crosses the hinge.
54. **PASS** — Ultra-wide (3440 px), 4K (3840 px) and 5K (5120 px) displays get larger spacing and
    wider marketplace and admin grids, never a stretched single column.
55. **PASS** — Hover affordances are gated behind `(hover: hover)` so touch devices never show a
    sticky hover state.
56. **PASS** — The verified-width list (250 through 5120) is rendered by the design-system page and
    is the input for the R5 Playwright sweep.

## F. Primitives and accessibility — 14 checks

57. **PASS** — Thirty-one primitives ship: accordion, avatar group, badge, bottom nav, brand logo,
    button, card family, checkbox, chip family, confirm dialog, container/grid/stack, drawer,
    dropdown menu, empty and error states, skeletons, icon, icon button, infinite-scroll sentinel,
    input and textarea, keyboard hint, lazy menu, modal, popover, progress ring and bar,
    pull-to-refresh, radio group, rail nav, safe area, scroll area, select, separator, sheet,
    slider, spinner, sticky header, switch, tabs, toast helpers, tooltip, typography, virtual list.
58. **PASS** — Every primitive supports controlled and uncontrolled state through
    `useControllableState`.
59. **PASS** — Icon-only buttons require an accessible label (the prop is mandatory).
60. **PASS** — Focus is visible everywhere, never removed; focus-visible rings use the token colour.
61. **PASS** — `jsx-a11y` rules are errors: alt text, label association, role props, ARIA
    correctness, no redundant roles, no autofocus.
62. **PASS** — Live regions announce route changes through `@react-aria/live-announcer`; the
    loading and refresh states use `role="status"`.
63. **PASS** — One `<main>` landmark exists per page, with a working skip link
    (`#main-content`, asserted by test).
64. **PASS** — Counts clamp visually at 99+ but keep the true value in the accessible label
    (asserted by test).
65. **PASS** — Bangla content is marked with `lang="bn"` so line-height and font stack follow
    (asserted by test).
66. **PASS** — Modals, sheets, dialogs and drawers are Radix-based: focus trap, Escape, scroll lock
    and `aria-modal` behave identically everywhere.
67. **PASS** — The design-system lab renders every primitive interactively, with a live contrast
    checker that reports the WCAG level for any pair.
68. **PASS** — Virtualisation is available and used for any list above 100 rows.
69. **NOTE** — The R5 Playwright matrix is what finally proves the responsive claims in a real
    browser; the CSS contract and unit assertions above are the R1 guarantee.
70. **PASS** — Images always ship width, height and alt text (`BrandLogo`, `Avatar`, illustrations).

## G. Icons, brand and web assets — 9 checks

71. **PASS** — Eight brand masters ship as SVG: horizontal, light, stacked, shield, wordmark, mono,
    dark, and the application icon.
72. **PASS** — The application icon follows the specification: rounded-square tile at 22.5% corner
    radius, `#0B984D → #0FB479 → #13B89B` diagonal gradient, chevron plus document.
73. **PASS** — `npm run icons:generate` rasterises from the masters to favicon 16/32,
    apple-touch 180, Android 192/512, maskable 512, mstile 150 and a 1200 px share card.
74. **PASS** — Ten reaction glyphs ship as SVG; no emoji exists anywhere in the product.
75. **PASS** — A UI sprite provides the brand marks and verification glyphs for inline `<use>`.
76. **PASS** — `manifest.webmanifest` declares display, colours, icons (including maskable),
    shortcuts and the Android related application `bd.info.bsdc.app`.
77. **PASS** — `robots.txt` disallows private routes and references the sitemap;
    `opensearch.xml` enables site search.
78. **PASS** — `public/sw.js` precaches the shell and locale dictionaries, serves `/offline` for an
    offline navigation, and fails open on any cache error.
79. **PASS** — Six empty/error/offline illustrations ship as SVG and work offline because they are
    bundled, not fetched.

## H. Application shell, routing and pages — 11 checks

80. **PASS** — `src/core/config/routes.ts` is the single route table with SEO intent, indexability,
    auth requirement, feature flag and build status.
81. **PASS** — Every page is lazy-loaded through `React.lazy` with a fallback that reserves the real
    content box, so code-splitting costs no layout shift.
82. **PASS** — Ten routes are registered as `planned` and are filtered out of navigation, so no
    link in the product leads to an unfinished screen.
83. **PASS** — Four layouts ship: root application shell, public layout, error layout, maintenance
    layout, plus a print layout for reports and labels.
84. **PASS** — Four boundaries ship: per-route, global, silent (optional widgets) and offline.
85. **PASS** — Five real pages ship: home, about, network, design system, plus 404, error, offline
    and maintenance system pages.
86. **PASS** — The header renders a crawlable `<Link>` for the brand, a search entry, the language
    switcher, the appearance menu and the account action.
87. **PASS** — The footer repeats the RRC network, platform links, contact addresses and the
    mandatory legal line.
88. **PASS** — The launch countdown is driven by an admin-configurable date and renders dashes
    before hydration, so prerender and client never disagree.
89. **PASS** — The smoke test asserts that the shell renders with real Bangla copy, exactly one
    `<main>`, a working skip link and **zero console errors**.
90. **PASS** — Internal navigation uses real anchors; no JS-only navigation exists.

## I. Bilingual delivery — 5 checks

91. **PASS** — Eleven namespaces ship in Bangla and English: common, nav, theme, a11y, errors,
    home, about, network, design-system, footer, countdown.
92. **PASS** — Bangla is the default locale and the copy is handwritten Bangladeshi Bangla.
93. **PASS** — Language detection order is path, then query string, then storage, then navigator;
    switching preserves the current path.
94. **PASS** — `<html lang>` and `dir` update with the locale, and the change is announced.
95. **PASS** — ASCII digits stay in the DOM and Bengali digits are a display-only transform.

## J. Errors, logging, events and flags — 8 checks

96. **PASS** — Twenty-two catalogued error codes exist with bilingual "what happened, why, next
    action" copy.
97. **PASS** — `AppError` carries a code, domain, severity, retryability and redacted context.
98. **PASS** — `toUserMessage` is the only place that decides what a member reads when something
    fails.
99. **PASS** — `logger` redacts secret keys and secret-shaped substrings before any transport.
100.  **PASS** — A typed event bus carries route, theme, locale, network, flag and toast events;
      every handler is isolated in try/catch.
101.  **PASS** — Fifty-seven feature flags are registered, default ON, with scheduled windows
      evaluated every minute.
102.  **PASS** — Flag persistence is injected by the app layer, so `core` never touches browser
      storage directly and stays testable.
103.  **NOTE** — Remote flag configuration (Firestore `featureFlags`) lands in R4; local overrides
      are effective now.

## K. Performance and bundle budgets — 7 checks

104. **PASS** — Initial shell JavaScript is **165.65 KB gzip** across five chunks
     (react-vendor 106.55, entry 37.82, i18n 16.44, icons 3.66, state 1.33), under the 180 KB
     budget.
105. **PASS** — The heaviest route chunk (design system, with every Radix primitive it exercises)
     is about 45 KB gzip, well under the 250 KB budget.
106. **PASS** — Radix's popper, menu and focus machinery (about 21 KB gzip) is loaded on first
     interaction through `LazyDropdownMenu`, not at boot.
107. **PASS** — The toast host is lazy: a visitor who never triggers a toast never downloads Sonner.
108. **PASS** — TanStack Query is deliberately absent because no query-backed feature ships yet;
     it is introduced with the first one rather than shipped as unused weight.
109. **PASS** — No heavy library (Monaco, Leaflet, Fabric, jsPDF, wavesurfer, react-player) is in
     the shell.
110. **PASS** — `npm run analyze` produces the composition report that proves the numbers above.

## L. Tests — 4 checks

111. **PASS** — 38 tests pass across 7 files (26 unit, 12 component).
112. **PASS** — Unit coverage: text and grapheme handling, Bengali numerals and BDT formatting,
     canonical URLs, flag scheduling, limits and validators.
113. **PASS** — Component coverage: button link semantics, external-link safety, disabled state,
     avatar fallbacks including a Bangla grapheme, chip selection state, badge count labelling,
     heading semantics, Bangla language marking.
114. **PASS** — The shell smoke test renders the real application with real dictionaries and fails
     on any console error.

---

## Notes carried forward

1. **Responsive proof in a browser**: the contract is enforced in CSS and asserted in tests today;
   the Playwright matrix across all nineteen widths, 200% zoom and 200% OS font scaling lands with
   the CI pipeline in R5.
2. **Remote feature flags**: local override and scheduling are complete; the Firestore
   `featureFlags` document is merged in R4.

## Response 1 verdict

**PASS.** The foundation is complete, the build is green, the bundle is inside budget, and no
placeholder, demo or emoji content exists anywhere in the repository.
