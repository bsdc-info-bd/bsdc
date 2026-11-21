# Android OSM map — diagnosis, and why the rewrite was not the fix

Prompt §2 asked for every possible cause of the blank map to be checked explicitly, and §3
declared the WebView + Leaflet architecture to be the root cause, to be replaced by osmdroid.
This file records what the code actually says, what was measured, and where the remaining risk
genuinely lives. It is written before any rewrite decision, because a rewrite that is not caused
by a finding is a replacement of tested code with untested code.

Commands that produced this:

| What | Command | Result |
| --- | --- | --- |
| Page layer vs the app's own rules | `node scripts/osm-page-check.mjs` | **all checks passed**, exit 0 |
| …and proof that the check bites | `python3 scripts/osm-page-check-plants.py` | **7/7 planted defects caught** |
| The page actually running | `node scripts/osm-page-run.mjs` (needs `npm i --no-save jsdom`; runs the real bundled Leaflet 1.9.4) | map initialised, tiles requested, status protocol emitted, no page errors |
| Kotlin unit tests, lint, APK | `cd android-app && ./gradlew test lint assembleDebug` | **not run here**: no JDK, no Android SDK, no `gradle-wrapper.jar` in this sandbox. CI's `Android` job runs them. |

## 1. What the map is

`MkOsmPinMap.kt` (1050 lines) builds a small HTML document, loads it with
`loadDataWithBaseURL("https://www.bsdc.info.bd/", html, …)`, and answers the document's own
subresources from `shouldInterceptRequest`: the two Leaflet files come from
`feature/market/src/main/assets/leaflet/`, and tiles are fetched by the app with
`HttpURLConnection`, a fixed identifying UA, a Referer, a byte cap, a redirect allowlist and an
in-memory LRU. Leaflet reports each tile through `console.log`, and `MkLogic` turns that line into
`LOADING → READY/ERROR`, which `OsmMapNotice` renders (spinner, or a message plus Retry).

That is a fragile *shape*, but every step of it is currently demonstrably wired up, and the parts
that could fail silently are the parts a device is required to test.

## 2. Every cause in prompt §2, checked

Verdicts: **ruled out** (disproved here), **real gap** (a defect to fix), **device** (cannot be
settled in this environment, and not settled by a rewrite either).

| # | Claim | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | `INTERNET` permission missing | **ruled out** | declared in `app/src/main/AndroidManifest.xml`; also present for the release variant |
| 2 | `ACCESS_NETWORK_STATE` missing | **ruled out** | declared; and no code path gates a tile on connectivity, so a missing permission cannot blank the map |
| 3 | Cleartext blocked by network security config | **ruled out** | `res/xml/network_security_config.xml` + every URL in the map path is `https://`; `classifyOsmMapResource` *refuses* non-HTTPS and any port but 443, so mixed content is not reachable by construction |
| 4 | Proxy/VPN interference | **device** | — |
| 5 | JavaScript disabled | **ruled out** | `configureOsmWebView()` sets `javaScriptEnabled = true` |
| 6 | DOM storage disabled | **ruled out** | set to `false` deliberately; nothing in Leaflet 1.9.4 uses `localStorage` (checked against the bundled file), and the pages store no state |
| 7 | `SITE_ORIGIN` base URL wrong/unreachable | **ruled out** | `BsdcHosts.SITE_ORIGIN = "https://www.bsdc.info.bd"` — a compile-time constant, https, and the exact host the classifier expects. The base URL's only job is to give the subresources an origin to be *intercepted* from; the site itself is never fetched for the map |
| 8 | Interceptor blocks the Leaflet assets | **ruled out (as written)** | the page asks for `https://www.bsdc.info.bd/__bsdc_map/leaflet.{js,css}` and `isOsmMapAssetRequest` accepts exactly those; host compare is lower-cased and trailing-dot-stripped, and `MkOsmTileTest` pins the case/host variants. **The gap that was real**: nothing proved the asset file on disk still matches the name the interceptor opens — now checked by `scripts/osm-page-check.mjs`, and a rename is caught |
| 9 | Shard redirects not followed | **ruled out** | `followTileRedirect` follows up to 4 hops, re-applies the headers at each, and refuses any hop that is not https-and-OSM; `isOsmTileRequest` accepts the canonical host and `a.`/`b.`/`c.` |
| 10 | `WebResourceResponse` with empty body / wrong MIME | **ruled out** | a failed tile returns `null`, which hands the request back to WebView rather than answering it with an empty image; success returns `image/png` with the bytes read |
| 11 | OSM rejects the UA | **device, but prepared** | the interceptor sends `BSDC-Android/1.0 (+https://www.bsdc.info.bd)` and a `Referer`, and WebView's own UA gets the same suffix appended. What OSM answers to that cannot be asked from here (`operations.osmfoundation.org` and `tile.openstreetmap.org` are both outside this sandbox's egress allowlist) |
| 12 | 403/429 rate limiting | **device**, and the reason §5.3/§5.4 matter — see *real gaps* |
| 13 | Geographic/IP blocking | **device** |
| 14 | Primary server down; no fallback | **real gap** — see below |
| 15 | `HttpURLConnection` exceptions swallowed | **ruled out** | every path is `runCatching`-wrapped *and logged*, and the map still reaches a visible state, because a tile that never resolves cannot produce a `tileload`/`tileerror`, and #25's timeout turns that into ERROR + Retry |
| 16 | 8 s timeouts too short for BD mobile | **judgement call, not a bug** | per-tile 8 s sits inside a 20 s first-paint budget; the fix that helps is failover (below), not a longer wait |
| 17 | Cache race conditions | **ruled out** | `totalBytes` and the map are mutated only inside `synchronized(entries)`; `removeEldestEntry` is overridden to `false` because eviction is done by hand — dead but harmless (worth deleting) |
| 18 | Premature eviction → refetch storms | **real gap (mild)** | 256 entries / 16 MB, memory only, so an app restart refetches everything: see *disk cache* |
| 19 | Stream consumed/closed wrongly | **ruled out** | the body is fully read into a byte array before the response is built, capped at `MAX_TILE_BYTES + 1`; the stream given to WebView is a `ByteArrayInputStream` |
| 20 | `leaflet.js` 404s | **ruled out** | not served by the web tier at all (grep for `__bsdc_map` finds only the Android constants and a test) — it is answered from the APK, and `leaflet.js` is a genuine 147 552-byte Leaflet 1.9.4 with its license file |
| 21 | `leaflet.css` missing → zero-size map | **ruled out** | bundled, 14 806 bytes; and the pages do not depend on it for size (see #22) |
| 22 | `#map` has zero dimensions at init | **ruled out for the page, device for the shell** | the page sizes itself: `html,body{height:100%}` + `#map{position:absolute;inset:0}` — which the gate now asserts. Every call site gives the composable real height: the picker sets `.height(230.dp)` itself, the dialog passes `.weight(1f)`, the vendor console wraps it in `.height(160.dp)` + `fillMaxSize()`. **A zero-size run was attempted here and the result was inconclusive** (jsdom reports no layout, so the rect stub overrode the case) — that hypothesis is explicitly *not* confirmed, and no code was changed for it |
| 23 | Tile URL template wrong | **ruled out** | `https://tile.openstreetmap.org/{z}/{x}/{y}.png`; under jsdom Leaflet expanded it to real, in-range requests (`…/13/6153/3537.png`) |
| 24 | `tileerror`/`tileload` never fire | **ruled out** | both handlers are attached before `addTo(map)`, and the running page emitted `[BSDC_MAP] tileload ok=1..4 errors=0`, which the Kotlin parser maps to READY. **The gate that was missing**: nothing pinned the page's printed string against the parser's regex — and the first version of that gate was itself a false negative, because it extracted the Kotlin regex with a `"…"` pattern while the source uses `"""…"""`, producing `new RegExp("")`, which matches everything. Now the regex is extracted with its shape asserted, plus a negative control that fails if the pattern would also accept a near-miss |
| 25 | 20 s timeout too short | **device** | the user sees a spinner labelled "Loading map tiles…" throughout, not a blank; 20 s is a policy choice |
| 26 | Retry does not recreate state | **ruled out** | `key(retryVersion)` disposes and rebuilds the `AndroidView`, `state.loaded` is reset inside the factory, and `generation`/`currentGeneration()` drops callbacks from the discarded WebView |
| 27 | Notice states wrong | **ruled out** | `OsmMapNotice` returns early only for READY, so there is *always* a visible state; LOADING shows a spinner, ERROR shows a message and a Retry button, both localised |
| 28 | State lost on configuration change | **real gap (minor)** | the map is rebuilt from `lat`/`lng` (state survives in the caller), but zoom/centre are not — the picker re-centres. Restoring `MapViewTarget` would be nice; it does not blank the map |
| 29 | The architecture is the root cause | **not supported by the evidence** | every layer of the architecture that can be exercised here works: the assets are real, the classification matches what the page requests, tiles are requested with correct URLs, and the status protocol reaches READY |
| 30 | No native/hardware rendering, no offline | **true, and it is a feature gap, not the blank map** |
| 31 | No fallback tile servers | **real gap** — the only failover is three shards of the same server |
| 32 | No offline support | **real gap** — memory-only cache |

## 3. The two gaps worth engineering, and the rewrite that is not one

Prompt §5.3, §3.3.2 and §6.4 name both of these, and they are the only findings here that would
actually change what a user in Sylhet experiences on a bad day:

**Tile-provider failover.** `a.`/`b.`/`c.tile.openstreetmap.org` are the same infrastructure: if
OSM rate-limits or blocks this app, all three fail together and the map is blank with a Retry
button that can only fail again. Failover has to cross a provider boundary — e.g.
`tile.openstreetmap.de` — with health tracking so a dead provider is skipped rather than retried
per tile. Design: keep it a *pure* rule in `MkLogic` (candidate URL list for a `z/x/y`, and a
health record of consecutive failures with a cooldown), which `MkOsmTileTest` can unit-test
without a device, and let `fetchTile` walk the candidates. The page never learns about it — it
asks for the canonical URL, the app answers with bytes from whichever provider is healthy — so no
allowlist widening on the WebView side is needed. Note the policy point honestly: alternative
OSM renderings are third-party services with their own usage rules, and each one added must be
checked against its policy before it goes in the list.

**Disk tile cache.** 256 entries in memory means every app start re-downloads the map area the
user was just looking at, on the same network that failed before. A bounded on-disk LRU under
`noBackupFilesDir` gives offline viewing of recently-seen areas and removes most refetching; it
also makes the "cache read failure falls back to network" requirement in §6.2 testable.

Both are ~150 lines inside the current architecture, with tests that CI runs. Neither requires
replacing the renderer.

**On osmdroid.** It is the right library for offline `.map` files, GPU path rendering and vector
tiles, and it should be adopted when the map needs to *do* something the page cannot — persistent
offline regions, markers in hundreds, rotation. Adopting it as a *fix for a blank map* is not
supported by anything above, and in this environment it would be strictly worse engineering:

* osmdroid talks to the same `tile.openstreetmap.org` under the same usage policy, so every
  §2.3 cause survives the migration unchanged;
* the dependency cannot be resolved from this sandbox (Maven Central is not reachable), so the
  build could not be verified here, and the Kotlin/Compose layer cannot be compiled at all (no
  JDK, no Android SDK, no wrapper jar) — a ~2 000-line unverifiable swap replaces code whose
  contract is currently *proven*;
* the current design also carries decisions that a rewrite tends to lose quietly: the subresource
  allowlist that keeps the map's WebView from becoming a general fetcher, the tile byte cap, the
  redirect host check, the no-bridge read-only page, and the "always show a state" notice. Each of
  those has a test or a gate; the plan must re-establish all of them before §9's DoD could be
  answered.

What is therefore proposed: land failover + disk cache now (with tests), keep the page-layer gate
in CI, and schedule osmdroid as its own migration with its own acceptance list — not smuggled in
as a bug fix.

## 4. What only a device can prove, and how to prove it

§9's items 2, 6, 8, 9, 10 and 15 (tiles visible, 60 fps, drag-to-move-pin, rotation, screenshots)
are not answerable from this repository state, and no CI step here can fake them. The honest
method, when a device is attached:

1. `adb logcat -s MkOsmMap:V` with a debug build — the interceptor already logs
   `tile request intercepted`, `tile HTTP <code> from <host>`, `blocked map subresource`,
   `tile fetch failed` and every page console line. A blank map is explainable from those four
   lines alone: which request happened, what the server answered, and whether anything was
   blocked by our own rule.
2. Chrome DevTools on the WebView (`setWebContentsDebuggingEnabled` is on for debug builds) to see
   whether tiles arrived, and whether `L.map` exists.
3. Airplane-mode-on-cached-tiles, which is the test the disk cache makes meaningful.

Recording it as a step is better than pretending it was run: **this branch does not claim a device
verification it did not perform.**
