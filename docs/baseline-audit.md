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

| Gate                 | Command                                        | Result                                                                                    | Exit |
| -------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------- | ---- |
| Typecheck, app       | `cd main-site && npx tsc --noEmit`             | no diagnostics                                                                            | 0    |
| Typecheck, functions | `npm run typecheck`                            | no diagnostics                                                                            | 0    |
| Lint                 | `npx eslint . --max-warnings 0`                | 0 errors, 0 warnings                                                                      | 0    |
| Format               | `npx prettier --check src`                     | all matched files formatted                                                               | 0    |
| Tests                | `npx vitest run`                               | **132 files / 1350 tests** passed                                                         | 0    |
| Build                | `npm run build`                                | built, **16 routes prerendered**                                                          | 0    |
| Initial JS budget    | gzip of `dist/index.html`'s eager module graph | **142.5 kB** against 250 kB                                                               | 0    |
| Launch audit         | `node scripts/audit.mjs`                       | **144 passed, 0 failed, 4 recorded**                                                      | 0    |
| Contrast floor       | `node scripts/contrast-audit.mjs`              | 1632 pairs × 2 themes; 0 certain, 0 floors, 0 dead names, 0 off-scale alphas, 0 off-token | 0    |
| Hardcoded colour     | `§11`'s grep, verbatim                         | **0 lines** outside the design system and tests                                           | 0    |
| Built stylesheet     | read of `dist/assets/index-*.css`              | 158 `color-mix()` rules, **0 invalid stops, 0 NaN**, 21/21 token mirrors present          | 0    |
| SQL schema           | `python3 scripts/sql-schema-check.py`          | 0 problems across 130 files                                                               | 0    |
| Database proofs      | `cd main-site && npm run db:prove`             | 73 of 73 harnesses passed                                                                 | 0    |
| i18n parity          | `vitest run src/i18n`                          | identical key sets in `en` and `bn`, no empty strings                                     | 0    |

### Unrun, and why

These are the gates in `§5.3`, `§6.2` and `§8.2` that this environment cannot
execute. They are **open**, not passed.

| Gate                                  | Command                                                 | Why it is unrun                                                                                                                                                       |
| ------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lighthouse, every route               | `cd main-site && npm run lighthouse`                    | No browser. No system Chrome; `@sparticuz/chromium` boots and never completes a page load. `scripts/lighthouse.mjs` needs `CHROME_PATH` pointing at a real binary.    |
| Android lint / test / assembleRelease | `cd android-app && ./gradlew lint test assembleRelease` | No JDK, no Gradle, no `ANDROID_HOME`, no SDK. CI's `Android` workflow ran green on the push, which proves the _config checks_ in that job, not a compile.             |
| Coverage 80% lines / 90% functions    | `vitest run --coverage`                                 | No `coverage` block in any vitest config in the repository and `@vitest/coverage-v8` is not installed. The brief's target is currently unenforceable rather than met. |
| Android Vitals, Play Console          | external                                                | Provider data; no credentials, and no release uploaded from here.                                                                                                     |
| Load testing (`§8.2`)                 | none defined                                            | The repository has no load harness. Any "concurrent users" figure would be invented.                                                                                  |

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

| #   | Item                                                                                                                     | State                        | What closing it needs                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 10  | `LinkButton`'s `outline` variant still paints a ramp colour (`border-green-700 text-green-700`) rather than a role token | **Open**                     | a decision about what `outline` _means_ (brand accent or neutral), then a token pair; the audit does not flag it because the ramp resolves in both themes                                                          |
| 11  | Lighthouse 95+ on every route                                                                                            | **Open (unmeasurable here)** | a machine with Chrome; `npm run lighthouse` is wired and reports per-route medians                                                                                                                                 |
| 12  | Coverage thresholds                                                                                                      | **Open**                     | install `@vitest/coverage-v8`, add a `coverage` block with the two floors, then wire it to CI — a dependency decision, not a code fix                                                                              |
| 13  | Android parity for the channel composer (`compose?channel=`) and `design-system/paint.ts`                                | **Open**                     | Kotlin changes provable only by a Gradle run; the RPCs they need already exist (0129/0130)                                                                                                                         |
| 14  | `§4.1`–`§4.2` layout and responsive checks at 320–2560 px                                                                | **Open**                     | needs a browser. Static proxies are green (`fab-tap` 44 px on coarse pointers, `screens` 250→3840, no fixed-width overflow in the layout shell), but "no horizontal scroll at 320 px" is a measurement, not a grep |
| 15  | `§4.4` raw error text reaching a member                                                                                  | **Open, spot-checked**       | `eslint` and the launch audit check for `console.*` and unwrapped throws; a systematic per-screen pass needs the browser too                                                                                       |

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
