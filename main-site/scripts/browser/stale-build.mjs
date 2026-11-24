#!/usr/bin/env node
/* global document */
/**
 * A visitor whose tab is open across a deploy.
 *
 * Reported from production as "every link on the home page shows 'Something
 * went wrong on this screen'". Nothing was wrong with the pages: a build gives
 * each route chunk a new content hash and `/assets/*` is immutable, so the
 * `index.html` in an open tab names chunks the new deployment deleted. The
 * click 404s and the router shows its error screen — and "Try again" retries
 * the same dead name, which is why reloading never helped.
 *
 * This test builds two real deployments that differ properly (a route chunk
 * gets different bytes, so its hash changes), serves the first, loads it,
 * swaps the server to the second and then clicks — exactly the sequence that
 * broke. The page must open, and the tab must keep working afterwards.
 *
 * Run: npm run test:stale-build (build first: `npm run build`).
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import bundled from '@sparticuz/chromium';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliDecompressSync } from 'node:zlib';
import { serveBuild } from './server.mjs';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = resolve(process.env.BROWSER_REPORT_DIR ?? join(root, '.browser-evidence'));
await mkdir(output, { recursive: true });

let libraryPath = process.env.LD_LIBRARY_PATH ?? '';
if (!process.env.CHROMIUM_EXECUTABLE_PATH && process.platform === 'linux') {
  const bin = resolve(dirname(require.resolve('@sparticuz/chromium')), '../bin');
  const target = await mkdtemp(join(tmpdir(), 'bsdc-browser-libs-'));
  const tar = join(target, 'libs.tar');
  await writeFile(tar, brotliDecompressSync(await readFile(join(bin, 'al2023.tar.br'))));
  assert.equal(spawnSync('tar', ['-xf', tar, '-C', target]).status, 0, 'Extract browser libraries');
  libraryPath = `${target}/lib:${libraryPath}`;
}

const BOUNDARY = 'Something went wrong on this screen';
const STALE_COPY = 'This page needs a fresh copy';
const results = [];

async function check(name, fn) {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, error: message });
    console.log(`FAIL ${name} — ${message.split('\n')[0]}`);
    process.exitCode = 1;
  }
}

const source = join(root, 'dist');
const deployment = await mkdtemp(join(tmpdir(), 'bsdc-deploy-'));
const buildA = join(deployment, 'a');
const buildB = join(deployment, 'b');
const live = join(deployment, 'live');

// Build B is a genuinely different deployment: one route's component changes,
// so its chunk gets different bytes and therefore a different hashed name. A
// marker in the markup makes the two builds tellable apart from the browser.
async function secondBuild() {
  const route = join(root, 'src/routes/AboutPage.tsx');
  const original = await readFile(route, 'utf8');
  const marker = '<article className="fab-container py-6 sm:py-10" data-build="second">';
  const patched = original.replace(
    '<article className="fab-container py-6 sm:py-10">',
    marker,
  );
  assert.notEqual(patched, original, 'AboutPage has the container the test patches');
  try {
    await writeFile(route, patched);
    const built = spawnSync('npm', ['run', 'build'], {
      cwd: root,
      env: process.env,
      encoding: 'utf8',
    });
    assert.equal(built.status, 0, `second build succeeds: ${(built.stderr ?? '').slice(-400)}`);
    await cp(join(root, 'dist'), buildB, { recursive: true });
  } finally {
    await writeFile(route, original);
  }
}

await cp(source, buildA, { recursive: true });
await secondBuild();

const chunksOf = async (build) => (await readdir(join(build, 'assets'))).filter((n) => /^AboutPage-.*\.js$/.test(n));
const [oldChunk] = await chunksOf(buildA);
const [newChunk] = await chunksOf(buildB);
assert.ok(oldChunk, 'build A has an AboutPage chunk');
assert.notEqual(oldChunk, newChunk, 'the deploy renames the AboutPage chunk');

const redeploy = async () => {
  await rm(live, { recursive: true, force: true });
  await cp(buildA, live, { recursive: true });
};
await redeploy();
const server = await serveBuild(live);

let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH ?? (await bundled.executablePath()),
    args: bundled.args.filter(
      (arg) =>
        !arg.includes('disable-web-security') &&
        !arg.includes('allow-running-insecure-content') &&
        !arg.includes('disable-site-isolation-trials'),
    ),
    env: { ...process.env, LD_LIBRARY_PATH: libraryPath },
    headless: true,
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const missing = [];
  page.on('response', (response) => {
    if (response.url().includes('/assets/') && response.status() === 404) {
      missing.push(response.url().split('/').pop());
    }
  });

  /** Load build A, swap the deployment to B, then click — twice, to prove recovery holds. */
  const clickAcrossDeploy = async (path) => {
    await redeploy();
    await page.goto(server.origin + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_200);
    await rm(live, { recursive: true, force: true });
    await cp(buildB, live, { recursive: true });
    missing.length = 0;
    await page.locator(`a[href="${path}"]:visible`).first().click();
    await page.waitForTimeout(3_000);
    const text = await page.evaluate(() => document.body.innerText ?? '');
    assert.ok(!text.includes(BOUNDARY), `no error screen after clicking ${path}`);
    assert.ok(!text.includes(STALE_COPY), `no "stale copy" screen after clicking ${path}`);
    assert.equal(
      new URL(page.url()).pathname,
      path,
      `the visitor lands on ${path}, not somewhere else`,
    );
    assert.ok(missing.length > 0, `the click really did ask for chunks the deploy had removed`);
  };

  await check('a click made across a deploy opens the page', async () => {
    await clickAcrossDeploy('/about');
    const markup = await page.evaluate(() => document.querySelector('[data-build]')?.getAttribute('data-build') ?? '');
    assert.equal(markup, 'second', 'the page came from the new build, not the old cached one');
  });

  await check('the recovered tab keeps working for what follows', async () => {
    await page.locator('a[href="/contact"]:visible').first().click();
    await page.waitForTimeout(1_500);
    const text = await page.evaluate(() => document.body.innerText ?? '');
    assert.ok(!text.includes(BOUNDARY), 'no error screen on the next click');
    assert.equal(new URL(page.url()).pathname, '/contact', 'the next click opens /contact');
  });

  await check('a second deploy is survived the same way', async () => {
    await clickAcrossDeploy('/jobs');
  });

  await page.screenshot({ path: join(output, 'stale-build.png') });
} finally {
  await browser?.close();
  await server.close();
  await rm(deployment, { recursive: true, force: true });
}

const failed = results.filter((result) => !result.passed);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
if (failed.length > 0) process.exitCode = 1;
