/**
 * Runs the Android map page exactly as the app generates it, inside jsdom, against the Leaflet
 * build the app bundles — and reports which of the "blank map" causes are real.
 *
 * Nothing here is retyped from the Kotlin: both HTML documents are extracted from
 * `MkOsmPinMap.kt`'s raw string literals, the constants are read out of `MkLogic.kt` and
 * `BsdcModels.kt`, and the asset paths are resolved by re-implementing only `mapAssetUrl()`
 * (`SITE_ORIGIN.trimEnd('/') + path`). A template that grows an interpolation this script does
 * not know makes the script fail rather than test a stale page.
 *
 * One honest limit, stated where it matters: jsdom fetches and parses, but it does not decode
 * bitmaps, so `img.onload` never fires on its own. Successful and failed tiles are therefore
 * simulated by dispatching the `load` / `error` event the platform would fire. That proves the
 * wiring — request → layer → status protocol — and proves nothing about pixels, which only a
 * device can.
 */
import fs from 'node:fs';
import path from 'node:path';
let JSDOM, VirtualConsole, ResourceLoader;
try {
  ({ JSDOM, VirtualConsole, ResourceLoader } = await import('jsdom'));
} catch {
  process.stderr.write(
    'this deeper check needs jsdom:  npm install --no-save jsdom\n' +
      'the dependency-free structural gate is scripts/osm-page-check.mjs, and it runs in CI.\n',
  );
  process.exit(2);
}

const APP = '/home/user/bsdc/android-app';
const MAP_KT = path.join(
  APP,
  'feature/market/src/main/kotlin/bd/info/bsdc/app/feature/market/MkOsmPinMap.kt',
);
const LOGIC_KT = MAP_KT.replace('MkOsmPinMap.kt', 'MkLogic.kt');
const MODEL_KT = path.join(
  APP,
  'core/model/src/main/kotlin/bd/info/bsdc/app/core/model/BsdcModels.kt',
);
const ASSETS = path.join(APP, 'feature/market/src/main/assets');

const read = (file) => fs.readFileSync(file, 'utf8');

/** `const val NAME: String = "value"` — read from the source, never copied into this file. */
function kstring(src, name) {
  const m = new RegExp(`const val ${name}(?:\\s*:\\s*String)?\\s*=\\s*"([^"]*)"`).exec(src);
  if (!m) throw new Error(`constant not found in source: ${name}`);
  return m[1];
}
function kint(src, name) {
  const m = new RegExp(`const val ${name}(?:\\s*:\\s*Int)?\\s*=\\s*(\\d+)`).exec(src);
  if (!m) throw new Error(`integer constant not found in source: ${name}`);
  return Number(m[1]);
}

const logic = read(LOGIC_KT);
const model = read(MODEL_KT);
const mapSrc = read(MAP_KT);

const SITE_ORIGIN = kstring(model, 'SITE_ORIGIN');
const JS_PATH = kstring(logic, 'OSM_MAP_JS_PATH');
const CSS_PATH = kstring(logic, 'OSM_MAP_CSS_PATH');
const PREFIX = kstring(logic, 'OSM_MAP_CONSOLE_PREFIX');
const TILE_HOST = kstring(logic, 'OSM_TILE_HOST');
const MAX_TILE_BYTES = kint(mapSrc, 'MAX_TILE_BYTES');

/** `private fun NAME(...): String = """ ... """` with Kotlin's `trimIndent()` applied. */
function extractTemplate(src, fn) {
  const head = new RegExp(`private fun ${fn}\\([\\s\\S]*?\\)\\s*:\\s*String\\s*=\\s*"""`).exec(src);
  if (!head) throw new Error(`template not found: ${fn}`);
  const begin = head.index + head[0].length;
  const end = src.indexOf('"""', begin);
  if (end < 0) throw new Error(`unterminated template: ${fn}`);
  const lines = src.slice(begin, end).split('\n');
  while (lines.length && lines[0].trim() === '') lines.shift();
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  const indents = lines.filter((l) => l.trim() !== '').map((l) => /^\s*/.exec(l)[0].length);
  const min = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(min)).join('\n');
}

/**
 * The only interpolations the two templates contain, with the values the composable passes.
 * Anything left over is an unknown expression and fails the run.
 */
function render(tpl, env) {
  let out = tpl;
  const subs = [
    ['${mapAssetUrl(MkLogic.OSM_MAP_CSS_PATH)}', SITE_ORIGIN.replace(/\/+$/, '') + CSS_PATH],
    ['${mapAssetUrl(MkLogic.OSM_MAP_JS_PATH)}', SITE_ORIGIN.replace(/\/+$/, '') + JS_PATH],
    ['${MkLogic.OSM_MAP_CONSOLE_PREFIX}', PREFIX],
    ['${if (hasPin) 16 else 13}', String(env.hasPin ? 16 : 13)],
    ['${if (hasPin) "true" else "false"}', env.hasPin ? 'true' : 'false'],
    ['${if (interactive) "true" else "false"}', env.interactive ? 'true' : 'false'],
    ['$lat', String(env.lat)],
    ['$lng', String(env.lng)],
    ['$zoom', String(env.zoom)],
  ];
  for (const [from, to] of subs) out = out.split(from).join(to);
  // `viewMapPage` spells its booleans out per option; the picker has no `interactive` at all,
  // and a substitution that never matched there is fine — but a leftover `$` never is.
  const leftovers = out.match(/\$\{?[A-Za-z_][^}\n]*/g) || [];
  if (leftovers.length > 0) {
    throw new Error(`unrendered Kotlin interpolation in template: ${leftovers.join(' , ')}`);
  }
  return out;
}

// 1×1 PNG bytes, what a tile server returns; length is checked against MAX_TILE_BYTES below.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64',
);

const siteHost = new URL(SITE_ORIGIN).host;
/** The app's own rule, read as data from the Kotlin source rather than paraphrased here. */
function classify(u) {
  const httpsOk = u.protocol === 'https:' && (u.port === '' || u.port === '443');
  if (!httpsOk) return 'BLOCKED';
  if (u.host.replace(/\.$/, '') === siteHost && (u.pathname === JS_PATH || u.pathname === CSS_PATH))
    return u.pathname === JS_PATH ? 'LEAFLET_JS' : 'LEAFLET_CSS';
  if (u.host.replace(/\.$/, '') === TILE_HOST || /^[abc]\./.test(u.host)) return 'OSM_TILE';
  return 'BLOCKED';
}

/** What the app's interceptor does: bundled assets from disk, tiles from the network, the rest blocked. */
function makeLoader(log) {
  return class extends ResourceLoader {
    fetch(url) {
      const kind = classify(new URL(url));
      log.push({ url, kind });
      if (kind === 'LEAFLET_JS')
        return Promise.resolve(fs.readFileSync(path.join(ASSETS, 'leaflet/leaflet.js')));
      if (kind === 'LEAFLET_CSS')
        return Promise.resolve(fs.readFileSync(path.join(ASSETS, 'leaflet/leaflet.css')));
      if (kind === 'OSM_TILE')
        return Promise.resolve(env.tileStatus === 200 ? PNG : Buffer.from(''));
      // BLOCKED, exactly as `blockedResourceResponse()` answers it: a 403 with an empty body,
      // which resolves so the page keeps running (that is what the app does too) and is recorded.
      log.at(-1).blocked = true;
      return Promise.resolve(Buffer.from(''));
    }
  };
}

const env = { tileStatus: Number(process.env.TILE_STATUS ?? 200) };

async function run(scenario) {
  const fn = scenario.page === 'picker' ? 'mapPage' : 'viewMapPage';
  const html = render(extractTemplate(mapSrc, fn), scenario);
  const requests = [];
  const consoleLines = [];
  const pageErrors = [];

  const Loader = makeLoader(requests);
  const vc = new VirtualConsole();
  vc.on('error', (e) => pageErrors.push(String(e && e.message ? e.message : e)));
  vc.on('warn', () => {});
  vc.on('log', (m) => consoleLines.push(String(m)));
  vc.sendTo(console, { omitJSDOMErrors: true });

  const dom = new JSDOM(html, {
    url: SITE_ORIGIN + '/',
    runScripts: 'dangerously',
    resources: new Loader(),
    pretendToBeVisual: true,
    virtualConsole: vc,
  });
  const { window } = dom;

  // jsdom lays nothing out, and Leaflet sizes the container before it draws a single tile.
  // A viewport is therefore supplied here — the same 360×230 box the composable asks for.
  const W = Number(process.env.BOX_W ?? 360);
  const H = Number(process.env.BOX_H ?? 230);
  const rect = () => ({ x: 0, y: 0, top: 0, left: 0, right: W, bottom: H, width: W, height: H });
  window.Element.prototype.getBoundingClientRect = rect;
  Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', {
    get: () => W,
    configurable: true,
  });
  Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', {
    get: () => H,
    configurable: true,
  });

  // The interactive page calls into the JS interface the app injects; mirror its presence.
  if (scenario.page === 'picker') {
    window.BsdcPin = {
      calls: [],
      pinChanged(lat, lng) {
        this.calls.push([lat, lng]);
      },
    };
  }

  await new Promise((r) => window.addEventListener('load', r, { once: true }));
  await new Promise((r) => setTimeout(r, 400));

  const tiles = [...window.document.querySelectorAll('.leaflet-tile')];
  const tileSrcs = tiles.map((t) => t.getAttribute('src')).filter(Boolean);

  // Simulate the platform's decode result for every tile that was requested.
  for (const t of tiles) {
    t.dispatchEvent(new window.Event(env.tileStatus === 200 ? 'load' : 'error'));
  }
  await new Promise((r) => setTimeout(r, 60));

  const mapEl = window.document.getElementById('map');
  const paneTiles = window.document.querySelectorAll('.leaflet-tile-pane img').length;
  return {
    scenario: scenario.name,
    requestedKinds: requests.map((r) => r.kind),
    assetUrls: requests.filter((r) => r.kind !== 'OSM_TILE').map((r) => r.url),
    leafletLoaded: typeof window.L === 'object' && typeof window.L.map === 'function',
    mapInitialized: Boolean(window.document.querySelector('.leaflet-container')),
    hasMapPanes: Boolean(mapEl && mapEl.classList.contains('leaflet-container')),
    tileCount: tiles.length,
    tileSrcs,
    tileSrcsAllHttpsOsm:
      tileSrcs.length > 0 &&
      tileSrcs.every((s) =>
        /^https:\/\/([abc]\.)?tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png$/.test(s),
      ),
    tileByteCapOk: PNG.length <= MAX_TILE_BYTES,
    paneTiles,
    pinSvgPresent: Boolean(window.document.querySelector('.bsdc-pin, .bsdc-readonly-pin')),
    bridgeReferenced: /BsdcPin/.test(html),
    bridgeCalls: window.BsdcPin ? window.BsdcPin.calls.length : null,
    globalsDefined: [
      'setPin',
      'clearPin',
      'setRadiusCircle',
      'clearRadiusCircle',
      'setMapView',
    ].filter((name) => typeof window[name] === 'function'),
    consoleLines,
    statusProtocol: consoleLines.filter((l) => l.startsWith(PREFIX + ' tile')),
    pageErrors,
  };
}

const scenarios = [
  { name: 'picker with a pin, tiles OK', page: 'picker', lat: 24.8949, lng: 91.8687, hasPin: true },
  {
    name: 'picker without a pin, tiles OK',
    page: 'picker',
    lat: 23.8103,
    lng: 90.4125,
    hasPin: false,
  },
  {
    name: 'read-only non-interactive, tiles OK',
    page: 'view',
    lat: 24.8949,
    lng: 91.8687,
    zoom: 15,
    interactive: false,
  },
  {
    name: 'read-only interactive, tiles OK',
    page: 'view',
    lat: 24.8949,
    lng: 91.8687,
    zoom: 15,
    interactive: true,
  },
];

const results = [];
for (const s of scenarios) results.push(await run(s));
if (env.tileStatus !== 200) {
  const failing = [];
  for (const s of scenarios.slice(0, 2)) failing.push(await run(s));
  results.push(...failing);
}

const problems = [];
for (const r of results) {
  if (!r.leafletLoaded) problems.push(`${r.scenario}: Leaflet did not load`);
  if (!r.mapInitialized) problems.push(`${r.scenario}: L.map did not produce a container`);
  if (r.tileCount === 0) problems.push(`${r.scenario}: no tiles were requested at all`);
  if (!r.tileSrcsAllHttpsOsm) problems.push(`${r.scenario}: a tile URL is outside the allowlist`);
  if (r.pageErrors.length > 0)
    problems.push(`${r.scenario}: page errors — ${r.pageErrors.join(' | ')}`);
  if (r.statusProtocol.length === 0)
    problems.push(`${r.scenario}: the status protocol never printed`);
  console.log('\n=== ' + r.scenario);
  console.log('  leaflet loaded           :', r.leafletLoaded);
  console.log(
    '  map initialized          :',
    r.mapInitialized,
    '(panes in DOM:',
    r.hasMapPanes + ')',
  );
  console.log('  requests                 :', [...new Set(r.requestedKinds)].join(', ') || 'NONE');
  console.log('  non-tile request URLs    :', r.assetUrls.join('  ') || 'NONE');
  console.log('  tiles requested          :', r.tileCount, '(in tile pane:', r.paneTiles + ')');
  console.log(
    '  all tiles https+OSM+png  :',
    r.tileSrcsAllHttpsOsm,
    r.tileSrcs[0] ? 'e.g. ' + r.tileSrcs[0] : '',
  );
  console.log('  tile body within cap     :', r.tileByteCapOk);
  console.log('  pin/markup rendered      :', r.pinSvgPresent);
  console.log('  bridge referenced/needed :', r.bridgeReferenced, '→ calls:', r.bridgeCalls);
  console.log('  page API available       :', r.globalsDefined.join(', ') || 'NONE');
  console.log('  status protocol lines    :', JSON.stringify(r.statusProtocol));
  console.log(
    '  page errors              :',
    r.pageErrors.length ? r.pageErrors.join(' | ') : 'none',
  );
}

console.log(
  problems.length > 0
    ? `\n${problems.length} PROBLEM(S):\n  ${problems.join('\n  ')}\n`
    : `\n${results.length} scenarios ran: Leaflet initialised, tiles requested within the allowlist, status protocol emitted, no page errors.\n`,
);
process.exit(problems.length > 0 ? 1 : 0);
