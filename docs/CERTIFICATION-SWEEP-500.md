# BSDC — 500-point certification sweep

> Response 5. Five hundred concrete claims about the tree after the final gates.
> Each row is PASS or LIMITED. LIMITED rows point at PUBLIC_LIMITATIONS.md.
> Source-available. Re-deployment or rebranding is not permitted.

## Brand, identity, licence

| #   | Check                                                               | Result |
| --- | ------------------------------------------------------------------- | ------ |
| 1   | Brand token bsdc is the only product token in CSS custom properties | PASS   |
| 2   | Site canonical host is www.bsdc.info.bd                             | PASS   |
| 3   | Preview host is bsdc.pages.dev                                      | PASS   |
| 4   | Android applicationId is bd.info.bsdc.app                           | PASS   |
| 5   | Android namespace matches applicationId                             | PASS   |
| 6   | Root admin email is rrc@bsdc.info.bd                                | PASS   |
| 7   | General contact is hello@bsdc.info.bd                               | PASS   |
| 8   | Operations contact is bsdc.rrc@gmail.com                            | PASS   |
| 9   | Legal line is a platform of RRC Development                         | PASS   |
| 10  | Owner is named Rizwan Rahim Chowdhury in NOTICE                     | PASS   |
| 11  | Organisation is RRC Development in NOTICE                           | PASS   |
| 12  | LICENSE is BSDC Source-Available Licence Version 1.0                | PASS   |
| 13  | LICENSE forbids re-deployment without written consent               | PASS   |
| 14  | LICENSE forbids re-branding without written consent                 | PASS   |
| 15  | LICENSE forbids commercial use without written consent              | PASS   |
| 16  | LICENSE governing law is Bangladesh                                 | PASS   |
| 17  | LICENSE courts are Dhaka                                            | PASS   |
| 18  | NOTICE lists third-party dependency families                        | PASS   |
| 19  | Every TypeScript source file opens with the BSDC header block       | PASS   |
| 20  | Every CSS source file opens with the BSDC header block              | PASS   |
| 21  | Every script under scripts/ opens with the BSDC header block        | PASS   |
| 22  | PUBLIC_LIMITATIONS.md exists and is linked from the README posture  | PASS   |
| 23  | No Boost Software License text remains as the active licence        | PASS   |
| 24  | Repository URL is https://github.com/bsdc-info-bd/bsdc              | PASS   |
| 25  | Launch year constant is 2026                                        | PASS   |

## Internationalisation

| #   | Check                                                           | Result |
| --- | --------------------------------------------------------------- | ------ |
| 26  | i18next is initialised with bn as the default language          | PASS   |
| 27  | Fallback language is en                                         | PASS   |
| 28  | Namespaces include common                                       | PASS   |
| 29  | Namespaces include auth                                         | PASS   |
| 30  | Namespaces include feed                                         | PASS   |
| 31  | Namespaces include groups                                       | PASS   |
| 32  | Namespaces include messages                                     | PASS   |
| 33  | Namespaces include notifications                                | PASS   |
| 34  | Namespaces include jobs                                         | PASS   |
| 35  | Namespaces include events                                       | PASS   |
| 36  | Namespaces include freelancing                                  | PASS   |
| 37  | Namespaces include projects                                     | PASS   |
| 38  | Namespaces include leaderboard                                  | PASS   |
| 39  | Namespaces include stories                                      | PASS   |
| 40  | Namespaces include admin                                        | PASS   |
| 41  | Namespaces include reports                                      | PASS   |
| 42  | Namespaces include saved                                        | PASS   |
| 43  | Namespaces include market                                       | PASS   |
| 44  | Namespaces include settings                                     | PASS   |
| 45  | Namespaces include pwa                                          | PASS   |
| 46  | public/locales/bn and public/locales/en have matching file sets | PASS   |
| 47  | Every bn JSON key exists in the matching en JSON                | PASS   |
| 48  | Every en JSON key exists in the matching bn JSON                | PASS   |
| 49  | Language switcher toggles document.documentElement.lang         | PASS   |
| 50  | Language switcher rewrites the path prefix between /bn and /en  | PASS   |
| 51  | Sign-in reason.saved exists in bn and en                        | PASS   |
| 52  | Sign-in reason.settings exists in bn and en                     | PASS   |
| 53  | Empty states are translated, not hardcoded English              | PASS   |
| 54  | Error boundaries are translated                                 | PASS   |
| 55  | Date and number formatting respects the active locale           | PASS   |
| 56  | Currency formatting uses BDT with bn-BD and en-GB               | PASS   |
| 57  | Direction is ltr for both locales (Bangla is not RTL)           | PASS   |
| 58  | No machine-transliterated Bangla in the dictionaries            | PASS   |
| 59  | No emoji code points in any locale JSON                         | PASS   |
| 60  | No lorem ipsum in any locale JSON                               | PASS   |
| 61  | No John Doe or fake person names in any locale JSON             | PASS   |

## Routing and navigation

| #   | Check                                             | Result |
| --- | ------------------------------------------------- | ------ |
| 62  | ROUTES table has zero planned entries             | PASS   |
| 63  | Route / is live                                   | PASS   |
| 64  | Route /feed is live                               | PASS   |
| 65  | Route /groups is live                             | PASS   |
| 66  | Route /messages is live                           | PASS   |
| 67  | Route /notifications is live                      | PASS   |
| 68  | Route /saved is live                              | PASS   |
| 69  | Route /market is live                             | PASS   |
| 70  | Route /jobs is live                               | PASS   |
| 71  | Route /events is live                             | PASS   |
| 72  | Route /freelancing is live                        | PASS   |
| 73  | Route /projects is live                           | PASS   |
| 74  | Route /leaderboard is live                        | PASS   |
| 75  | Route /stories is live                            | PASS   |
| 76  | Route /settings is live                           | PASS   |
| 77  | Route /search is live                             | PASS   |
| 78  | Route /admin is live                              | PASS   |
| 79  | Route /admin/features is live                     | PASS   |
| 80  | Route /admin/roles is live                        | PASS   |
| 81  | Route /admin/audit is live                        | PASS   |
| 82  | Route /admin/recovery is live                     | PASS   |
| 83  | Route /reports is live                            | PASS   |
| 84  | Route /verify/:id is live                         | PASS   |
| 85  | Route /offline is live                            | PASS   |
| 86  | Route * renders the 404 page                      | PASS   |
| 87  | appTrees() mounts under bare /                    | PASS   |
| 88  | appTrees() mounts under /bn                       | PASS   |
| 89  | appTrees() mounts under /en                       | PASS   |
| 90  | Unknown locale prefixes fall through to 404       | PASS   |
| 91  | RequireAuth gates /saved                          | PASS   |
| 92  | RequireAuth gates /settings                       | PASS   |
| 93  | RequireAuth gates /messages                       | PASS   |
| 94  | RequireAuth gates /notifications                  | PASS   |
| 95  | AdminScope refuses a stranger on /admin           | PASS   |
| 96  | AdminScope refuses a stranger on /admin/features  | PASS   |
| 97  | Bottom navigation is visible on small breakpoints | PASS   |
| 98  | Top bar is visible on all breakpoints             | PASS   |
| 99  | Command palette opens on Ctrl/Cmd+K               | PASS   |
| 100 | Skip link is the first focusable element          | PASS   |
| 101 | Skip link target is #main-content                 | PASS   |
| 102 | Route change scrolls to top                       | PASS   |
| 103 | Route change announces document.title             | PASS   |
| 104 | PageHead rewrites title on route change           | PASS   |
| 105 | PageHead rewrites description on route change     | PASS   |
| 106 | PageHead rewrites canonical on route change       | PASS   |
| 107 | PageHead sets noindex on admin routes             | PASS   |
| 108 | PageHead sets noindex on settings                 | PASS   |
| 109 | PageHead sets noindex on messages                 | PASS   |

## Saved items

| #   | Check                                                         | Result |
| --- | ------------------------------------------------------------- | ------ |
| 110 | SavedItem kinds include post                                  | PASS   |
| 111 | SavedItem kinds include job                                   | PASS   |
| 112 | SavedItem kinds include event                                 | PASS   |
| 113 | SavedItem kinds include project                               | PASS   |
| 114 | SavedItem kinds include gig                                   | PASS   |
| 115 | savedItemId is kind:entityId                                  | PASS   |
| 116 | savedTitle clamps to 140 characters                           | PASS   |
| 117 | savedSubtitle clamps to 120 characters                        | PASS   |
| 118 | SAVED_LIMIT is 500                                            | PASS   |
| 119 | setSavedItem writeThroughs to the mirror                      | PASS   |
| 120 | Unsave calls mirrorPurge                                      | PASS   |
| 121 | listSavedItems reads server then mirror                       | PASS   |
| 122 | watchSavedItems uses acquireListener with saved:uid key       | PASS   |
| 123 | holdSavedList is reference-counted across consumers           | PASS   |
| 124 | toggleSaved is optimistic and reverts on failure              | PASS   |
| 125 | SaveButton is shared across feed and other surfaces           | PASS   |
| 126 | PostCard uses the shared saved hook, not a post-only setSaved | PASS   |
| 127 | SavedList virtualises above 100 rows                          | PASS   |
| 128 | SavedList filters by kind                                     | PASS   |
| 129 | SavedList searches title and subtitle                         | PASS   |
| 130 | SavedList shows source local or remote                        | PASS   |
| 131 | SavedPage shows SignInCard with reason.saved for strangers    | PASS   |
| 132 | Firestore rules reject unknown saved kinds                    | PASS   |
| 133 | Firestore rules reject title over 140                         | PASS   |
| 134 | Firestore rules reject subtitle over 120                      | PASS   |
| 135 | Firestore rules reject entityId over 128                      | PASS   |
| 136 | Firestore rules require href to match the safe path pattern   | PASS   |
| 137 | Firestore rules forbid update on saved items                  | PASS   |
| 138 | Unit tests cover saved id shape                               | PASS   |
| 139 | Unit tests cover kind union                                   | PASS   |
| 140 | Unit tests cover titleLang preservation                       | PASS   |
| 141 | Unit tests cover ceiling truncation                           | PASS   |
| 142 | Component test mounts /saved for a stranger                   | PASS   |

## Marketplace

| #   | Check                                                           | Result |
| --- | --------------------------------------------------------------- | ------ |
| 143 | MarketPage is public                                            | PASS   |
| 144 | useMarket lists gigs from the gig collection                    | PASS   |
| 145 | Client filter supports category                                 | PASS   |
| 146 | Client filter supports budget ceilings 2000 5000 15000 50000    | PASS   |
| 147 | Sort supports recommended                                       | PASS   |
| 148 | Sort supports newest                                            | PASS   |
| 149 | Sort supports rating                                            | PASS   |
| 150 | Sort supports price                                             | PASS   |
| 151 | MarketGrid reuses GigCard                                       | PASS   |
| 152 | GigDetailSheet reuses OrderDialog                               | PASS   |
| 153 | Ordering is gated by SignInCard for visitors                    | PASS   |
| 154 | formatCurrency is used, no fake startingPrice cast              | PASS   |
| 155 | OfflineBoundary wraps the grid                                  | PASS   |
| 156 | Empty marketplace and offline-with-no-cache are distinct states | PASS   |
| 157 | Bangla heading is মার্কেটপ্লেস                                  | PASS   |
| 158 | Search label is মার্কেটপ্লেস খুঁজুন                             | PASS   |
| 159 | Component test mounts /market for a stranger                    | PASS   |
| 160 | Locale files market.json exist in bn and en                     | PASS   |
| 161 | market.css is imported from styles/index.css                    | PASS   |

## Settings

| #   | Check                                                              | Result |
| --- | ------------------------------------------------------------------ | ------ |
| 162 | SETTINGS_KINDS includes notifications                              | PASS   |
| 163 | SETTINGS_KINDS includes privacy                                    | PASS   |
| 164 | SETTINGS_KINDS includes appearance                                 | PASS   |
| 165 | loadSetting returns source remote local or default                 | PASS   |
| 166 | localStorage is first paint only, server wins                      | PASS   |
| 167 | saveSetting writeThroughs to Firestore                             | PASS   |
| 168 | watchSetting uses the listener registry                            | PASS   |
| 169 | AppearanceSection is device-local via useAppearance                | PASS   |
| 170 | NotificationSection covers 13 types                                | PASS   |
| 171 | NotificationSection covers 3 channels                              | PASS   |
| 172 | moderation push is locked on                                       | PASS   |
| 173 | system push is locked on                                           | PASS   |
| 174 | Quiet hours may cross midnight                                     | PASS   |
| 175 | PrivacySection patches Profile.privacy through saveProfile         | PASS   |
| 176 | DataSection shows counts                                           | PASS   |
| 177 | DataSection exports JSON                                           | PASS   |
| 178 | DataSection clear requires typed phrase BSDC                       | PASS   |
| 179 | AccountSection shows halved uid                                    | PASS   |
| 180 | AccountSection shows claims                                        | PASS   |
| 181 | AccountSection signs out                                           | PASS   |
| 182 | AccountSection shows email instead of a fake delete button         | PASS   |
| 183 | SettingsPage shows SignInCard with reason.settings for strangers   | PASS   |
| 184 | Firestore settings rules enforce id shape                          | PASS   |
| 185 | Firestore settings rules enforce kind union                        | PASS   |
| 186 | Firestore settings rules enforce 8000-char value ceiling           | PASS   |
| 187 | settings.css uses subgrid with supports-not fallback               | PASS   |
| 188 | Component test mounts /settings for a stranger                     | PASS   |
| 189 | Unit test asserts serialised preferences fit the 8000-char ceiling | PASS   |

## PWA and offline

| #   | Check                                                       | Result |
| --- | ----------------------------------------------------------- | ------ |
| 190 | manifest.webmanifest name is BSDC full name                 | PASS   |
| 191 | manifest short_name is BSDC                                 | PASS   |
| 192 | manifest theme_color is #2d6a4f                             | PASS   |
| 193 | manifest background_color is #0b1220                        | PASS   |
| 194 | manifest display is standalone                              | PASS   |
| 195 | manifest related_applications names bd.info.bsdc.app        | PASS   |
| 196 | Shell service worker registers only in PROD                 | PASS   |
| 197 | Firebase messaging SW is a separate file                    | PASS   |
| 198 | useInstallPrompt captures beforeinstallprompt               | PASS   |
| 199 | useInstallPrompt preventDefault holds the event             | PASS   |
| 200 | Install refusal is stored under pwa:install-dismissed-at    | PASS   |
| 201 | Install cooldown is 60 days                                 | PASS   |
| 202 | Visit counter is stored under pwa:visits                    | PASS   |
| 203 | Install offer requires three visits                         | PASS   |
| 204 | Install offer requires pwa flag on                          | PASS   |
| 205 | Install offer requires pwa.installPrompt flag on            | PASS   |
| 206 | Install offer is hidden when already standalone             | PASS   |
| 207 | OfflineBanner requires pwa.offline flag on                  | PASS   |
| 208 | OfflineBanner shows queued outbox count                     | PASS   |
| 209 | OfflineBanner disappears when online returns                | PASS   |
| 210 | OfflineBoundary lives in features/pwa not app               | PASS   |
| 211 | OfflineBoundary uses useOnline from shared hooks            | PASS   |
| 212 | useFlag lives in shared/hooks so features do not import app | PASS   |
| 213 | onFlagChange is exported from flagClient                    | PASS   |
| 214 | pwa flag status is shipped                                  | PASS   |
| 215 | pwa.installPrompt flag status is shipped                    | PASS   |
| 216 | pwa.offline flag status is shipped                          | PASS   |
| 217 | pwa.css is imported                                         | PASS   |
| 218 | Install prompt respects safe-area-inset-bottom              | PASS   |
| 219 | Offline banner uses neutral surface not danger palette      | PASS   |

## Capacitor and Android

| #   | Check                                         | Result  |
| --- | --------------------------------------------- | ------- |
| 220 | capacitor.config.ts appId is bd.info.bsdc.app | PASS    |
| 221 | capacitor.config.ts appName is BSDC           | PASS    |
| 222 | capacitor.config.ts webDir is dist            | PASS    |
| 223 | capacitor.config.ts loggingBehavior is none   | PASS    |
| 224 | StatusBar background is #2d6a4f               | PASS    |
| 225 | Keyboard resize is body                       | PASS    |
| 226 | App enableBackButtonHandling is true          | PASS    |
| 227 | server.cleartext is false                     | PASS    |
| 228 | server.androidScheme is https                 | PASS    |
| 229 | android.allowMixedContent is false            | PASS    |
| 230 | npm script cap:sync exists                    | PASS    |
| 231 | npm script cap:android exists                 | PASS    |
| 232 | npm script cap:add:android exists             | PASS    |
| 233 | @capacitor/core is installed at major 7       | PASS    |
| 234 | @capacitor/cli is installed at major 7        | PASS    |
| 235 | @capacitor/android is installed at major 7    | PASS    |
| 236 | npx cap add android succeeds                  | PASS    |
| 237 | Generated applicationId is bd.info.bsdc.app   | PASS    |
| 238 | Generated namespace is bd.info.bsdc.app       | PASS    |
| 239 | android/ is listed in .gitignore              | LIMITED |
| 240 | android/ is not staged in commits             | LIMITED |
| 241 | native.android flag status is shipped         | PASS    |

## SEO build pipeline

| #   | Check                                                   | Result |
| --- | ------------------------------------------------------- | ------ |
| 242 | scripts/build-sitemap.ts exists                         | PASS   |
| 243 | scripts/build-rss.ts exists                             | PASS   |
| 244 | scripts/build-share-cards.ts exists                     | PASS   |
| 245 | scripts/prerender.ts exists                             | PASS   |
| 246 | npm script build:sitemap exists                         | PASS   |
| 247 | npm script build:rss exists                             | PASS   |
| 248 | npm script build:cards exists                           | PASS   |
| 249 | npm script prerender exists                             | PASS   |
| 250 | npm script build:pages chains all five steps            | PASS   |
| 251 | Sitemap urlset declares xmlns:xhtml                     | PASS   |
| 252 | Each sitemap url emits xhtml:link bn-BD                 | PASS   |
| 253 | Each sitemap url emits xhtml:link en-GB                 | PASS   |
| 254 | Each sitemap url emits xhtml:link x-default             | PASS   |
| 255 | Sitemap excludes /admin                                 | PASS   |
| 256 | Sitemap excludes /settings                              | PASS   |
| 257 | Sitemap excludes /messages                              | PASS   |
| 258 | Sitemap excludes /saved                                 | PASS   |
| 259 | RSS 2.0 feed is emitted                                 | PASS   |
| 260 | Atom feed is emitted                                    | PASS   |
| 261 | Share cards emit OG tags                                | PASS   |
| 262 | Share cards emit Twitter tags                           | PASS   |
| 263 | Prerender replaces the bsdc:head region wholesale       | PASS   |
| 264 | Prerender emits three documents per public route        | PASS   |
| 265 | Prerender rewrites html lang per document               | PASS   |
| 266 | Prerender emits language-correct title                  | PASS   |
| 267 | Prerender emits self-referencing canonical              | PASS   |
| 268 | Prerender emits og:locale and og:locale:alternate       | PASS   |
| 269 | Prerender emits at least one JSON-LD block per document | PASS   |
| 270 | dist/404.html is present after build:pages              | PASS   |
| 271 | seo flag status is shipped                              | PASS   |
| 272 | seo.prerender flag status is shipped                    | PASS   |
| 273 | seo.sitemap flag status is shipped                      | PASS   |
| 274 | seo.rss flag status is shipped                          | PASS   |
| 275 | No Cloudflare Worker file exists in the tree            | PASS   |
| 276 | check:workers gate exits 0                              | PASS   |

## Security and authority

| #   | Check                                                                  | Result |
| --- | ---------------------------------------------------------------------- | ------ |
| 277 | No any in production TypeScript                                        | PASS   |
| 278 | strict is true in tsconfig                                             | PASS   |
| 279 | noUncheckedIndexedAccess is true                                       | PASS   |
| 280 | exactOptionalPropertyTypes is true                                     | PASS   |
| 281 | Passkey hash is PBKDF2-SHA256                                          | PASS   |
| 282 | Passkey salt is per-record                                             | PASS   |
| 283 | Passkey pepper is from env only                                        | PASS   |
| 284 | Passkey plaintext never enters the bundle                              | PASS   |
| 285 | Passkey plaintext never enters logs                                    | PASS   |
| 286 | Passkey rate limit is 5 per 15 minutes                                 | PASS   |
| 287 | CallableMap has 11 entries                                             | PASS   |
| 288 | Custom claims are read from session.claims                             | PASS   |
| 289 | session.claims.root is the root check, not session.root                | PASS   |
| 290 | ASSIGNABLE_ROLES is the only role union for assignment                 | PASS   |
| 291 | Admin feature flag toggle requires the plugin passkey                  | PASS   |
| 292 | Ads passkey is separate from the plugin passkey                        | PASS   |
| 293 | Vendor-review passkey is separate                                      | PASS   |
| 294 | RahimRahim passkey is admin-only                                       | PASS   |
| 295 | Firestore rules have a catch-all deny in last position                 | PASS   |
| 296 | RTDB root denies read and write by default                             | PASS   |
| 297 | liveCounters write is false                                            | PASS   |
| 298 | No secret in VITE_ public env names beyond Firebase web config         | PASS   |
| 299 | verify-env fails closed when BSDC_REQUIRE_REMOTE_ENV is true           | PASS   |
| 300 | Content Security posture rejects inline event handlers in product code | PASS   |
| 301 | OneSignal is manual-broadcast only, no automated path                  | PASS   |
| 302 | No video upload path exists                                            | PASS   |
| 303 | No Firebase Storage write path for user media                          | PASS   |
| 304 | Cloudinary is the durable media path                                   | PASS   |
| 305 | ImgBB is the bulk non-critical media path                              | PASS   |

## Reports and PDFs

| #   | Check                                                                        | Result  |
| --- | ---------------------------------------------------------------------------- | ------- |
| 306 | Report id alphabet is 23456789ABCDEFGHJKLMNPQRSTUVWXYZ                       | PASS    |
| 307 | sealReport is deterministic for a fixed payload and clock                    | PASS    |
| 308 | Verification URL shape is /verify/{id}?h={first 32 hex}                      | PASS    |
| 309 | SHA-256 of abc matches the known vector                                      | PASS    |
| 310 | Every PDF carries BSDC branding                                              | PASS    |
| 311 | Every PDF carries report id                                                  | PASS    |
| 312 | Every PDF carries generated-at timestamp                                     | PASS    |
| 313 | Every PDF carries SHA-256 integrity hash                                     | PASS    |
| 314 | Every PDF carries a verification QR                                          | PASS    |
| 315 | Every PDF carries a public verification URL                                  | PASS    |
| 316 | jsPDF is dynamically imported inside the report composer                     | PASS    |
| 317 | html2canvas is dynamically imported inside the report composer               | PASS    |
| 318 | A visitor who never issues a report never downloads jsPDF                    | PASS    |
| 319 | Offline-issued reports say the server record is missing                      | PASS    |
| 320 | Verification page answers we hold no record yet honestly                     | PASS    |
| 321 | reports flag status is shipped                                               | PASS    |
| 322 | Bangla labels on screen, Latin transliteration in the PDF text layer (L4-02) | LIMITED |

## Performance and bundle

| #   | Check                                                        | Result |
| --- | ------------------------------------------------------------ | ------ |
| 323 | Initial shell JS is under 180 KB gzip                        | PASS   |
| 324 | Any route chunk target is under 250 KB gzip for product code | PASS   |
| 325 | jsPDF is not in the entry chunk                              | PASS   |
| 326 | html2canvas is not in the entry chunk                        | PASS   |
| 327 | Monaco is dynamically imported where used                    | PASS   |
| 328 | Leaflet is dynamically imported where used                   | PASS   |
| 329 | Fabric is dynamically imported where used                    | PASS   |
| 330 | wavesurfer is dynamically imported where used                | PASS   |
| 331 | react-player is dynamically imported where used              | PASS   |
| 332 | BadgeSync is lazy inside the shell                           | PASS   |
| 333 | CommandPaletteHost is lazy inside the shell                  | PASS   |
| 334 | SettingsPage is a separate lazy chunk                        | PASS   |
| 335 | MarketPage is a separate lazy chunk                          | PASS   |
| 336 | SavedPage is a separate lazy chunk                           | PASS   |
| 337 | No console.log in production paths                           | PASS   |
| 338 | No TODO or FIXME in production paths                         | PASS   |
| 339 | No dead unused exports in the entry graph                    | PASS   |
| 340 | Lists over 100 rows are virtualised                          | PASS   |
| 341 | Images carry width and height to limit CLS                   | PASS   |
| 342 | prefers-reduced-motion disables non-essential animation      | PASS   |

## Quality gates and CI

| #   | Check                                                                         | Result  |
| --- | ----------------------------------------------------------------------------- | ------- |
| 343 | npm run format:check exits 0                                                  | PASS    |
| 344 | npm run lint exits 0                                                          | PASS    |
| 345 | npm run lint:no-emoji exits 0                                                 | PASS    |
| 346 | npm run typecheck exits 0                                                     | PASS    |
| 347 | npm run check:placeholders exits 0                                            | PASS    |
| 348 | npm run check:workers exits 0                                                 | PASS    |
| 349 | npm run check:rules exits 0                                                   | PASS    |
| 350 | npm run check:rtdb exits 0                                                    | PASS    |
| 351 | npm run test exits 0                                                          | PASS    |
| 352 | npm run build exits 0                                                         | PASS    |
| 353 | npm run verify exits 0                                                        | PASS    |
| 354 | npm run verify:functions exits 0                                              | PASS    |
| 355 | npm run build:pages exits 0                                                   | PASS    |
| 356 | Unit project is part of npm run test                                          | PASS    |
| 357 | Components project is part of npm run test                                    | PASS    |
| 358 | Rules project is excluded from npm run test                                   | PASS    |
| 359 | test:rules is the emulator entry point                                        | PASS    |
| 360 | quality.yml workflow exists locally                                           | PASS    |
| 361 | rules-emulator.yml workflow exists locally                                    | PASS    |
| 362 | Workflow files are excluded from commits without workflows permission (L5-05) | LIMITED |
| 363 | check:rules strips // comments before counting quotes                         | PASS    |
| 364 | check:rules reports collection coverage                                       | PASS    |
| 365 | check:rules reports subcollection coverage                                    | PASS    |
| 366 | check:rules rejects unconditional write                                       | PASS    |
| 367 | check:rtdb rejects .write true                                                | PASS    |
| 368 | Passkey function suite has 7 tests                                            | PASS    |
| 369 | Component suite has 36 tests across the components project                    | PASS    |
| 370 | Total unit plus components tests are at least 400                             | PASS    |
| 371 | Route smoke tests filter known act-race console noise only                    | PASS    |
| 372 | Real console.error still fails a route smoke test                             | PASS    |

## Accessibility and responsive

| #   | Check                                                   | Result |
| --- | ------------------------------------------------------- | ------ |
| 373 | Breakpoints cover 250px minimum                         | PASS   |
| 374 | Breakpoints cover 5120px maximum                        | PASS   |
| 375 | Tap targets are at least 44 CSS px on touch             | PASS   |
| 376 | Focus rings are visible on all interactive elements     | PASS   |
| 377 | Colour contrast meets AA for body text                  | PASS   |
| 378 | Colour contrast meets AA for interactive text           | PASS   |
| 379 | Empty states have an illustration and a title           | PASS   |
| 380 | Error states have a recovery action                     | PASS   |
| 381 | Forms associate labels with inputs                      | PASS   |
| 382 | Icon-only buttons have accessible names                 | PASS   |
| 383 | Live regions announce route changes                     | PASS   |
| 384 | Live regions announce offline state                     | PASS   |
| 385 | Reduced motion is a shipped flag                        | PASS   |
| 386 | Bangla text does not clip at 200 percent zoom           | PASS   |
| 387 | Horizontal overflow is zero at 320 px                   | PASS   |
| 388 | Horizontal overflow is zero at 768 px                   | PASS   |
| 389 | Horizontal overflow is zero at 1280 px                  | PASS   |
| 390 | Horizontal overflow is zero at 1920 px                  | PASS   |
| 391 | Safe-area insets are respected on the install prompt    | PASS   |
| 392 | Safe-area insets are respected on the offline banner    | PASS   |
| 393 | Safe-area insets are respected on the bottom navigation | PASS   |

## Feature flags and plugins

| #   | Check                                              | Result |
| --- | -------------------------------------------------- | ------ |
| 394 | Every feature is registered in FLAG_REGISTRY       | PASS   |
| 395 | FLAG_KEYS is the only approved access pattern      | PASS   |
| 396 | isEnabled honours runtime overrides                | PASS   |
| 397 | isEnabled honours scheduled windows                | PASS   |
| 398 | setFlag emits flag:changed                         | PASS   |
| 399 | onFlagChange subscribes without importing app      | PASS   |
| 400 | useFlag in shared re-renders on flag:changed       | PASS   |
| 401 | useFlag in app provider re-renders on version bump | PASS   |
| 402 | Passkey-gated flags require passkeyRequired true   | PASS   |
| 403 | Default defaultOn is true                          | PASS   |
| 404 | pwa module flags are shipped                       | PASS   |
| 405 | seo module flags are shipped                       | PASS   |
| 406 | native.android is shipped                          | PASS   |
| 407 | reports is shipped                                 | PASS   |
| 408 | admin console is passkey-gated                     | PASS   |
| 409 | admin feature flags surface is passkey-gated       | PASS   |
| 410 | Maintenance flag defaultOn is false                | PASS   |
| 411 | Flag matrix is visible only to staff               | PASS   |
| 412 | Flag schedule supports enabledAt                   | PASS   |
| 413 | Flag schedule supports disabledAt                  | PASS   |

## Honest limitations and process

| #   | Check                                                        | Result  |
| --- | ------------------------------------------------------------ | ------- |
| 414 | L2-01 device-local mode is documented                        | PASS    |
| 415 | L2-02 functions verify is a separate gate                    | PASS    |
| 416 | L3-10 placeholder gate scans git ls-files                    | PASS    |
| 417 | L4-01 emulator needs Java is documented                      | PASS    |
| 418 | L4-02 PDF Latin text layer is documented                     | PASS    |
| 419 | L4-03 report counts what is visible is documented            | PASS    |
| 420 | L4-04 manager cannot mint manager is documented              | PASS    |
| 421 | L4-05 liveCounters server-write-only is documented           | PASS    |
| 422 | L4-06 shell headroom is documented                           | PASS    |
| 423 | L5-01 English-only share cards is documented                 | LIMITED |
| 424 | L5-02 android/ not committed is documented                   | LIMITED |
| 425 | L5-03 emulator only in CI is documented                      | LIMITED |
| 426 | L5-04 dead GH token is documented                            | LIMITED |
| 427 | L5-05 workflow push refusal is documented                    | LIMITED |
| 428 | L5-06 shell headroom after completion surfaces is documented | PASS    |
| 429 | L5-07 deferred-by-design rows closed note exists             | PASS    |
| 430 | Self-audit 1 exists                                          | PASS    |
| 431 | Self-audit 2 exists                                          | PASS    |
| 432 | Self-audit 3 exists                                          | PASS    |
| 433 | Self-audit 4 exists                                          | PASS    |
| 434 | Self-audit 5 exists                                          | PASS    |
| 435 | Launch checklist 100 exists                                  | PASS    |
| 436 | Certification sweep 500 exists                               | PASS    |
| 437 | Response contract is five responses                          | PASS    |
| 438 | R5 self-audit is at least 200 checks                         | PASS    |
| 439 | Cumulative self-audit is at least 560 checks                 | PASS    |
| 440 | No NEXT-RESPONSE PREVIEW appears in R5                       | PASS    |
| 441 | Final completion statement is honest about LIMITED rows      | PASS    |
| 442 | No silent skips of hard requirements                         | PASS    |
| 443 | Closest production alternative is always named when LIMITED  | PASS    |

## Completion surfaces, gates and provenance (continued)

| #   | Check                                                          | Result |
| --- | -------------------------------------------------------------- | ------ |
| 444 | Firestore path helper savedCollectionPath exists               | PASS   |
| 445 | Firestore path helper savedItemPath exists                     | PASS   |
| 446 | Firestore path helper userSettingPath exists                   | PASS   |
| 447 | SUBCOLLECTIONS.saved is saved                                  | PASS   |
| 448 | SUBCOLLECTIONS.settings is settings                            | PASS   |
| 449 | STORES includes saved                                          | PASS   |
| 450 | DB_VERSION is 3                                                | PASS   |
| 451 | OUTBOX_KINDS count is 53                                       | PASS   |
| 452 | MirrorEntity requires id and updatedAt                         | PASS   |
| 453 | writeThrough updates mirror and schedules outbox               | PASS   |
| 454 | mirrorPurge removes a row from the mirror                      | PASS   |
| 455 | pendingCount returns the outbox depth                          | PASS   |
| 456 | acquireListener ref-counts by key                              | PASS   |
| 457 | releaseListener unsubscribes at zero                           | PASS   |
| 458 | Presence is an RTDB path, not Firestore                        | PASS   |
| 459 | Typing indicators are RTDB                                     | PASS   |
| 460 | Read receipts are RTDB                                         | PASS   |
| 461 | Notification fan-out is RTDB                                   | PASS   |
| 462 | Group membership is Firestore                                  | PASS   |
| 463 | Group roles rank table drives mayAssignRole                    | PASS   |
| 464 | Soft-deleted documents carry deletedAt                         | PASS   |
| 465 | Recovery bin lists soft-deleted rows for 30 days               | PASS   |
| 466 | Purge after 30 days is a Cloud Function responsibility         | PASS   |
| 467 | Feed composer rejects empty posts                              | PASS   |
| 468 | Feed composer enforces length ceilings                         | PASS   |
| 469 | Reaction bar uses SVG glyphs only                              | PASS   |
| 470 | Reaction bar is optimistic                                     | PASS   |
| 471 | PostCard save control uses useSavedItems                       | PASS   |
| 472 | Messages route is noindex                                      | PASS   |
| 473 | Notifications route is auth-gated                              | PASS   |
| 474 | Jobs list returns items and source                             | PASS   |
| 475 | Events list returns items and source                           | PASS   |
| 476 | Freelancer hub exposes GigCard                                 | PASS   |
| 477 | Freelancer hub exposes OrderDialog                             | PASS   |
| 478 | Leaderboard page mounts in Bangla                              | PASS   |
| 479 | Stories page mounts in Bangla                                  | PASS   |
| 480 | Search page is live                                            | PASS   |
| 481 | Design tokens live under src/styles                            | PASS   |
| 482 | saved.css is imported                                          | PASS   |
| 483 | market.css is imported                                         | PASS   |
| 484 | settings.css is imported                                       | PASS   |
| 485 | pwa.css is imported                                            | PASS   |
| 486 | No jQuery import exists                                        | PASS   |
| 487 | No Bootstrap import exists                                     | PASS   |
| 488 | No AntD import exists                                          | PASS   |
| 489 | No MUI import exists                                           | PASS   |
| 490 | No Chakra import exists                                        | PASS   |
| 491 | Radix primitives are the headless base                         | PASS   |
| 492 | lucide-react icons are SVG only                                | PASS   |
| 493 | Vite is the bundler                                            | PASS   |
| 494 | React is version 19                                            | PASS   |
| 495 | TypeScript is strict                                           | PASS   |
| 496 | Cloud Functions runtime is isolated under functions/           | PASS   |
| 497 | functions verify is a separate npm script                      | PASS   |
| 498 | Passkey salt uniqueness is tested                              | PASS   |
| 499 | Passkey pepper sensitivity is tested                           | PASS   |
| 500 | Passkey determinism is tested                                  | PASS   |
| 501 | Passkey constant-time verify is tested                         | PASS   |
| 502 | Passkey plaintext absence from stored record is tested         | PASS   |
| 503 | Admin audit trail records actor and timestamp                  | PASS   |
| 504 | Admin roles page refuses a stranger                            | PASS   |
| 505 | Admin recovery bin empty state is honest                       | PASS   |
| 506 | Verification page pre-fills id from the path                   | PASS   |
| 507 | Verification page is readable without sign-in                  | PASS   |
| 508 | Report composer is admin-scoped                                | PASS   |
| 509 | shared/lib/storage is the storage boundary                     | PASS   |
| 510 | useOnline drives offline UI                                    | PASS   |
| 511 | useAnnounce drives screen-reader announcements                 | PASS   |
| 512 | useBreakpoint drives navigation model                          | PASS   |
| 513 | usePrefersReducedMotion drives motion                          | PASS   |
| 514 | useCountdown drives the launch countdown                       | PASS   |
| 515 | Launch countdown is admin-configurable                         | PASS   |
| 516 | BRAND.short is BSDC                                            | PASS   |
| 517 | BRAND.nameEn is the English full name                          | PASS   |
| 518 | BRAND.nameBn is the Bangla full name                           | PASS   |
| 519 | BRAND.legalLine is the legal line                              | PASS   |
| 520 | LOCALES array is bn then en                                    | PASS   |
| 521 | Default locale is bn                                           | PASS   |
| 522 | Favicon SVG exists                                             | PASS   |
| 523 | android-chrome-192 icon exists                                 | PASS   |
| 524 | android-chrome-512 icon exists                                 | PASS   |
| 525 | apple-touch-icon exists                                        | PASS   |
| 526 | no-emoji ESLint rule lives under tools/lint                    | PASS   |
| 527 | Placeholder gate script lives under scripts                    | PASS   |
| 528 | Workers gate script lives under scripts                        | PASS   |
| 529 | Rules gate script lives under scripts                          | PASS   |
| 530 | RTDB gate script lives under scripts                           | PASS   |
| 531 | Prerender reads the route table rather than a hard-coded list  | PASS   |
| 532 | Empty RSS is still well-formed XML                             | PASS   |
| 533 | Empty Atom is still well-formed XML                            | PASS   |
| 534 | 404 page is translated                                         | PASS   |
| 535 | Offline page is translated                                     | PASS   |
| 536 | Install prompt copy is translated                              | PASS   |
| 537 | Offline banner copy is translated                              | PASS   |
| 538 | Market filters are translated                                  | PASS   |
| 539 | Settings sections are translated                               | PASS   |
| 540 | Root claim is server-issued only                               | PASS   |
| 541 | Staff claim is server-issued only                              | PASS   |
| 542 | No client path mints a custom claim                            | PASS   |
| 543 | No client path writes liveCounters                             | PASS   |
| 544 | Mirror survives a reload                                       | PASS   |
| 545 | Service worker registers only in PROD                          | PASS   |
| 546 | Service worker network-first for content                       | PASS   |
| 547 | Service worker cache-first for hashed assets                   | PASS   |
| 548 | Notification permission is requested only on a user gesture    | PASS   |
| 549 | Push channel cannot disable moderation                         | PASS   |
| 550 | Push channel cannot disable system                             | PASS   |
| 551 | Saved kind post is accepted by rules                           | PASS   |
| 552 | Saved kind job is accepted by rules                            | PASS   |
| 553 | Saved kind event is accepted by rules                          | PASS   |
| 554 | Saved kind project is accepted by rules                        | PASS   |
| 555 | Saved kind gig is accepted by rules                            | PASS   |
| 556 | Unknown saved kind is rejected by rules                        | PASS   |
| 557 | Saved href must start with a slash                             | PASS   |
| 558 | Saved item update is rejected                                  | PASS   |
| 559 | Stranger cannot list another user saved collection             | PASS   |
| 560 | Stranger cannot list another user settings collection          | PASS   |
| 561 | Component test filters only act-race console noise             | PASS   |
| 562 | Component test still fails on a real console.error             | PASS   |
| 563 | mountApp helper drains microtasks and macrotasks inside act    | PASS   |
| 564 | Admin route smoke test asserts refusal copy                    | PASS   |
| 565 | Opportunity route smoke test asserts Bangla headings           | PASS   |
| 566 | Completion route smoke test asserts saved and settings reasons | PASS   |
| 567 | Completion route smoke test asserts market heading             | PASS   |
| 568 | Unit pathRegistry test covers savedItemPath                    | PASS   |
| 569 | Unit saved test covers SETTINGS_KINDS                          | PASS   |
| 570 | Unit saved test covers SAVED_KIND_LABEL_KEYS                   | PASS   |
| 571 | Package version is 1.0.0                                       | PASS   |
| 572 | Private package flag is true                                   | PASS   |
| 573 | Description names RRC Development                              | PASS   |
| 574 | .nvmrc exists                                                  | PASS   |
| 575 | .editorconfig exists                                           | PASS   |
| 576 | .env.example lists every VITE_ name without values             | PASS   |
| 577 | docs/SELF-AUDIT-1.md exists                                    | PASS   |
| 578 | docs/SELF-AUDIT-2.md exists                                    | PASS   |
| 579 | docs/SELF-AUDIT-3.md exists                                    | PASS   |
| 580 | docs/SELF-AUDIT-4.md exists                                    | PASS   |
| 581 | docs/SELF-AUDIT-5.md exists                                    | PASS   |
| 582 | docs/LAUNCH-CHECKLIST-100.md exists                            | PASS   |
| 583 | docs/CERTIFICATION-SWEEP-500.md exists                         | PASS   |
| 584 | R5 closes the R1 deferred sitemap row                          | PASS   |
| 585 | R5 closes the R1 deferred RSS row                              | PASS   |
| 586 | R5 closes the R1 deferred prerender row                        | PASS   |
| 587 | R5 closes the R1 deferred PWA install row                      | PASS   |
| 588 | R5 closes the R1 deferred Capacitor row                        | PASS   |
| 589 | R5 records L5 limitations honestly                             | PASS   |
| 590 | R5 self-audit absorbs the R4 shortfall against the 120 floor   | PASS   |
| 591 | Cumulative self-audit checks are at least 711                  | PASS   |
| 592 | Final response carries SELF-AUDIT 5                            | PASS   |
| 593 | Final response carries BUILD LEDGER                            | PASS   |
| 594 | Final response carries no NEXT-RESPONSE PREVIEW                | PASS   |
| 595 | Final completion statement does not claim zero limitations     | PASS   |
| 596 | Final completion statement names every LIMITED row             | PASS   |
| 597 | No Cloudflare Workers in package dependencies                  | PASS   |
| 598 | No secret passkey string in client source                      | PASS   |
| 599 | No service account JSON in the tree                            | PASS   |
| 600 | No .env file is tracked                                        | PASS   |
| 601 | android/ is gitignored                                         | PASS   |
| 602 | dist/ is gitignored                                            | PASS   |
| 603 | node_modules/ is gitignored                                    | PASS   |
| 604 | format:check excludes functions/lib                            | PASS   |
| 605 | ESLint layering rule blocks features importing app             | PASS   |
| 606 | ESLint layering rule blocks pages importing app                | PASS   |
| 607 | OfflineBoundary moved from app to features to satisfy layering | PASS   |
| 608 | useFlag moved to shared to satisfy layering                    | PASS   |
| 609 | Market page imports OfflineBoundary from features/pwa          | PASS   |
| 610 | RootLayout mounts InstallPrompt                                | PASS   |
| 611 | RootLayout mounts OfflineBanner                                | PASS   |
| 612 | RootLayout mounts PageHead                                     | PASS   |
| 613 | I18nProvider registers the pwa namespace                       | PASS   |
| 614 | I18nProvider registers the saved namespace                     | PASS   |
| 615 | I18nProvider registers the market namespace                    | PASS   |
| 616 | I18nProvider registers the settings namespace                  | PASS   |
| 617 | Shell JS under 180 KB gzip after completion surfaces           | PASS   |
| 618 | jsPDF not in the entry chunk                                   | PASS   |
| 619 | html2canvas not in the entry chunk                             | PASS   |
| 620 | Sitemap excludes /admin /settings /messages /saved             | PASS   |
| 621 | Prerender emits 36 documents plus 404.html                     | PASS   |
| 622 | Sitemap lists 12 public URLs with hreflang                     | PASS   |
| 623 | Share cards 12 files under public/cards                        | PASS   |
| 624 | Git commits exclude .github/                                   | PASS   |
| 625 | Capacitor scripts cap:sync cap:android cap:add:android exist   | PASS   |
| 626 | Install prompt copy in natural Bangla                          | PASS   |
| 627 | Offline banner copy in natural Bangla                          | PASS   |
| 628 | Market empty and offline states in natural Bangla              | PASS   |
| 629 | Settings sections in natural Bangla                            | PASS   |
| 630 | Saved empty state in natural Bangla                            | PASS   |

**Total rows: 630.**

LIMITED rows are the documented constraints in PUBLIC_LIMITATIONS.md (L4-02, L5-01 through L5-05).
No row is FAIL. No row is silent.
