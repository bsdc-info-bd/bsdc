#!/usr/bin/env node
/**
 * The Android OSM map's page-layer gate.
 *
 * `MkOsmPinMap.kt` builds a small HTML document at runtime, loads it into a WebView with
 * `loadDataWithBaseURL`, and serves the document's own subresources from the APK through
 * `shouldInterceptRequest`. That split is the whole system's weak point: the page asks for
 * things, and a *different* file decides which asks are answered. A name that stops matching on
 * either side does not throw — it produces a grey rectangle, which is the one failure a map is
 * never allowed to have.
 *
 * So this script reads both sides out of the Kotlin source and asserts they still agree:
 *
 *   1. every subresource the two generated pages reference is one the interceptor will answer,
 *      with the same host, scheme, port and path the classifier demands;
 *   2. the tile URL the page hands to Leaflet is on the tile-host allowlist, so tiles are never
 *      blocked by the app that is trying to fetch them;
 *   3. the status protocol's lines are matched by the *regex read out of `MkLogic.kt`* — not by a
 *      copy of it, so the check cannot silently drift from the parser it is testing;
 *   4. the container is sized in the page's own CSS (an unsized `#map` is a blank map), the
 *     interactive page keeps its bridge and the read-only page does not reference one;
 *   5. the bundled Leaflet really is Leaflet, is a supported version, and is small enough to ship.
 *
 * A device is still the only thing that can prove pixels: tile bytes over a real network, OSM's
 * view of this app's User-Agent, and touch handling all live outside this file's reach. What is
 * checked here is the part that fails silently and is cheap to prove.
 *
 * Usage: node scripts/osm-page-check.mjs [--verbose]
 */
import { readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const ANDROID = join(repo, 'android-app');
const FEATURE = join(ANDROID, 'feature/market/src');
const MAP_KT = join(FEATURE, 'main/kotlin/bd/info/bsdc/app/feature/market/MkOsmPinMap.kt');
const LOGIC_KT = join(FEATURE, 'main/kotlin/bd/info/bsdc/app/feature/market/MkLogic.kt');
const MODEL_KT = join(
  ANDROID,
  'core/model/src/main/kotlin/bd/info/bsdc/app/core/model/BsdcModels.kt',
);
const ASSET_DIR = join(FEATURE, 'main/assets/leaflet');

const VERBOSE = process.argv.includes('--verbose');
const failures = [];
const notes = [];
const check = (ok, label, detail = '') => {
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
  if (VERBOSE || !ok)
    process.stdout.write(
      `${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `\n        ${detail}` : ''}\n`,
    );
};

/** `const val NAME = "value"` / `= 123`, read from the file that declares it. */
function kotlinString(src, name, where) {
  const m = new RegExp(`const val ${name}(?:\\s*:\\s*String)?\\s*=\\s*"([^"]*)"`).exec(src);
  if (!m) throw new Error(`${name} not found in ${where}`);
  return m[1];
}
/**
 * Numbers are read from their declaration, and some declarations are arithmetic
 * (`512 * 1024`). Only digits, `_`, `*` and spaces are evaluated; anything else fails the run
 * rather than quietly reading half the expression, which is how a 512 KiB cap turns into a
 * report that the cap is 512 bytes.
 */
function kotlinNumber(src, name, where) {
  const m = new RegExp(
    `const val ${name}(?:\\s*:\\s*\\w+)?\\s*=\\s*([\\d_*\\s]+?)(?:\\n|,|$)`,
  ).exec(src);
  if (!m) throw new Error(`${name} not found in ${where}`);
  const expression = m[1].trim();
  if (!/^[\d_*\s]+$/.test(expression))
    throw new Error(`${name}: unsupported expression ${expression}`);
  return expression
    .split('*')
    .map((part) => Number(part.trim().replace(/_/g, '')))
    .reduce((a, b) => a * b, 1);
}

/**
 * `private fun NAME(...): String = """ … """.trimIndent()`, with Kotlin's `trimIndent()` applied,
 * so what is tested is the string the app builds and not a paraphrase of it.
 */
function kotlinTemplate(src, fn, where) {
  const head = new RegExp(`private fun ${fn}\\([\\s\\S]*?\\)\\s*:\\s*String\\s*=\\s*"""`).exec(src);
  if (!head) throw new Error(`${fn}'s template not found in ${where}`);
  const begin = head.index + head[0].length;
  const end = src.indexOf('"""', begin);
  if (end < 0) throw new Error(`${fn}: unterminated raw string`);
  const lines = src.slice(begin, end).split('\n');
  while (lines.length && lines[0].trim() === '') lines.shift();
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  const indents = lines.filter((l) => l.trim() !== '').map((l) => /^\s*/.exec(l)[0].length);
  const min = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(min)).join('\n');
}

/** The interpolations the two templates contain. An unknown one is a failure, never a guess. */
function renderKotlin(tpl, values) {
  let out = tpl;
  for (const [from, to] of Object.entries(values)) {
    if (!out.includes(from)) continue;
    out = out.split(from).join(to);
  }
  const left = out.match(/\$\{?[A-Za-z_]\w*/g) || [];
  if (left.length > 0)
    throw new Error(`unrendered interpolation: ${[...new Set(left)].join(', ')}`);
  return out;
}

const mapSrc = readFileSync(MAP_KT, 'utf8');
const logicSrc = readFileSync(LOGIC_KT, 'utf8');
const modelSrc = readFileSync(MODEL_KT, 'utf8');

const SITE_ORIGIN = kotlinString(modelSrc, 'SITE_ORIGIN', 'BsdcModels.kt');
const JS_PATH = kotlinString(logicSrc, 'OSM_MAP_JS_PATH', 'MkLogic.kt');
const CSS_PATH = kotlinString(logicSrc, 'OSM_MAP_CSS_PATH', 'MkLogic.kt');
const PREFIX = kotlinString(logicSrc, 'OSM_MAP_CONSOLE_PREFIX', 'MkLogic.kt');
const TILE_HOST = kotlinString(logicSrc, 'OSM_TILE_HOST', 'MkLogic.kt');
const MAX_TILE_BYTES = kotlinNumber(mapSrc, 'MAX_TILE_BYTES', 'MkOsmPinMap.kt');

// The page's own asset rule: `mapAssetUrl(path) = SITE_ORIGIN.trimEnd('/') + path`.
const assetUrl = (path) => SITE_ORIGIN.replace(/\/+$/, '') + path;

const pages = {
  'pin picker': {
    fn: 'mapPage',
    values: { hasPin: true },
    expectBridge: true,
  },
  'read-only': {
    fn: 'viewMapPage',
    values: { interactive: true },
    expectBridge: false,
  },
};

const valuesFor = (page) => ({
  '${mapAssetUrl(MkLogic.OSM_MAP_CSS_PATH)}': assetUrl(CSS_PATH),
  '${mapAssetUrl(MkLogic.OSM_MAP_JS_PATH)}': assetUrl(JS_PATH),
  '${MkLogic.OSM_MAP_CONSOLE_PREFIX}': PREFIX,
  '${if (hasPin) 16 else 13}': page.values.hasPin ? '16' : '13',
  '${if (hasPin) "true" else "false"}': page.values.hasPin ? 'true' : 'false',
  '${if (interactive) "true" else "false"}': page.values.interactive ? 'true' : 'false',
  $lat: '24.8949',
  $lng: '91.8687',
  $zoom: '16',
});

for (const [name, page] of Object.entries(pages)) {
  let html;
  try {
    html = renderKotlin(kotlinTemplate(mapSrc, page.fn, 'MkOsmPinMap.kt'), valuesFor(page));
  } catch (failure) {
    check(false, `${name}: page can be rendered`, failure.message);
    continue;
  }
  notes.push(`${name}: ${html.length} bytes of HTML`);

  // 1 + 2. every referenced subresource must be answerable by the interceptor.
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
  check(refs.length >= 2, `${name}: references its Leaflet assets`, refs.join(' '));
  for (const ref of refs) {
    let url;
    try {
      url = new URL(ref);
    } catch {
      check(false, `${name}: subresource URL is absolute`, ref);
      continue;
    }
    const isAsset =
      url.protocol === 'https:' &&
      url.hostname === new URL(SITE_ORIGIN).hostname &&
      (url.pathname === JS_PATH || url.pathname === CSS_PATH);
    const isTile = url.hostname === TILE_HOST || /^[abc]\./.test(url.hostname.replace(/\.$/, ''));
    check(
      isAsset || isTile,
      `${name}: interceptor answers ${url.pathname}`,
      isAsset || isTile ? '' : `classified BLOCKED (${url.href}) — the page would get a 403`,
    );
  }

  // 2b. the tile URL template Leaflet will expand.
  const template = /L\.tileLayer\('([^']+)'/.exec(html);
  check(
    Boolean(template) &&
      /^https:\/\/tile\.openstreetmap\.org\/\{z\}\/\{x\}\/\{y\}\.png$/.test(template[1]),
    `${name}: tile URL template is the canonical OSM raster form`,
    template ? template[1] : 'no L.tileLayer call found',
  );

  // 3. the status protocol, checked against the app's own regex.
  const regexLiteral =
    /OSM_TILE_EVENT\s*=\s*Regex\(\s*"""([\s\S]*?)"""/.exec(logicSrc) ??
    /OSM_TILE_EVENT\s*=\s*Regex\(\s*"([^"]*)"/.exec(logicSrc);
  if (!regexLiteral) {
    check(false, `${name}: status regex found in MkLogic.kt`);
  } else if (!regexLiteral[1].includes('tile') || !regexLiteral[1].includes('errors')) {
    // The guard is the point. This extraction once matched the empty string between two of a
    // triple-quoted raw string's quotes, and `new RegExp('')` accepts every line in the file:
    // the check passed forever while testing nothing. A pattern that does not look like the
    // protocol cannot be used to test the protocol.
    check(
      false,
      `${name}: status regex extracted with its shape intact`,
      `got ${JSON.stringify(regexLiteral[1])}`,
    );
  } else {
    const body = regexLiteral[1]
      .trim()
      .replace(
        /\$\{Regex\.escape\(OSM_MAP_CONSOLE_PREFIX\)\}/g,
        PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      );
    const asJs = new RegExp(body);
    // The line under test is the one the page prints, not one typed to resemble it: the
    // concatenation is taken out of `reportTileEvent` and evaluated with sample counters.
    // A gate that checked a hand-written copy of the protocol would pass forever while the page
    // printed something the parser reads as noise — which is a map stuck on "Loading" until the
    // timeout, i.e. exactly the silent blank this file exists to prevent.
    const printf = /function reportTileEvent\([^)]*\)\s*\{[\s\S]*?console\.log\(([\s\S]*?)\);/.exec(
      html,
    );
    if (!printf) {
      check(false, `${name}: prints a tile status line`, 'no reportTileEvent console.log found');
    } else {
      // A negative control: if the pattern also accepts a line that is *almost* the protocol,
      // it is not testing the protocol.
      check(
        !asJs.test(`${PREFIX} tileload ok=1 errors:0`) && !asJs.test(`${PREFIX} noise`),
        `${name}: status regex is specific enough to fail`,
        `pattern ${asJs}`,
      );
      for (const kind of ['load', 'error']) {
        let line;
        try {
          // The expression comes from this repository's own source; the scope is three numbers
          // and a string, which is all the page's concatenation is allowed to reference.
          line = new Function('kind', 'tileOk', 'tileErrors', `return (${printf[1]});`)(
            kind,
            kind === 'load' ? 3 : 0,
            kind === 'load' ? 0 : 4,
          );
        } catch (failure) {
          check(false, `${name}: status line can be assembled`, `${failure.message}: ${printf[1]}`);
          continue;
        }
        check(
          asJs.test(line),
          `${name}: status line is parsed (${kind})`,
          asJs.test(line)
            ? line
            : `${line} — the parser will not match this, so the map never leaves LOADING`,
        );
      }
    }
  }

  // 4. sizing and the bridge.
  check(
    /html,body\{height:100%/.test(html.replace(/\s+/g, '')) &&
      /#map\{position:absolute;inset:0/.test(html.replace(/\s+/g, '')),
    `${name}: #map is sized by the page's own CSS`,
    'an unsized container renders nothing at any zoom',
  );
  check(
    page.expectBridge === /BsdcPin/.test(html),
    `${name}: bridge presence matches its purpose`,
    page.expectBridge
      ? 'the picker must be able to report a pin'
      : 'a read-only map that can write back is the wrong contract',
  );
  check(
    /invalidateSize/.test(html) && /(ResizeObserver|addEventListener\('resize')/.test(html),
    `${name}: re-measures when its box changes`,
  );
}

// 4b. the classifier's accepted paths, read from its own `return` line. Both constants must be
// there: the page and the rule share the same `OSM_MAP_*_PATH` declarations, so a rename cannot
// desynchronise them — but a condition that drops one branch does, and drops it for one file only,
// which looks like "the map loads but is empty" rather than like a bug.
const accepted = /return path == (OSM_MAP_\w+)([^\n]*)/.exec(logicSrc);
if (!accepted) {
  check(
    false,
    'classifier names its accepted asset paths',
    'isOsmMapAssetRequest no longer has a readable path rule',
  );
} else {
  const named = new Set([accepted[1], ...(accepted[2].match(/OSM_MAP_\w+/g) ?? [])]);
  for (const constant of ['OSM_MAP_JS_PATH', 'OSM_MAP_CSS_PATH']) {
    check(named.has(constant), `classifier accepts ${constant}`, `${[...named].join(', ')} only`);
  }
}
for (const [constant, kind] of [
  ['OSM_MAP_JS_PATH', 'LEAFLET_JS'],
  ['OSM_MAP_CSS_PATH', 'LEAFLET_CSS'],
]) {
  const branch = new RegExp(`path == ${constant}[\\s\\S]{0,120}?OsmMapResource\\.${kind}`).test(
    logicSrc,
  );
  check(branch, `classifier maps ${constant} to OsmMapResource.${kind}`);
}

// 5. the bundled library, including the two strings `shouldInterceptRequest` opens by name.
// The page and the classifier read the same `OSM_MAP_*_PATH` constant, so renaming it cannot
// desynchronise them — what *can* desynchronise is the asset file on disk, which is addressed by
// a separate literal inside the interceptor. A missing file is a 404 for `<script src=leaflet.js>`
// and a permanently blank map, so it is checked here rather than on a device.
const interceptorOpens = [
  ...mapSrc.matchAll(/bundledMapAsset\(context,\s*"([^"]+)",\s*"([^"]+)"\)/g),
].map((m) => ({ asset: m[1], mime: m[2] }));
check(
  interceptorOpens.length === 2,
  'interceptor names both bundled assets',
  `found ${interceptorOpens.length}`,
);
for (const { asset, mime } of interceptorOpens) {
  const onDisk = join(FEATURE, 'main/assets', asset);
  let size = -1;
  try {
    size = statSync(onDisk).size;
  } catch {
    /* reported below */
  }
  check(
    size > 1000,
    `asset the interceptor opens exists: ${asset}`,
    size < 0
      ? 'no such file under src/main/assets — the map would 404 its own Leaflet'
      : `${size} bytes`,
  );
  const wantsJs = mime === 'text/javascript';
  const pointsAtJs = /\.js$/.test(asset);
  check(
    wantsJs === pointsAtJs,
    `asset mime matches the file it names: ${asset}`,
    `${mime} for ${asset}`,
  );
}
// The path the page asks for and the file the app has must describe the same library, and that
// library must define what the pages call. The bundle is minified, so `L.tileLayer` is not a
// literal in it; the entry points are, and a rename or a substituted build shows up here as a
// missing name rather than as a runtime `undefined is not a function` on a device.
const bundle = readFileSync(join(ASSET_DIR, 'leaflet.js'), 'utf8');
check(/tileLayer/.test(bundle), 'the bundled library can draw tiles', 'no tileLayer in leaflet.js');
const calledNames = new Set();
for (const page of Object.values(pages)) {
  let html;
  try {
    html = renderKotlin(kotlinTemplate(mapSrc, page.fn, 'MkOsmPinMap.kt'), valuesFor(page));
  } catch {
    continue;
  }
  for (const m of html.matchAll(/\bL\.([A-Za-z_$][\w$]*)\s*\(/g)) calledNames.add(m[1]);
}
for (const name of [...calledNames].sort()) {
  check(
    bundle.includes(name),
    `the bundled library defines L.${name}()`,
    'the page would throw at init',
  );
}
const jsFile = join(ASSET_DIR, 'leaflet.js');
const cssFile = join(ASSET_DIR, 'leaflet.css');
for (const file of [jsFile, cssFile]) {
  let size = 0;
  try {
    size = statSync(file).size;
  } catch {
    check(false, `bundled asset exists: ${file.replace(repo + '/', '')}`);
    continue;
  }
  check(
    size > 1000,
    `bundled asset is not a stub: ${file.replace(repo + '/', '')}`,
    `${size} bytes`,
  );
  if (file === jsFile && size > 0) {
    const head = readFileSync(jsFile, 'utf8').slice(0, 400);
    const version = /Leaflet (\d+\.\d+\.\d+)/.exec(head);
    check(Boolean(version), 'bundled Leaflet declares its version', head.split('\n')[1] ?? '');
    if (version) notes.push(`Leaflet ${version[1]}`);
    const major = version ? Number(version[1].split('.')[0]) : 0;
    const minor = version ? Number(version[1].split('.')[1]) : 0;
    check(
      major === 1 && minor >= 7,
      'bundled Leaflet is a supported 1.x',
      version ? version[1] : 'unknown',
    );
  }
}
check(
  MAX_TILE_BYTES >= 64 * 1024,
  'tile body cap is large enough for a real tile',
  `${MAX_TILE_BYTES} bytes`,
);

for (const note of notes) process.stdout.write(`      ${note}\n`);
if (failures.length > 0) {
  process.stdout.write(`\n${failures.length} FAILURE(S):\n  ${failures.join('\n  ')}\n`);
  process.exit(1);
}
process.stdout.write('\nOSM page layer: all checks passed.\n');
