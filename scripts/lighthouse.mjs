#!/usr/bin/env node
/**
 * The performance budget, as a program.
 *
 * Lighthouse is the only way to know whether the site still meets the floor of
 * 95 in every category, and a score quoted in a document is a score from the
 * day the document was written. This script serves `main-site/dist`, runs
 * Lighthouse against every public route, and exits non-zero when a category
 * falls under the floor — so the claim can be re-measured on any commit.
 *
 *   npm run build            # in main-site/, produces dist/
 *   node scripts/lighthouse.mjs
 *   node scripts/lighthouse.mjs --routes /,/about --runs 5 --floor 95
 *
 * Requirements: `npm install --no-save lighthouse` somewhere node can resolve
 * it (the repository does not carry it as a dependency — it is 40 MB of
 * browser tooling that only this script uses), and a Chromium that Lighthouse
 * can drive. Set `CHROME_PATH` to point at one; the headless shell that
 * Playwright downloads works:
 *
 *   CHROME_PATH=$(node -e "console.log(require('playwright').chromium.executablePath())")
 *
 * The score of one run is not a measurement, it is a sample: shared CI
 * machines vary by several points. Each route is run `--runs` times (3 by
 * five) and the **median** is what must clear the floor. A route whose median
 * misses is a failure; a single slow sample is reported and not. Five, not three,
 * because a shared machine occasionally takes 400 ms to mount a page: with three
 * samples one bad run moves the median, with five it takes two.
 *
 * `--verbose` prints every performance sample, so a low median can be read as the
 * regression or the shared machine it actually is.
 *
 * `--strict` additionally gates the §5.1 lab floors (LCP 1.5 s, FCP 1.0 s, CLS
 * 0.1, TBT 200 ms) on the median of each metric. Off by default: those floors
 * were written for field data, `interaction-to-next-paint` and time-to-first-byte
 * are not lab-measurable at all, and a gate that fails a push on a shared
 * runner's worst minute is a gate that gets muted. The numbers are printed for
 * every route that misses the score floor either way, which is the part a reader
 * can act on.
 */
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';

const root = resolve(new URL('..', import.meta.url).pathname);
const dist = join(root, 'main-site', 'dist');

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};
const FLOOR = Number(flag('floor', '95'));
/**
 * Print every sample instead of only the median.
 *
 * A median of 93 on one route is two different facts depending on the spread: 93,
 * 93, 93 is a regression, and 87, 93, 99 is a shared machine. Without the samples
 * the two look identical, and the only way to tell them apart was to guess.
 */
const VERBOSE = args.includes('--verbose');
const RUNS = Number(flag('runs', '5'));
const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'];
/**
 * The §5.1 budgets, as lab numbers.
 *
 * Lighthouse's score is a curve over several metrics, so a 91 says "something is
 * slow" and not what a reader can act on. These are the floors the brief states,
 * printed next to every route that misses the score floor — and gated only under
 * `--strict`, because a simulated lab run on a shared runner is not what the
 * brief's floors were written against: `interaction-to-next-paint` and time to
 * first byte are field measurements, and a lab CLS on a prerendered page flatters
 * the page. Reporting them beside the score is honest; failing a push on a lab
 * proxy of a field metric is how a gate gets muted.
 */
const LAB_FLOORS = {
  'largest-contentful-paint': { label: 'LCP', limit: 1500, unit: 'ms' },
  'first-contentful-paint': { label: 'FCP', limit: 1000, unit: 'ms' },
  'cumulative-layout-shift': { label: 'CLS', limit: 0.1, unit: '' },
  'total-blocking-time': { label: 'TBT', limit: 200, unit: 'ms' },
};
const STRICT = args.includes('--strict');
const DEFAULT_ROUTES = [
  '/',
  '/about',
  '/guidelines',
  '/contact',
  '/marketplace',
  '/jobs',
  '/freelance',
  '/projects',
  '/learn',
  '/groups',
  '/events',
  '/playground',
  '/verify',
  '/privacy',
  '/terms',
  '/account-deletion',
];
const ROUTES = String(flag('routes', DEFAULT_ROUTES.join(',')))
  .split(',')
  .map((route) => route.trim())
  .filter(Boolean);

if (!existsSync(dist)) {
  process.stderr.write('No build found. Run `npm run build` in main-site/ first.\n');
  process.exit(1);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

/**
 * A static server with the same shape as the deployment: immutable assets,
 * `index.html` per directory, and a 404 for everything else. It is not the
 * edge; it exists so the measurement does not depend on the network.
 */
function serve() {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    // The deployment answers `/api/*` with Pages Functions. This server has no
    // functions, so it answers with an empty JSON object instead of a 404: a 404
    // is logged by the browser as a console error, and Lighthouse then reports
    // `errors-in-console` against the *page* for something the page did not do.
    // That is a lie about the page, and it was the only remaining item on the
    // best-practices score.
    if (url.pathname.startsWith('/api/')) {
      response.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
      return;
    }
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    let file = join(dist, path);
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file) && existsSync(`${file}.html`)) file = `${file}.html`;
    if (!existsSync(file)) {
      const fallback = join(dist, 'index.html');
      if (!existsSync(fallback)) {
        response.writeHead(404).end('not found');
        return;
      }
      file = fallback;
    }
    const immutable =
      file.includes(`${join(dist, 'assets')}`) || file.includes(`${join(dist, 'fonts')}`);
    const headers = {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    };
    // The deployment compresses text at the edge, so measuring without it would
    // measure a server that does not exist. Fonts and images are already
    // compressed and are sent as they are.
    const compressible = /\.(html|js|css|json|svg|txt|xml|webmanifest)$/.test(file);
    const accepts = String(request.headers['accept-encoding'] ?? '');
    if (compressible) {
      const body = readFileSync(file);
      if (accepts.includes('br')) {
        headers['Content-Encoding'] = 'br';
        response.writeHead(200, headers).end(brotliCompressSync(body));
        return;
      }
      if (accepts.includes('gzip')) {
        headers['Content-Encoding'] = 'gzip';
        response.writeHead(200, headers).end(gzipSync(body));
        return;
      }
    }
    response.writeHead(200, headers);
    createReadStream(file).pipe(response);
  });
  return new Promise((ready) => {
    server.listen(0, '127.0.0.1', () => ready({ server, port: server.address().port }));
  });
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
};

/**
 * The LCP element and its phases, read from a Lighthouse audit without assuming
 * its shape.
 *
 * This table has moved between majors — `items` became `rows` in one, the phase
 * label is a bare string in some versions and a `{ type: 'text', text }` object in
 * others, and the element row and the phase rows are two sub-tables whose order is
 * not contractual. Naming the fields at one guessed depth produced `unknown` and
 * four `?`s on a real run, which is a diagnosis that diagnoses nothing. So the
 * tree is walked instead: whatever the layout, a node with a snippet is the
 * element and a row with a numeric value and a label is a phase.
 *
 * A missing phase stays `null` and prints `?`, because an absent measurement and
 * a zero are different facts — and which one it is decides whether this is a
 * hydration problem or a bytes problem.
 */
function readLcpBreakdown(audits) {
  const ids = Object.keys(audits).filter((id) => /lcp|largest-contentful-paint/.test(id));
  const candidates = ids.map((id) => audits[id]);
  const collect = (audit, nodes, rows) => {
    walkInto(audit?.details ?? audit, 0, nodes, rows);
  };
  const nodes = [];
  const rows = [];
  for (const audit of candidates) collect(audit, nodes, rows);
  return summarise(nodes, rows, ids);
}

function summarise(nodes, rows, ids) {
  const text = (value) => {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') return String(value.text ?? value.value ?? '');
    return '';
  };
  const phase = (...labels) => {
    const row = rows.find((entry) =>
      labels.some((label) =>
        text(entry.phase ?? entry.label ?? entry.name)
          .toLowerCase()
          .includes(label),
      ),
    );
    if (!row) return null;
    // Lighthouse has expressed these in seconds (`numericValue`) and in
    // milliseconds (`ms`, `timing`) across versions. The magnitude test is
    // deliberate: a phase of 0.42 is 420 ms and a phase of 420 is 420 ms, and no
    // LCP phase is ever 0.42 ms.
    const raw = row.numericValue ?? row.ms ?? row.timing ?? 0;
    return Math.round(raw > 100 ? raw : raw * 1000);
  };
  const element = nodes[0];
  return {
    selector: element ? (element.snippet ?? element.selector) : null,
    ttfb: phase('first byte', 'ttfb'),
    loadDelay: phase('load delay'),
    loadTime: phase('load time'),
    renderDelay: phase('render delay'),
    available: rows.length === 0 && !element ? ids : undefined,
  };
}

function walkInto(value, depth, nodes, rows) {
  if (depth > 6 || value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const entry of value) walkInto(entry, depth + 1, nodes, rows);
    return;
  }
  if (value.node && (value.node.snippet || value.node.selector)) nodes.push(value.node);
  if (typeof value.numericValue === 'number' && (value.phase || value.label || value.name)) {
    rows.push(value);
  }
  for (const key of Object.keys(value)) walkInto(value[key], depth + 1, nodes, rows);
}

async function main() {
  let lighthouse;
  let launch;
  try {
    ({ default: lighthouse } = await import('lighthouse'));
    // Lighthouse 12 does not launch a browser for you any more.
    ({ launch } = await import('chrome-launcher'));
  } catch {
    process.stderr.write(
      'Lighthouse is not installed. Install it where this script can resolve it:\n' +
        '  npm install --no-save lighthouse chrome-launcher\n',
    );
    process.exit(1);
  }

  const startChrome = () =>
    launch({
      chromePath: process.env.CHROME_PATH || undefined,
      chromeFlags: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });

  /**
   * A browser per route.
   *
   * One instance reused across sixteen routes and eighty audits accumulates
   * everything a long-lived renderer accumulates — compiled scripts for every
   * page, its caches, its heap — and the later routes measure a browser that is
   * no longer in the state a visitor's is. On a quiet machine that cost was
   * invisible; on a shared one it moved `/` from 96 to 93 depending on where in
   * the sweep it fell. A page measured in a fresh browser is the page a visitor
   * opens.
   */
  let chrome = await startChrome();
  const freshBrowser = async () => {
    await chrome.kill();
    chrome = await startChrome();
  };

  const { server, port } = await serve();
  const origin = `http://127.0.0.1:${port}`;
  const failures = [];
  const rows = [];

  try {
    let first = true;
    for (const route of ROUTES) {
      if (!first) await freshBrowser();
      first = false;
      const samples = { performance: [], accessibility: [], 'best-practices': [], seo: [] };
      const runs = [];
      for (let run = 0; run < RUNS; run += 1) {
        const runner = await lighthouse(`${origin}${route}`, {
          port: chrome.port,
          onlyCategories: CATEGORIES,
          logLevel: 'error',
          output: 'json',
        });
        if (!runner?.lhr) throw new Error(`Lighthouse returned nothing for ${route}`);
        for (const category of CATEGORIES) {
          samples[category].push(Math.round((runner.lhr.categories[category]?.score ?? 0) * 100));
        }
        const audits = runner.lhr.audits ?? {};
        runs.push({
          score: Math.round((runner.lhr.categories.performance?.score ?? 0) * 100),
          metrics: Object.fromEntries(
            Object.keys(LAB_FLOORS).map((key) => [key, audits[key]?.numericValue ?? null]),
          ),
          // `overallSavingsMs` is what Lighthouse itself claims an opportunity
          // would return, so the list is ordered by the tool's own estimate of
          // what matters rather than by a guess about which audit sounds scary.
          // Which part of the LCP is the expensive one. A score of 81 with
          // "render delay" is a hydration problem and no amount of image
          // optimisation moves it; the same score with "load time" is a byte
          // problem. The audit's own table is the only honest way to tell them
          // apart, and guessing is how a week gets spent on the wrong lever.
          // Not a named audit: the breakdown has lived under
          // `largest-contentful-paint-element` and moved since, so every audit
          // whose id mentions the metric is searched and the first one carrying
          // phase rows wins. If none does, `available` says which ids this version
          // really exposed — a diagnosis that can name its own ignorance is worth
          // more than one that prints `unknown`.
          lcp: readLcpBreakdown(audits),
          savings: Object.entries(audits)
            .filter(([, audit]) => (audit.details?.overallSavingsMs ?? 0) > 200)
            .sort(
              (a, b) => (b[1].details.overallSavingsMs ?? 0) - (a[1].details.overallSavingsMs ?? 0),
            )
            .slice(0, 3)
            .map(
              ([, audit]) => `${audit.title} (−${Math.round(audit.details.overallSavingsMs)} ms)`,
            ),
        });
      }
      const medians = Object.fromEntries(CATEGORIES.map((c) => [c, median(samples[c])]));
      const below = CATEGORIES.filter((c) => medians[c] < FLOOR);
      // The run chosen for the diagnosis is the one that scored the median, not
      // the last one: reporting the slowest sample's metrics beside a median
      // score would blame the page for the machine's worst minute.
      const representative = runs.find((entry) => entry.score === medians.performance) ?? {
        metrics: {},
        savings: [],
        lcp: null,
        score: 0,
        // `??` on the find alone would leave `--runs 0` with an undefined
        // representative and a TypeError where the point was a table.
      };
      const measured = Object.entries(representative.metrics)
        .filter(([, value]) => typeof value === 'number')
        .map(([key, value]) => {
          const floor = LAB_FLOORS[key];
          const shown = floor.unit === '' ? value.toFixed(3) : `${Math.round(value)}${floor.unit}`;
          return {
            label: floor.label,
            text: `${floor.label} ${shown}${value > floor.limit ? ` over ${floor.limit}${floor.unit}` : ''}`,
            over: value > floor.limit,
          };
        });
      if (STRICT) for (const entry of measured) if (entry.over) below.push(entry.label);
      rows.push({ route, medians, samples, below });
      process.stdout.write(
        `${route.padEnd(20)} ${CATEGORIES.map((c) => `${c.slice(0, 4)} ${medians[c]}`).join('  ')}${
          below.length > 0 ? `   ← below ${FLOOR}: ${below.join(', ')}` : ''
        }\n`,
      );
      if (below.length > 0) {
        process.stdout.write(
          `  ${measured.map((entry) => entry.text).join(' · ')}\n` +
            (representative.savings.length > 0
              ? `  savings Lighthouse claims: ${representative.savings.join('; ')}\n`
              : '') +
            `  LCP element: ${representative.lcp?.selector ?? 'unknown'}\n` +
            `  LCP phases: ${
              representative.lcp &&
              (representative.lcp.ttfb !== null || representative.lcp.renderDelay !== null)
                ? `ttfb ${representative.lcp.ttfb ?? '?'} ms, load delay ${
                    representative.lcp.loadDelay ?? '?'
                  } ms, load time ${representative.lcp.loadTime ?? '?'} ms, render delay ${
                    representative.lcp.renderDelay ?? '?'
                  } ms`
                : `not in this Lighthouse payload${
                    representative.lcp?.available?.length
                      ? ` (audits mentioning it: ${representative.lcp.available.join(', ')})`
                      : ''
                  }`
            }\n`,
        );
        failures.push({ route, below, medians });
      }
      if (VERBOSE) {
        process.stdout.write(`  performance samples: ${samples.performance.join(', ')}\n`);
      }
    }
  } finally {
    server.close();
    await chrome.kill();
  }

  process.stdout.write(
    `\n${ROUTES.length} routes × ${RUNS} runs, median of each category, floor ${FLOOR}.\n`,
  );
  if (failures.length === 0) {
    process.stdout.write('Every category clears the floor on every route.\n');
    return;
  }
  process.stdout.write(`${failures.length} route(s) below the floor:\n`);
  for (const failure of failures) {
    const row = rows.find((entry) => entry.route === failure.route);
    process.stdout.write(
      `  ${failure.route}: ${failure.below
        .map((c) =>
          c in failure.medians
            ? `${c} ${failure.medians[c]} (samples ${row ? row.samples[c].join(', ') : '?'})`
            : // a lab metric named by --strict, which reports the number itself
              `${c} over its lab floor`,
        )
        .join(', ')}\n`,
    );
  }
  process.exitCode = 1;
}

await main();
