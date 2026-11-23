# Baseline audit and gate ledger

Phase 1 of the quality brief (`§9.1`) asked for a baseline: run every gate,
record what actually happened, list every defect, prioritise. This file is that
record. It is written so that a later reader can tell the difference between
_measured_, _not measurable here_, and _claimed elsewhere but never proven_.

The rule this document obeys: **a number written here is a number a command
prints.** Anything that could not be run is listed as unrun, with the reason and
the command that would run it, rather than estimated.

---

## Gate ledger

Current commit's state. Each row is the command, the exact result, and the exit
status. `audit.mjs` re-runs the audit gates itself (F-17, F-22, F-23, F-24,
F-26, F-27 read these numbers live), so the register below cannot silently
disagree with the tree it describes.

| Gate                 | Command                                                     | Result                                                                                                                                            | Exit |
| -------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| Typecheck, app       | `cd main-site && npx tsc --noEmit`                          | no diagnostics                                                                                                                                    | 0    |
| Typecheck, functions | `npm run typecheck`                                         | no diagnostics                                                                                                                                    | 0    |
| Lint                 | `npx eslint . --max-warnings 0`                             | 0 errors, 0 warnings                                                                                                                              | 0    |
| Format               | `npx prettier --check src`                                  | all matched files formatted                                                                                                                       | 0    |
| Tests                | `npx vitest run`                                            | **133 files / 1350 tests** passed                                                                                                                 | 0    |
| Browser smoke        | `cd main-site && npm run test:browser`                      | **57 checks passed, 0 failed** — desktop + Pixel emulation, nine responsive widths from 320 to 2560, and the 44 px touch floor in a phone context | 0    |
| Build                | `npm run build`                                             | built, **16 routes prerendered**                                                                                                                  | 0    |
| Initial JS budget    | `npm run audit` F-01, summing `index-*`/`vendor-*` gzip     | **main-site 158 kB** against 250 kB                                                                                                               | 0    |
| Single-chunk budget  | F-28: per-file gzip of the eager graph in `dist/index.html` | 9 eager modules, largest **64.0 kB**, total **159.9 kB**, against 200 kB each                                                                     | 0    |
| Launch audit         | `node scripts/audit.mjs`                                    | **145 passed, 0 failed, 4 recorded**                                                                                                              | 0    |
| Contrast floor       | `node scripts/contrast-audit.mjs`                           | 1632 pairs × 2 themes; 0 certain, 0 floors, 0 dead names, 0 off-scale alphas, 0 off-token                                                         | 0    |
| Hardcoded colour     | `§11`'s grep, verbatim                                      | **0 lines** outside the design system and tests                                                                                                   | 0    |
| Built stylesheet     | read of `dist/assets/index-*.css`                           | 158 `color-mix()` rules, **0 invalid stops, 0 NaN**, 21/21 token mirrors present                                                                  | 0    |
| SQL schema           | `python3 scripts/sql-schema-check.py`                       | 0 problems across 130 files                                                                                                                       | 0    |
| Database proofs      | `cd main-site && npm run db:prove`                          | 73 of 73 harnesses passed                                                                                                                         | 0    |
| i18n parity          | `vitest run src/i18n`                                       | identical key sets in `en` and `bn`, no empty strings                                                                                             | 0    |

### Measured in CI, and failing

The `lighthouse` job in `.github/workflows/browser.yml` runs the auditor in
`scripts/` on every push: it builds `main-site`, serves `dist`, and takes five
samples per public route in a fresh browser, gating the **median** of each
category at 95. Run at commit `604fee9`, 16 routes:

| Category       | Result across the 16 prerendered routes   |
| -------------- | ----------------------------------------- |
| Accessibility  | **100 on every route**                    |
| Best practices | **100 on every route**                    |
| SEO            | **100 on every route**                    |
| Performance    | 12 of 16 at 99–100; **4 below the floor** |

| Route         | Median | Samples            |
| ------------- | ------ | ------------------ |
| `/`           | **79** | 77, 79, 75, 80, 79 |
| `/projects`   | **88** | 88, 88, 90, 88, 89 |
| `/learn`      | **88** | 87, 89, 88, 88, 89 |
| `/playground` | **89** | 88, 89, 89, 90, 89 |

So `§5.3`'s "95+ on all four categories, every route" is **not met on the home
page**, and the samples say the miss is not a bad draw: `/` has put up a 75 and a 71 in
two sweeps whose medians differ by two points, so **±2 is the noise floor of this
gate** and any claimed improvement smaller than that is not an improvement. This is
the one claim in the brief that the repository can now measure and cannot yet pass,
which is why it stays open in the register instead of being rounded to a 95.

The same commit measured the score but not the cause, so the auditor now prints
the four lab metrics, the LCP element and its phase breakdown for the median run
of every route under the floor. Run `44908714665`, which names the cause:

| Route         | LCP (median) | FCP    | CLS   | TBT    | perf | LCP element (named by the run)                                     |
| ------------- | ------------ | ------ | ----- | ------ | ---- | ------------------------------------------------------------------ |
| `/`           | **4871 ms**  | 638 ms | 0.041 | 177 ms | 79   | `<h1 class="mt-2 text-4xl">` — the hero heading, plain Latin text  |
| `/learn`      | **3675 ms**  | 715 ms | 0.000 | 138 ms | 88   | `<p class="mt-2 max-w-2xl … text-on-hero/90">` — `ListHero`'s lead |
| `/projects`   | **3625 ms**  | 689 ms | 0.000 | 167 ms | 88   | `<p class="mt-1 max-w-prose text-sm text-muted">` — the same hero  |
| `/playground` | **3650 ms**  | 700 ms | 0.000 | 131 ms | 89   | `<div>` — an unclassed wrapper                                     |

Every one of the four is **text in the hero, with no resource load**: `ttfb 114–116 ms,
no resource load, render delay 1089–1684 ms`. `/` additionally reports Lighthouse's own
estimate, `Reduce unused JavaScript (−300 ms)`.

The shape is the finding, and this time it is named rather than inferred: **first
paint is fast, layout is stable, the main thread is idle, and the hero _text_
arrives 2.7–4.2 s late with nothing to load**. Two wrong leads were killed by
looking instead of assuming:

- **Not the images.** The LCP element on all four routes is a heading or a
  paragraph, so the cover-priority change made in `940123a` cannot be what moves
  these scores — and the run-to-run spread (±2 points) is wider than the "89 → 90"
  that the previous entry credited it with, so that movement was **noise** and the
  claim is withdrawn. The change stands on its own terms (a first-screen cover
  should not be `lazy`) but it is not a fix for §5.3.
- **Not the animations.** `ListHero`, which is where `/learn`'s and `/projects`'
  LCP element lives, has no motion at all — its own comment says _"Decorative only
  — no motion, so reduced-motion needs no special handling"_ — and the served HTML
  of every route was checked for a baked-in `opacity: 0` and has none.

What is left is the mount itself, and it is now traceable to two lines of our own
design. `main.tsx` calls `createRoot(...).render(...)`, not `hydrateRoot`, so the
HTML we serve is a **crawler fallback that React replaces** (`prerender.mjs` says
so: _"a readable summary of the page inside the root element, which React replaces
on hydration"_) — and `void initI18n().then(mount)` puts that replacement behind a
**dynamic `import('./locales/en')`**, a chunk the browser cannot even discover
until the eager JS has downloaded, parsed and run. The fallback's hero is smaller
than the app's, so LCP is not satisfied by the fast first paint; it is re-recorded
when the real hero appears. That is why CLS is 0.000 — the swap does not shift
anything — and why the phases show render delay with no load at all.
`--strict` would additionally gate the §5.1 lab floors; it stays off in CI, since
INP and TTFB are field measurements that a simulated lab run does not produce.

So the next slice is the one the brief's §4.1 and §5.1 actually describe, and it
has two costed parts:

1. **Take the locale out of the mount's critical path.** Inline the fallback
   language's bundle into the HTML the prerender already writes, as
   `<script type="application/json">`, and have `initI18n()` read it synchronously
   when present. For a visitor in that language this is not extra bytes — they were
   going to download the same chunk one round trip later — it is the same payload
   earlier, and it deletes a serial request from every route. The other locale
   stays lazy, because making every visitor pay for a language they were not shown
   is the thing the split into chunks was introduced to stop.
2. **Make the served first screen the app's own first screen.** `hydrateRoot` plus
   a markup-matching prerender of the data-independent hero (`ListHero` needs no
   store and no fetch), which is the difference between a fast empty page and a
   fast page. It is also what §4.1 and §8 actually want: right now a browser that
   executes no script, and any Android WebView before the bundle lands, is reading
   a _summary_ of the page rather than the page. This is a phase, not a patch —
   every route in the 16 must agree with its own client render, and the existing
   "the head the crawler sees equals the head React writes" test is the pattern to
   extend, not something to hand-write per route.

### Unrun, and why

These are the gates in `§5.3`, `§6.2` and `§8.2` that this environment cannot
execute. They are **open**, not passed.

| Gate                                              | Command                                                 | Why it is unrun                                                                                                                                                                                                                                                                               |
| ------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lighthouse, every route                           | `cd main-site && npm run lighthouse`                    | Not runnable in this sandbox (no browser; `@sparticuz/chromium` boots and never completes a page load). **It runs in CI now**: the `lighthouse` job in `.github/workflows/browser.yml` builds, points `CHROME_PATH` at the runner's Chrome and gates the median of five runs per route at 95. |
| Android lint / test / assembleRelease             | `cd android-app && ./gradlew lint test assembleRelease` | No JDK, no Gradle, no `ANDROID_HOME`, no SDK. CI's `Android` workflow ran green on the push, which proves the _config checks_ in that job, not a compile.                                                                                                                                     |
| Coverage to the brief's 80% lines / 90% functions | `cd main-site && npm run test:coverage`                 | Measurable now, and gated at the level actually reached (47.08% lines, 57.31% functions, `@vitest/coverage-v8` 2.1.1). The brief's numbers are unmet by a wide margin; the ratchet is what keeps them from drifting down while they are climbed.                                              |
| Android Vitals, Play Console                      | external                                                | Provider data; no credentials, and no release uploaded from here.                                                                                                                                                                                                                             |
| Load testing (`§8.2`)                             | none defined                                            | The repository has no load harness. Any "concurrent users" figure would be invented.                                                                                                                                                                                                          |

---

## Defect register

The `§4` checklist, applied by grep and by reading, not by hope. Fixed rows carry
the check that holds them; open rows carry what would be needed to close them.

### P0 — breaks functionality

| #   | Defect                                                                                                                                                                          | State     | Evidence / gate                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------- |
| 1   | 69 of 86 colour-with-alpha utilities compiled to no rule at all (`bg-primary/10`, `border-border/70`, …), because a bare `var()` colour cannot take Tailwind's opacity modifier | **Fixed** | `token()` in `tailwind.config.ts`; F-22; built-CSS read (158 `color-mix()` rules, 0 absent) |
| 2   | White-on-brand inverted in dark mode: 2.04:1 on the primary fill, 2.77 danger, 2.82 blue; `text-warn` on a light surface 2.16                                                   | **Fixed** | semantic ink/soft tokens; contrast audit's 24 floors in both themes; F-17                   |
| 3   | 61 utilities named a colour the theme does not define (`border-line`, `text-ink-2`, `text-foreground`, …) — inert in production                                                 | **Fixed** | F-23 (0 dead names)                                                                         |
| 4   | Two alpha modifiers off `theme.opacity` (`bg-scrim/92`, `bg-green-500/12`) — same silent-no-rule failure, one notch further out                                                 | **Fixed** | F-23 now reads the scale from Tailwind itself; negative-tested by planting `bg-scrim/92`    |
| 5   | A channel page had no way to write into the channel, so the feature was unreachable from the place you read it                                                                  | **Fixed** | `compose?channel=<id>` seed; F-26; 18 tests                                                 |

### P1 — visibly wrong

| #   | Defect                                                                                                                                                       | State                    | Evidence / gate                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ | -------------------------------------------------------------------------------------------------------- |
| 6   | `Logo.tsx` docstring claimed the mark "follows the current theme" while hardcoding four hexes                                                                | **Fixed**                | painted from `--bsdc-green-700/-800/-200` and `--bsdc-on-primary`; F-24                                  |
| 7   | An ad CTA assumed white text on an advertiser-supplied accent — pale accents shipped white-on-cream                                                          | **Fixed**                | `readableInkOn()` in `design-system/color.ts`, 10 tests including the cream case                         |
| 8   | The brief's token names (`--text-*`, `--space-*`, `--radius-*`, `--color-*`) did not exist; hand-written CSS had nothing to name and restated values         | **Fixed**                | the `tokenMirror` plugin emits 21 mirrors read from the resolved theme; F-27 checks the built stylesheet |
| 9   | Three `--bsdc-*` ramp colours were reachable only through a raw palette name (`bg-green-700`), which is why theme edits kept needing per-file dark overrides | **Fixed** (mechanically) | raw palette classes in `src/**/*.tsx`: 45 → 0                                                            |

### P2 — polish, and what is still open

| #   | Item                                                                                                                     | State                                               | What closing it needs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10  | `LinkButton`'s `outline` variant still paints a ramp colour (`border-green-700 text-green-700`) rather than a role token | **Open**                                            | a decision about what `outline` _means_ (brand accent or neutral), then a token pair; the audit does not flag it because the ramp resolves in both themes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 11  | Lighthouse 95+ on every route                                                                                            | **Measured in CI; 4 of 16 routes miss performance** | accessibility, best practices and SEO are 100 on every route, and 12 of the 16 routes pass performance. The four misses are LCP alone, and the cause is now **measured, not inferred**: the LCP element is hero _text_ with `no resource load` and 1089–1684 ms of render delay, because the served HTML is a crawler fallback that `createRoot().render()` replaces, and the mount is awaited on `initI18n()`, which dynamic-imports the locale chunk — a serial request behind the whole eager graph. `940123a` (first cover eager) did **not** move these routes: the ±2 run-to-run spread is wider than the "89 → 90" claimed here last time, so that claim is withdrawn as noise, and the images were never the LCP element. Two further leads were checked and killed the same way — `ListHero` carries no motion by design, and no route's prerendered HTML contains a baked-in `opacity: 0`. Closing this needs the two-part slice in §5.3's note above: inline the fallback locale so the mount stops waiting on a request, and make the served first screen the app's own (`hydrateRoot` + markup-matching prerender of the data-independent hero). Measurement infrastructure this needed is in place: each failing route now annotates its own element and phases, which is why `/`, the worst route in the sweep, is finally readable. The rule applied is _the first cover image of a public route's first paint_, and it stops there deliberately: `AdsPage.tsx:502`, `JobApplicationsPage.tsx:582` and `MyJobApplicationsPage.tsx:205` keep `loading="lazy"` — two are attachment galleries inside an expanded card rather than a route cover, all three are behind auth and outside the 16 measured routes, and `AdsPage`'s would need a prop threaded through `AdCreativeRow` for no measurable gain |
| 12  | Coverage at the brief's 80% lines / 90% functions                                                                        | **Open; a ratchet now holds the floor**             | `vite.config.ts` gates 46/57 and CI runs `npm run test:coverage` as the main-site test step, so coverage cannot fall unnoticed. Today: 47.08% lines, 57.31% functions. Reaching 80/90 means tests for the 149 untested files in `src/` — 21,576 lines, biggest first: `components/messaging/ConversationView.tsx` (637), `routes/CreatePage.tsx` (602), `routes/MessagesPage.tsx` (589), `routes/ComposePage.tsx` (576), `routes/ShopApplyPage.tsx` (485)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 13  | Android parity for the channel composer (`compose?channel=`) and `design-system/paint.ts`                                | **Open**                                            | Kotlin changes provable only by a Gradle run; the RPCs they need already exist (0129/0130)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 14  | `§4.1`–`§4.2` layout and responsive checks at 320–2560 px                                                                | **Measured; first defects it found are fixed**      | the browser smoke suite now sweeps nine widths from 320 to 2560 against five public routes asserting no sideways scroll, and gates the 44 px floor on shell controls in a phone context. Its first run named seven sub-44 targets (the mobile rail's six entries at 392×36, footer links at 34×15) and its second named six more — the footer's external links at 20–24 px — because fixing three call sites by hand left two more lists styled the same way. All thirteen now carry `fab-tap`, the class the rest of the app already uses, and the check is the thing that decided when the slice was finished. It runs in a phone context deliberately: `@media (pointer: coarse)` does not match a desktop-emulated browser, so measuring there would report the site as broken for the emulation's reason                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 15  | `§4.4` raw error text reaching a member                                                                                  | **Open, spot-checked**                              | `eslint` and the launch audit check for `console.*` and unwrapped throws; a systematic per-screen pass needs the browser too                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

### Deliberate non-defects

Recorded because a later auditor will otherwise "fix" them: five third-party
brand-mark colours, one JPEG backdrop colour and three token-read fallbacks live
in `design-system/paint.ts`, which is where the brief puts palette facts. 48
contrast findings are reported as advisory — text whose background lives in a
parent element, and translucent fills over an unseen backdrop — because guessing
there would produce a confident wrong answer. `--strict` gates them for the
human reviewing a screen, and does not gate CI.

---

## How to re-derive this file

```bash
cd main-site
npx tsc --noEmit && npx eslint . --max-warnings 0
npx prettier --check src && npx vitest run
npm run build                       # emits dist; prerenders 16 routes
node ../scripts/contrast-audit.mjs  # source + built-CSS checks
node ../scripts/audit.mjs           # every gate the repository can settle
python3 ../scripts/sql-schema-check.py
npm run db:prove
npm run lighthouse                  # needs CHROME_PATH -> a real browser
cd ../android-app && ./gradlew lint test assembleRelease   # needs a JDK + SDK
```

The gap between "green here" and "ready to ship" is exactly the unrun table.
Nothing in the launch audit, the contrast audit or the test suite asserts a
Lighthouse score, an APK build or a coverage percentage, so no gate can drift
into claiming one.
