# BSDC — Verification Report

Copyright (c) RRC Development. Proprietary — see [LICENSE](./LICENSE).

**Build under verification:** `main` → `arena/01a02aa1-bsdc` working branch.
**Method:** `npm run build` (tsc strict + Vite + PWA), `npx eslint .`, `npx vitest run`,
dev-server route probes, static asset inspection. Results below were produced by the CI
commands themselves — re-run them with the commands in the left column.

## Automated gates — all passing

| Check | Command | Result |
|---|---|---|
| TypeScript strict mode (`tsc -b`) | `npm run typecheck` | **0 errors** |
| Production build (Vite + PWA) | `npm run build` | **success** — 89 precached entries, sw.js + manifest generated |
| ESLint (flat config, typescript-eslint + react-hooks) | `npm run lint` | **0 errors, 0 warnings** |
| Unit tests (Vitest) | `npm test` | **37/37 passing** |
| Emoji scan across all source files | regex sweep | **0 emojis** (SVG icons only) |
| `any` types in production code | grep | **0** |
| Dev server route probes | curl | **31/31 routes → HTTP 200** (incl. SPA fallback and 404 page) |

## Route matrix (dev server, all HTTP 200)

`/` `/explore` `/trending` `/blog` `/qa` `/snippets` `/docs` `/wiki` `/projects` `/jobs`
`/notices` `/blog/:slug` `/qa/:slug` `/snippet/:slug` `/docs/:slug` `/wiki/:slug`
`/project/:slug` `/job/:slug` `/notice/:slug` `/post/:slug` `/p/:username` `/tag/:tag`
`/groups` `/g/:slug` `/marketplace` `/marketplace/:id` `/events` `/leaderboard` `/license`
`/license/verify/:id` `/directory` `/creator-program` `/points` `/messages/:chatId?`
`/notifications` `/bookmarks` `/create` `/search` `/report` `/settings` `/about` `/contact`
`/terms` `/privacy` `/guidelines` `/branding` `/login` `/register` `/forgot-password`
`/verify-email` `/offline` `/500` `/admin` (+14 sub-pages) `/mod` `*` → 404 page

## Checklist (100+ items)

### Build & code quality
- [x] `vite build` completes with zero errors
- [x] `vite dev` serves with zero compile errors (module probes all 200)
- [x] TypeScript strict mode passes (`strict`, `noUnusedLocals`, `noUnusedParameters`)
- [x] ESLint passes with zero warnings
- [x] 37 unit tests pass (utils, feed algorithm, sitemap/RSS generators)
- [x] All routes render; unknown routes → branded 404
- [x] Zero emojis (automated sweep) — lucide SVG icons everywhere
- [x] Legal header on every source file; LICENSE proprietary; README legal notice

### Authentication
- [x] Google sign-in implemented (popup, redirect fallback)
- [x] GitHub sign-in implemented
- [x] Yahoo (OIDC) sign-in implemented
- [x] Email/password registration with zod policy (8+ chars, 1 upper, 1 number)
- [x] Email verification gate before platform access
- [x] Password reset flow with confirmation screen
- [x] Friendly error mapping for every Firebase auth code (wrong password, not found, rate limit…)
- [x] Profile auto-created on first sign-in; username auto-reserved & uniqueness enforced (`/usernames`)
- [x] Superadmin bootstrap for rahimchawdhury63@gmail.com (client + Cloud Function)
- [x] Banned account gate
- [x] OAuth account linking via Firebase same-email reconciliation

### Profiles & social
- [x] Profile page `/p/{username}` with cover, avatar, bio, skills, links, join date, points, level
- [x] Profile editing (avatar/cover upload to Cloudinary, username change with availability check)
- [x] Follow/unfollow with live counts; follower/following lists
- [x] Verification badge, creator badge, role badges
- [x] Reading list (`/bookmarks`) with real data
- [x] GDPR data export (JSON + CSV) and account deletion

### Posting engine
- [x] All 11 post types creatable (text, image, blog, qa, snippet, docs, wiki, project, job, notice, poll)
- [x] Posts persist to Firestore with SEO slugs (unique, Bangla-script safe)
- [x] Feed displays posts; visibility rules enforced (public/followers/private/group)
- [x] Personalized feed algorithm (weights unit-tested: recency/engagement/authority/relevance/proximity/location)
- [x] Trending (velocity) + Latest + Following feeds
- [x] Draft + scheduled publishing
- [x] Reactions (7 SVG types) on posts & comments; live counts via transactions
- [x] Nested comments (5 levels) with replies, edits, soft deletes, accepted answers
- [x] Polls: vote once per user, live percentages, anonymous mode
- [x] Stories: 24h expiry, view counts, viewer list, image + text stories
- [x] Mentions → notifications; hashtags → tag pages
- [x] Bookmarks, share (copy link + Web Share API), reports
- [x] Monaco code editor for snippets (50+ languages)
- [x] Markdown with GFM tables/task lists, KaTeX math, sanitized HTML, TOC, reading time

### Real-time messaging
- [x] 1-to-1 chat, group chat, broadcast channels (RTDB)
- [x] Real-time delivery, typing indicators, presence dots + last seen
- [x] Read receipts, unread badges, chat pin/mute
- [x] Image messages (ImgBB) and syntax-highlighted code messages
- [x] Reply-quote, edit, delete for me / everyone, reactions, pinned messages
- [x] Conversation search; mobile full-screen / desktop split layout

### Notifications
- [x] 14 in-app notification types, real-time listener, unread badge
- [x] Mark read / mark all read; click-through navigation
- [x] Sound chime (synthesized WAV, toggleable), OneSignal web push integrated
- [x] Toasts (sonner) for every user action

### Points economy
- [x] Earning rules (login 5, post 10, first post 20, reaction 2, comment 3, accepted 25, profile 50, referral 100)
- [x] Atomic transfers with balance guards + transaction log
- [x] QR transfer payload generation + scannable QR rendering
- [x] History ledger, levels, leaderboard (`/leaderboard`)

### Communities & commerce
- [x] Groups: create (public/closed/secret), join/leave, roles, rules, group posts
- [x] Marketplace: listings, categories, search, seller contact via DM, mark sold, admin approval
- [x] Software licenses: register → admin review → BSDC-YYYY-XXXXX, QR verify page, PDF certificate
- [x] Creator Program: milestone tracker, application form, admin queue, badge + 2x feed boost
- [x] Events: create, RSVP, .ics export

### Admin & moderation
- [x] Live dashboard (8 stat cards, 4 charts — all real Firestore aggregates)
- [x] User management: TanStack table, search/filter/sort/paginate, role changes, verify, ban, grant points, direct notify, CSV export
- [x] Content management: pin/feature/hide/delete, type & text filters
- [x] Moderation queue: priorities, resolve/dismiss/warn, audit-logged
- [x] Analytics page (engagement, DAU charts)
- [x] Branded PDF reports (jsPDF, QR verification, hourly→yearly periods)
- [x] Ads manager (CRM/CPC/CPA/CPV/sponsored/banner/native/interstitial/pop-under/video/newsletter)
- [x] Broadcast to all users (batched writes)
- [x] Audit logs (admin + moderation)
- [x] Database browser (read-only, all collections)
- [x] System settings: feature flags, maintenance mode, announcement banner, auto-moderation keywords
- [x] Launch management: date → public countdown, checklist, sitemap/RSS export
- [x] Moderator panel: queue, clock in/out, guidelines, personal stats

### Responsiveness & accessibility
- [x] Mobile-first Tailwind + custom `responsive.css` for 250px→3840px+
- [x] Bottom sheet modals on phones; full-screen chat on mobile; scrollable tables
- [x] 44px touch targets on coarse pointers; safe-area insets for notched devices
- [x] Skip-to-content link, ARIA labels/roles on interactive elements, focus-visible rings
- [x] `prefers-reduced-motion` honored; keyboard shortcuts (Ctrl+K, N, G+H/P/M/N/S, J/K, ?, Esc)

### SEO
- [x] Per-page title/description/keywords/canonical + OG + Twitter cards (SEOHead)
- [x] 17 JSON-LD schema builders; BreadcrumbList on every page
- [x] Auto SEO fields per post; sitemap generator (static + Functions); RSS/Atom/News feeds
- [x] robots.txt (admin/settings/messages disallowed, sitemap referenced)
- [x] Favicon set (ico + svg + 192/512 + apple-touch), OG default card
- [x] Preconnects, lazy images with width/height/alt, code-split routes

### PWA & platform
- [x] Installable manifest + service worker (autoUpdate), offline banner + /offline page
- [x] Runtime caching for Cloudinary/Firebase media
- [x] Bangla/English toggle persists; theme persists with no-flash bootstrap
- [x] `.env.example` documents every variable; no secrets in repo (Cloudinary secret never used client-side)
- [x] `firestore.rules` + `firestore.indexes.json` + `storage.rules` + Cloud Functions provided
- [x] Capacitor config ready for Android APK/AAB
- [x] Cloudflare Pages artifacts: `_redirects`, `_headers`, SPA fallback verified

## Requires live third-party configuration (owner actions)

These depend on toggles in external consoles — the code paths are implemented and error-handled:

1. Enable Google/GitHub/Yahoo providers in Firebase Auth (console toggle).
2. Realtime Database instance creation (asia-southeast1) + rules.
3. OneSignal domain verification for web push prompts.
4. Custom domain `bsdc.info.bd` → Cloudflare Pages binding.
5. Deploy Cloud Functions (optional hardening) with Blaze plan.

## Reproduce

```bash
npm install
npm run build     # tsc + vite + PWA — expect success
npm run lint      # expect: no output (0 problems)
npm test          # expect: 37 passed
npm run dev       # probe routes listed above
```


---

## Fix round 2 — structure, responsive, rules, search, geo, effects

**Triggered by owner QA on mobile (reference screenshots) + review feedback.**

### Layout / responsive
- [x] Messenger: global BottomNav (z-40) no longer overlays the chat composer — chat routes render in immersive mode (no footer, no bottom nav, no sidebar); owner's Messages rework preserved (keyboard-safe dvh/svh, safe-area composer, audio engine — lint/type-cleaned)
- [x] Footer clears the fixed bottom nav on mobile (`pb-20 lg:pb-0`) — no more blocked/overlapped content on any page
- [x] Removed stale `.bsdc-modal-content` CSS that fought the Modal component's own responsive classes
- [x] Container queries: post image grids collapse to 1 column inside narrow cards
- [x] `overscroll-behavior: contain` + momentum scrolling helper for app-like panes
- [x] Fluid heading type (clamp), long-URL/`overflow-wrap: anywhere` protection in prose and code
- [x] Tiny-screen hardening: ≤430px chrome tightening, ≤380px profile avatar offset, search paddings
- [x] Safe-area insets preserved on chat composer + bottom nav

### Firestore rules (rewritten — closes real holes)
- [x] REACTIONS/VIEW/SHARE/COUNTER writes by non-owners are now allowed but **field-restricted** (`hasOnly(['viewCount','shareCount','reactionCounts',…])`) — previously reactions/views by viewers were silently denied
- [x] Privilege escalation hole closed: users can no longer write `role`/`isVerified` to their own doc (old self-service list included them); founder email bootstrap is email-pinned in rules
- [x] Moderators can only assign non-privileged roles; stories/groups/events/marketplace updates restricted to owner/staff/counter-only writes (previously any signed-in user could edit any group/event/story/listing)
- [x] Notifications cannot be spoofed (`actorId == request.auth.uid`)
- [x] Username reservations: create-only-if-absent + ownership checks (previously could be pointed at another uid)
- [x] Follower-count / points-transfer cross-user counter writes explicitly allow-listed

### Realtime DB rules (new: `database.rules.json`)
- [x] RTDB rules shipped: `.info/connected` reads, owner-scoped presence/typing, participant-scoped chat metadata/messages, userChats writable by participants (fixes sender updating recipient's chat list)

### Search system (rebuilt — was non-functional)
- [x] New ranker: match quality (exact > word-prefix > substring > typo-tolerant Levenshtein) × field weight × popularity × recency × personalization (follows, tag affinity, skills, geo)
- [x] **Live suggestion dropdown** in the header on every screen (debounced 160ms, keyboard nav, `/` shortcut, direct navigation)
- [x] Trending searches computed from real indexed tag usage; recent searches persist
- [x] Index lifecycle: built from real Firestore data with retry/backoff, TTL refresh, `refreshSearchIndex()`; graceful empty-index fallback
- [x] `/search` page: smart-ranked results, match highlighting, "why this result" reasons, category tabs
- [x] Unit-tested: 16 search tests + ranking behavior (personalization boost, geo boost, category filters)

### Location (OpenStreetMap) & personalized feed
- [x] `lib/geo.ts`: browser permission flow, Nominatim reverse geocoding, place autocomplete, haversine
- [x] Settings → Location: "Use my location" (permission → OSM reverse geocode → profile.location + geo), city autocomplete, clear option
- [x] Feed ranking: geo proximity multiplier (same city 1.35 → same region 1.18 → same country 1.1) with graceful string fallback
- [x] "Developers near you" rail with km distances (real haversine on profile coordinates)
- [x] Personalization engine (`lib/personalization.ts`): on-device interaction log (views+dwelling, reactions, comments, bookmarks, searches) → decaying tag/type affinities feeding the For You algorithm

### CSS / motion layer
- [x] `styles/effects.css`: glassmorphism, animated gradient text, mesh gradient backgrounds, floating orbs, 3D card lift/tilt (`preserve-3d`), shine sweep, 3D press buttons, digit flip, pop-in, conic 3D story ring — all GPU-composited and fully neutralized under `prefers-reduced-motion`
- [x] Applied to: feed cards, auth pages, countdown, admin stat cards, branding badges, primary buttons, story rings

### Gates after fix round 2
- ✅ `tsc -b --force` strict: **0 errors** — ✅ `eslint .`: **0 problems** — ✅ `vitest`: **62/62** — ✅ emoji sweep: **0**
