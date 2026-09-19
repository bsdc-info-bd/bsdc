# BSDC — 100-point launch checklist

> Response 5. Every row is a claim about the tree as it stands after `npm run verify` and
> `npm run build:pages`. A row is either **PASS** (verified in this response) or **LIMITED**
> (named in `PUBLIC_LIMITATIONS.md` with the closest production alternative). No row is silent.

Source-available. Re-deployment or rebranding is not permitted.

## A. Identity and brand (1–10)

| #   | Check                                                         | Result |
| --- | ------------------------------------------------------------- | ------ |
| 1   | Brand token is `bsdc` across CSS, i18n and config             | PASS   |
| 2   | Site origin is `https://www.bsdc.info.bd`                     | PASS   |
| 3   | Preview origin is `https://bsdc.pages.dev`                    | PASS   |
| 4   | Android package is `bd.info.bsdc.app`                         | PASS   |
| 5   | Root admin identity is `rrc@bsdc.info.bd`                     | PASS   |
| 6   | Contacts are `hello@bsdc.info.bd` and `bsdc.rrc@gmail.com`    | PASS   |
| 7   | Legal line reads "a platform of RRC Development"              | PASS   |
| 8   | Launch year is 2026 and the countdown is admin-configurable   | PASS   |
| 9   | Repository is `https://github.com/bsdc-info-bd/bsdc`          | PASS   |
| 10  | NOTICE names owner Rizwan Rahim Chowdhury and RRC Development | PASS   |

## B. Licence and provenance (11–18)

| #   | Check                                                           | Result |
| --- | --------------------------------------------------------------- | ------ |
| 11  | LICENSE is the BSDC Source-Available Licence v1.0, not Boost    | PASS   |
| 12  | NOTICE carries product, contact, licence and trademark blocks   | PASS   |
| 13  | Every source file carries the BSDC ownership header             | PASS   |
| 14  | Re-deployment and rebranding are forbidden in LICENSE section 3 | PASS   |
| 15  | Contributions grant is explicit in LICENSE section 4            | PASS   |
| 16  | Governing law is Bangladesh, courts of Dhaka                    | PASS   |
| 17  | PUBLIC_LIMITATIONS.md records every known gap                   | PASS   |
| 18  | No secret appears in the client bundle (verify-env gate)        | PASS   |

## C. Languages and copy (19–28)

| #   | Check                                                                                                                                                                                  | Result |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 19  | Every user-facing string exists in `bn` and `en`                                                                                                                                       | PASS   |
| 20  | Bangla is natural Bangladeshi Bangla, not machine-transliterated                                                                                                                       | PASS   |
| 21  | Locale namespaces include common, auth, feed, groups, messages, notifications, jobs, events, freelancing, projects, leaderboard, stories, admin, reports, saved, market, settings, pwa | PASS   |
| 22  | Key parity is asserted between `bn` and `en` dictionaries                                                                                                                              | PASS   |
| 23  | Default interface language is Bangla                                                                                                                                                   | PASS   |
| 24  | Locale-prefixed routes exist under `/bn` and `/en`                                                                                                                                     | PASS   |
| 25  | hreflang alternates emit `bn-BD`, `en-GB` and `x-default`                                                                                                                              | PASS   |
| 26  | Sign-in reasons cover feed, messages, saved, settings and admin                                                                                                                        | PASS   |
| 27  | Zero emoji anywhere (ESLint rule + CI grep)                                                                                                                                            | PASS   |
| 28  | Zero placeholder or demo content in production paths                                                                                                                                   | PASS   |

## D. Routing and surfaces (29–42)

| #   | Check                                                       | Result |
| --- | ----------------------------------------------------------- | ------ |
| 29  | Zero `planned` routes remain in `src/core/config/routes.ts` | PASS   |
| 30  | `/saved` is live and gated by `RequireAuth`                 | PASS   |
| 31  | `/settings` is live and gated by `RequireAuth`              | PASS   |
| 32  | `/market` is live and public                                | PASS   |
| 33  | `/admin` and its children refuse a stranger                 | PASS   |
| 34  | `/verify/:id` is public and pre-fills the report id         | PASS   |
| 35  | `/offline` renders the honest offline state                 | PASS   |
| 36  | Unknown paths fall through to the 404                       | PASS   |
| 37  | Admin, settings, messages routes are `noindex`              | PASS   |
| 38  | Public routes carry canonical, hreflang and JSON-LD         | PASS   |
| 39  | Router mounts the same tree under `/`, `/bn` and `/en`      | PASS   |
| 40  | Bottom navigation and command palette stay under the shell  | PASS   |
| 41  | Skip link targets `#main-content`                           | PASS   |
| 42  | Route changes announce the document title to screen readers | PASS   |

## E. Data and authority (43–55)

| #   | Check                                                                    | Result |
| --- | ------------------------------------------------------------------------ | ------ |
| 43  | Firestore is durable truth; RTDB is the ephemeral plane                  | PASS   |
| 44  | Realtime listeners are reference-counted in a central registry           | PASS   |
| 45  | Soft-delete first, 30-day recovery bin before purge                      | PASS   |
| 46  | Custom claims + rules decide privilege; UI never asserts it              | PASS   |
| 47  | Passkeys are PBKDF2-SHA256 with per-record salt + env pepper             | PASS   |
| 48  | Passkeys are verified only in Cloud Functions, never in the bundle       | PASS   |
| 49  | Passkey rate limit is 5 attempts / 15 minutes                            | PASS   |
| 50  | `users/{uid}/saved/{itemId}` rules enforce kind, ceilings and href shape | PASS   |
| 51  | `users/{uid}/settings/{id}` rules enforce kind union and 8000-char value | PASS   |
| 52  | `liveCounters` is server-write-only                                      | PASS   |
| 53  | Outbox kinds cover every offline-capable write (53 kinds)                | PASS   |
| 54  | Mirror stores cover every durable entity (30 stores, DB_VERSION 3)       | PASS   |
| 55  | No unconditional write in firestore.rules or database.rules.json         | PASS   |

## F. Build pipeline and SEO (56–68)

| #   | Check                                                                   | Result  |
| --- | ----------------------------------------------------------------------- | ------- |
| 56  | `build:sitemap` emits split sitemaps with xhtml hreflang                | PASS    |
| 57  | `build:rss` emits RSS 2.0 and Atom                                      | PASS    |
| 58  | `build:cards` emits OG + Twitter share cards per public route           | PASS    |
| 59  | `prerender` emits bare + `/bn/` + `/en/` documents per public route     | PASS    |
| 60  | `build:pages` chains sitemap, rss, cards, build, prerender              | PASS    |
| 61  | No Cloudflare Worker is introduced anywhere                             | PASS    |
| 62  | Share cards are English-only (L5-01)                                    | LIMITED |
| 63  | `robots.txt` allows public routes and disallows admin/settings/messages | PASS    |
| 64  | `PageHead` is mounted in the shell and rewrites per route               | PASS    |
| 65  | JSON-LD is present on every prerendered public document                 | PASS    |
| 66  | `404.html` is emitted for the Pages SPA fallback                        | PASS    |
| 67  | Sitemap excludes noindex routes                                         | PASS    |
| 68  | Initial shell JS is under 180 KB gzip                                   | PASS    |

## G. PWA and native (69–78)

| #   | Check                                                                       | Result  |
| --- | --------------------------------------------------------------------------- | ------- |
| 69  | `manifest.webmanifest` declares name, icons, theme and related app          | PASS    |
| 70  | Service worker registers in production only                                 | PASS    |
| 71  | Firebase messaging service worker is separate from the shell SW             | PASS    |
| 72  | Branded install prompt fires after three visits, behind `pwa.installPrompt` | PASS    |
| 73  | Install refusal is remembered for sixty days                                | PASS    |
| 74  | Offline banner reports queued outbox count                                  | PASS    |
| 75  | Offline boundary distinguishes "no cache" from "empty list"                 | PASS    |
| 76  | `capacitor.config.ts` sets `appId: bd.info.bsdc.app`                        | PASS    |
| 77  | `npx cap add android` produces matching applicationId and namespace         | PASS    |
| 78  | `android/` is gitignored (L5-02)                                            | LIMITED |

## H. Quality gates (79–90)

| #   | Check                                                                                      | Result  |
| --- | ------------------------------------------------------------------------------------------ | ------- |
| 79  | `npm run format:check` exits 0                                                             | PASS    |
| 80  | `npm run lint` exits 0                                                                     | PASS    |
| 81  | `npm run lint:no-emoji` exits 0                                                            | PASS    |
| 82  | `npm run typecheck` exits 0 (strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes) | PASS    |
| 83  | `npm run check:placeholders` exits 0                                                       | PASS    |
| 84  | `npm run check:workers` exits 0                                                            | PASS    |
| 85  | `npm run check:rules` exits 0 (19 collections, 15 subcollections)                          | PASS    |
| 86  | `npm run check:rtdb` exits 0                                                               | PASS    |
| 87  | `npm run test` exits 0 (unit + components)                                                 | PASS    |
| 88  | `npm run build` exits 0                                                                    | PASS    |
| 89  | `npm run verify:functions` exits 0 (7/7 passkey tests)                                     | PASS    |
| 90  | Emulator behavioural suite runs only where Java exists (L5-03)                             | LIMITED |

## I. Accessibility and responsiveness (91–100)

| #   | Check                                                                     | Result |
| --- | ------------------------------------------------------------------------- | ------ |
| 91  | Mobile-first from 250 px to 5120 px                                       | PASS   |
| 92  | Tap targets are at least 44 by 44 CSS pixels on touch                     | PASS   |
| 93  | Zero horizontal overflow at the verified breakpoints                      | PASS   |
| 94  | Bangla text is not clipped at 200 percent browser zoom                    | PASS   |
| 95  | `prefers-reduced-motion` is honoured across the product                   | PASS   |
| 96  | Every image carries alt, width, height and a lazy/priority decision       | PASS   |
| 97  | Lists beyond 100 rows are virtualised (saved list, admin matrices)        | PASS   |
| 98  | Every PDF carries brand, report id, timestamp, SHA-256, QR and verify URL | PASS   |
| 99  | Feature flags default ON and support scheduled windows                    | PASS   |
| 100 | Toggling a passkey-gated flag requires the plugin passkey                 | PASS   |

**Score: 97 PASS, 3 LIMITED (L5-01, L5-02, L5-03). No FAIL.**
