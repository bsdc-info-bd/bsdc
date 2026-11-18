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
 * default) and the **median** is what must clear the floor. A route whose
 * median misses is a failure; a single slow sample is reported and not.
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
const RUNS = Number(flag('runs', '3'));
const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'];
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

  const chrome = await launch({
    chromePath: process.env.CHROME_PATH || undefined,
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const { server, port } = await serve();
  const origin = `http://127.0.0.1:${port}`;
  const failures = [];
  const rows = [];

  try {
    for (const route of ROUTES) {
      const samples = { performance: [], accessibility: [], 'best-practices': [], seo: [] };
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
      }
      const medians = Object.fromEntries(CATEGORIES.map((c) => [c, median(samples[c])]));
      const below = CATEGORIES.filter((c) => medians[c] < FLOOR);
      rows.push({ route, medians, samples, below });
      if (below.length > 0) failures.push({ route, below, medians });
      process.stdout.write(
        `${route.padEnd(20)} ${CATEGORIES.map((c) => `${c.slice(0, 4)} ${medians[c]}`).join('  ')}${
          below.length > 0 ? `   ← below ${FLOOR}: ${below.join(', ')}` : ''
        }\n`,
      );
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
    process.stdout.write(
      `  ${failure.route}: ${failure.below.map((c) => `${c} ${failure.medians[c]}`).join(', ')}\n`,
    );
  }
  process.exitCode = 1;
}

await main();
