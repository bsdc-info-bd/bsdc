# BSDC delivery plan

The platform is delivered in 20 build responses. Each response ships complete,
working, wired-up features — never scaffolding for its own sake.

| # | Module | Status |
|---|--------|--------|
| 1 | Foundation and design system | Done |
| 2 | Authentication and identity | Done |
| 3 | Data core: Supabase, RTDB, Firestore, storage | Pending |
| 4 | Universal composer and content engine | Pending |
| 5 | Feed and 4-stage ranking engine | Pending |
| 6 | Social graph and interactions | Pending |
| 7 | BSDC Messenger | Pending |
| 8 | Communities: groups, channels, pages, events | Pending |
| 9 | Jobs, freelance, projects, snippets, playground | Pending |
| 10 | Search and notifications | Pending |
| 11 | Marketplace part 1 (customer) | Pending |
| 12 | Marketplace part 2 (vendor) | Pending |
| 13 | Ads system | Pending |
| 14 | Admin panel core and plugin system | Pending |
| 15 | Admin analytics and PDF reports | Pending |
| 16 | Corporate network I | Pending |
| 17 | Corporate network II (trust empire) | Pending |
| 18 | SEO engine and branding studio | Pending |
| 19 | PWA, i18n, Android, performance | Pending |
| 20 | Verification, audit and launch | Pending |

## Response 1 scope (delivered)

- Monorepo skeleton: 14 web app folders, the Android shell folder and the
  brand library, each documented with its Pages project, domain and access
  model.
- Root governance: `LICENSE.md` (proprietary, legal warning), `SECURITY.md`
  (secret classification plus rotation checklist), `README.md`,
  `CONTRIBUTING.md`, `.gitignore`, Prettier and EditorConfig.
- `main-site`: Vite 5 + React 18 + TypeScript 5 strict project with
  `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` and
  `noImplicitOverride`.
- Design tokens for light and dark themes, the Tailwind theme, the Fabric CSS
  helper layer and component styles.
- Brand asset pipeline (`npm run brand`): favicons, PWA icons, maskable icon,
  Apple touch icon, Open Graph and Twitter cards, Android launcher icons —
  all generated from the two source SVGs, nothing committed as binary.
- Design system primitives, layout shell (app bar, bottom tab bar, footer,
  skip link, route progress, offline banner), command palette and toasts.
- Bilingual i18n with key-parity enforced by both types and a unit test.
- PWA manifest, Workbox runtime caching and an explicit update prompt.
- Cloudflare Pages Functions: `/robots.txt` and `/api/health`.
- Security headers and CSP in `public/_headers`.
- CI: secret scan, typecheck, lint, format check, tests, build and a
  250 KB gzip initial-JS budget per app.

## Response 2 scope (delivered)

- Firebase project `bsdc-bd` wired lazily: when the deployment has no Firebase
  configuration the UI shows an honest "not configured" state instead of
  crashing, and every gate (`RequireAuth`, profile page, forms) respects it.
- Email and password sign-up with verification mail, sign-in with a
  "keep me signed in" persistence switch, password reset, and a verification
  screen that can re-send and re-check.
- OAuth with Google, GitHub and Yahoo: popup first, automatic redirect
  fallback when the browser blocks popups, redirect result consumed on return.
- Enumeration-safe error handling: ~30 Firebase codes mapped to bilingual
  messages, unknown email and wrong password share one message, raw codes are
  never shown. Client-side attempt throttling with a visible lockout timer.
- Session store with custom claims (role, vendor, staff), cross-tab
  synchronisation over `BroadcastChannel`, and token refresh handling.
- Four-step onboarding: username claim with debounced availability check,
  profile details, skills and interests, review. Usernames are claimed in a
  Firestore transaction that also releases the previous handle.
- Public member permalink `/@username` with tabs (posts, comments, about,
  badges), profile JSON-LD and privacy-aware indexing.
- Settings with six panels: account, appearance, language, notifications,
  privacy and security (re-authenticated password change, session details).
- App bar account menu, unverified-email reminder banner and safe `next=`
  redirect handling that rejects absolute and protocol-relative targets.
- `POST /api/auth/claims`: a Pages Function that verifies the caller's ID
  token against Google's JWKS with Web Crypto, enforces an owner allowlist,
  and mints custom claims through the Identity Toolkit REST API — no
  firebase-admin dependency in the Workers runtime.
- The Firebase SDK is loaded on demand, so the initial JavaScript budget stays
  far below the 250 KB gzip CI gate.

## Registry coverage so far

Y-001, Y-002, Y-004, Y-006, Y-008, Y-017, Y-018, Y-019, Y-020, Y-022, Y-023,
Y-024, Y-027, Y-028, Y-029, Y-031, Y-032, Y-035, Y-036, Y-040,
W-001, W-002, W-003, W-004, W-005, W-006, W-007, W-008, W-009, W-010, W-014,
W-017, W-018, W-020, W-021, W-023, W-024, W-025,
V-001, V-002, V-003, V-004, V-005, V-007, V-009, V-013, V-020, V-021, V-022,
V-031,
U-003, U-004, U-007, U-009, U-010, U-011, U-013, U-014, U-036,
X-010, X-034, X-045,
L-001 (shell), Z-026 (environment flags foundation).

Response 2 adds:
A-001, A-002, A-003, A-004, A-005, A-006, A-007, A-008, A-009, A-010, A-011,
A-012, A-013, A-014, A-015, A-016, A-017, A-018, A-019, A-020, A-021, A-022,
A-023, A-024, A-025, A-026, A-027, A-028, A-029, A-030,
B-001, B-002, B-003, B-004, B-005, B-006, B-007, B-008, B-009, B-010, B-011,
B-012, B-013, B-014, B-015,
Y-003, Y-005, Y-021, Y-030, W-011, W-012, V-006, V-008, V-010, U-001, U-002,
Z-001, Z-002, Z-003.
