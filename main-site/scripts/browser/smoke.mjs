#!/usr/bin/env node
/* global document, innerWidth */
import assert from 'node:assert/strict';
import { chromium, devices } from 'playwright-core';
import bundled from '@sparticuz/chromium';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { brotliDecompressSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { serveBuild } from './server.mjs';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = resolve(process.env.BROWSER_REPORT_DIR ?? join(root, '.browser-evidence'));
await mkdir(output, { recursive: true });
let libraryPath = process.env.LD_LIBRARY_PATH ?? '';
if (!process.env.CHROMIUM_EXECUTABLE_PATH && process.platform === 'linux') {
  const bin = resolve(dirname(require.resolve('@sparticuz/chromium')), '../bin');
  const target = join(tmpdir(), 'bsdc-browser-libs');
  await mkdir(target, { recursive: true });
  const tar = join(target, 'libs.tar');
  await writeFile(tar, brotliDecompressSync(await readFile(join(bin, 'al2023.tar.br'))));
  assert.equal(
    spawnSync('tar', ['-xf', tar, '-C', target]).status,
    0,
    'Extract bundled browser libraries',
  );
  libraryPath = `${target}/lib:${libraryPath}`;
}
const server = await serveBuild(join(root, 'dist'));
const results = [];
let browser;
let activePage;
/**
 * One check failing must not hide the rest.
 *
 * This file used to let a failed assertion unwind the whole run: the first
 * broken page stopped the other twenty-three, so a report said "24 passed" and
 * one error, and the reader could not tell a single regression from a broken
 * gate. Each check now records its own outcome, the run finishes, and the exit
 * code is non-zero if anything failed.
 */
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
async function launch() {
  return chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH ?? (await bundled.executablePath()),
    // Keep SOP and CSP enabled. Never use Sparticuz's disable-web-security flag.
    args: bundled.args.filter(
      (arg) =>
        !arg.includes('disable-web-security') &&
        !arg.includes('allow-running-insecure-content') &&
        !arg.includes('disable-site-isolation-trials'),
    ),
    env: { ...process.env, LD_LIBRARY_PATH: libraryPath },
    headless: true,
  });
}
try {
  for (const [device, options] of [
    ['desktop', { viewport: { width: 1440, height: 900 } }],
    ['Pixel 7 emulation', devices['Pixel 7']],
  ]) {
    browser = await launch();
    const context = await browser.newContext({ ...options, serviceWorkers: 'block' });
    const page = await context.newPage();
    activePage = page;
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    // Console errors, not just uncaught exceptions. Lighthouse's
    // `errors-in-console` audit reads these, so a run that ignores them can call
    // a page clean while a browser says otherwise. The only permitted ones are
    // those the stub server itself causes: it answers `/api/*` with 503, which
    // Chrome logs as "Failed to load resource", and the deployment answers those
    // paths with Pages Functions. They are counted so an unexplained console
    // error — a React warning, a failed import, a rejected promise nobody
    // caught — cannot hide behind them.
    const consoleErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    let stubbedApiFailures = 0;
    const failures = [];
    page.on('response', (response) => {
      if (response.status() >= 400 && !response.url().includes('/api/'))
        failures.push(`${response.status()} ${response.url()}`);
      if (response.status() >= 400 && response.url().includes('/api/')) stubbedApiFailures += 1;
    });
    for (const route of [
      '/',
      '/about',
      '/login',
      '/signup',
      '/events',
      '/jobs',
      '/projects',
      '/playground',
      '/search',
      '/shop',
      '/missing-browser-route',
    ]) {
      await check(`${device}: ${route} renders without crash/overflow`, async () => {
        // Judged on its own requests: a 404 on one page must not be charged to
        // every page visited after it.
        errors.length = 0;
        failures.length = 0;
        consoleErrors.length = 0;
        stubbedApiFailures = 0;
        await page.goto(server.origin + route, { waitUntil: 'networkidle' });
        assert(await page.locator('main').innerText(), 'Main content must render');
        assert.deepEqual(errors, [], 'No uncaught browser exceptions');
        assert.deepEqual(failures, [], 'No missing non-API resources');
        assert(
          consoleErrors.length <= stubbedApiFailures,
          `No unexplained console errors: ${consoleErrors.join(' | ')}`,
        );
        assert(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          'No horizontal overflow',
        );
      });
    }
    for (const width of [320, 375, 768, 1024, 1280, 1440]) {
      await check(`${device}: navigation reachable at ${width}px`, async () => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(server.origin + '/about', { waitUntil: 'networkidle' });
        const trigger = page.getByRole('button', { name: 'Primary navigation', exact: true });
        await trigger.click();
        const dialog = page.getByRole('dialog', { name: 'Primary navigation' });
        await dialog.waitFor();
        await dialog.getByRole('link', { name: 'Jobs', exact: true }).click();
        await page.waitForURL('**/jobs');
        assert.equal(await dialog.count(), 0, 'Navigation closes after selection');
        await trigger.click();
        await page.keyboard.press('Escape');
        assert.equal(await dialog.count(), 0, 'Escape closes navigation');
        assert(
          await trigger.evaluate((element) => element === document.activeElement),
          'Focus restored',
        );
        assert(
          await page.evaluate(() => {
            const links = [...document.querySelectorAll('header nav a')]
              .map((el) => el.getBoundingClientRect())
              .filter((r) => r.width > 0);
            return links.every((r, i) => i === 0 || r.left >= links[i - 1].right);
          }),
          'Visible primary links must not overlap',
        );
      });
    }
    await page.setViewportSize(options.viewport ?? { width: 1440, height: 900 });
    if (device.startsWith('Pixel')) {
      await check('Pixel 7 emulation: language switch is reachable on mobile', async () => {
        await page.getByRole('button', { name: 'Primary navigation', exact: true }).click();
        await page
          .getByRole('dialog')
          .getByRole('button', { name: 'Switch interface language' })
          .click();
        await page.getByRole('dialog', { name: 'প্রধান নেভিগেশন' }).waitFor();
        await page.getByRole('button', { name: 'ইন্টারফেসের ভাষা পরিবর্তন করুন' }).click();
        await page.keyboard.press('Escape');
      });
    }
    await page.goto(server.origin + '/playground', { waitUntil: 'networkidle' });
    const code = page.getByRole('textbox', { name: 'Code', exact: true });
    const run = page.getByRole('button', { name: 'Run', exact: true });
    const frame = () => page.frameLocator('iframe[title="Output"]');
    await check(`${device}: playground produces real console output`, async () => {
      await run.click();
      await frame().locator('#output').filter({ hasText: 'squares [1,4,9,16]' }).waitFor();
    });
    await check(`${device}: repeat Run restarts the same code`, async () => {
      await run.click();
      await frame().locator('#output').filter({ hasText: 'squares [1,4,9,16]' }).waitFor();
    });
    await check(`${device}: infinite loop terminates without freezing the page`, async () => {
      await code.fill('while (true) {}');
      await run.click();
      await frame().locator('#output').filter({ hasText: '2 second limit' }).waitFor();
      assert(await run.isEnabled());
    });
    await check(`${device}: worker cannot access application storage`, async () => {
      await code.fill(
        "try { indexedDB.open('private'); console.log('UNSAFE'); } catch { console.log('storage denied'); }",
      );
      await run.click();
      await frame().locator('#output').filter({ hasText: 'storage denied' }).waitFor();
    });
    await check(`${device}: worker network requests are blocked`, async () => {
      await code.fill(
        `return fetch('${server.origin}/api/exfiltrate').then(() => console.log('NETWORK ALLOWED'), () => console.log('network denied'));`,
      );
      const before = server.received.filter((url) => url.includes('/api/exfiltrate')).length;
      await run.click();
      await frame().locator('#output').filter({ hasText: 'network denied' }).waitFor();
      assert.equal(server.received.filter((url) => url.includes('/api/exfiltrate')).length, before);
    });
    await check(`${device}: HTML is previewed without scripts or links`, async () => {
      await page.getByLabel('Language', { exact: true }).selectOption('html');
      await code.fill(
        '<h1>Preview works</h1><script>parent.document.body.innerHTML="BAD"</script><a href="https://example.invalid/">unsafe link</a>',
      );
      await run.click();
      const preview = frame().frameLocator('iframe');
      await preview.getByRole('heading', { name: 'Preview works' }).waitFor();
      assert.equal(await preview.locator('script,a[href]').count(), 0);
      assert(await run.isVisible());
    });
    await page.screenshot({
      path: join(output, `${device.startsWith('Pixel') ? 'mobile' : 'desktop'}-fixed.png`),
      fullPage: true,
    });
    await browser.close();
    browser = undefined;
  }

  /* ------------------------------------------------------------------ *
   * The responsive matrix.
   *
   * The brief names nine widths and two invariants: no horizontal scroll, and a
   * touch target you can hit. The device pass above covers one desktop and one
   * phone; a layout can pass both and still break at 2560 or at the 768 seam
   * where the rail stops being a rail. So the matrix sweeps the widths on the
   * routes a stranger actually lands on, in one browser, and reads the document
   * box rather than trusting a screenshot.
   * ------------------------------------------------------------------ */
  browser = await launch();
  const matrix = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    serviceWorkers: 'block',
    // Touch is what makes a 30px control a defect rather than a preference.
    hasTouch: true,
  });
  const page = await matrix.newPage();
  activePage = page;
  for (const width of [320, 375, 414, 540, 768, 1024, 1440, 1920, 2560]) {
    await check(`${width}px: no horizontal scroll on the public pages`, async () => {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ['/', '/jobs', '/events', '/marketplace', '/about']) {
        await page.goto(server.origin + route, { waitUntil: 'networkidle' });
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        );
        assert(overflow <= 0, `${route} scrolls ${overflow}px sideways at ${width}px`);
      }
    });
  }

  await check('412px touch: the shell controls a thumb has to hit are 44x44', async () => {
    await page.setViewportSize({ width: 412, height: 915 });
    await page.goto(server.origin + '/', { waitUntil: 'networkidle' });
    const small = await page.evaluate(() => {
      // Only the chrome — header and navigation — is gated. WCAG 2.5.8 exempts
      // a target that sits inside a line of prose, and a feed card's text link is
      // exactly that: measuring it would produce a wall of findings nobody may
      // act on, which is how a11y checks get switched off.
      const selectors = ['header a', 'header button', 'nav a', 'nav button', '[role="tab"]'];
      const seen = new Set();
      const out = [];
      for (const selector of selectors) {
        for (const el of document.querySelectorAll(selector)) {
          if (seen.has(el)) continue;
          seen.add(el);
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          if (rect.width < 44 || rect.height < 44) {
            const name =
              el.getAttribute('aria-label') ??
              el.textContent?.trim().slice(0, 24) ??
              el.tagName.toLowerCase();
            out.push(`${name} ${Math.round(rect.width)}x${Math.round(rect.height)}`);
          }
        }
      }
      return out;
    });
    assert(small.length === 0, `targets under 44px: ${small.slice(0, 8).join(', ')}`);
  });
  await browser.close();
  browser = undefined;
} catch (error) {
  if (activePage && !activePage.isClosed())
    await activePage
      .screenshot({ path: join(output, 'failure.png'), fullPage: true })
      .catch(() => {});
  results.push({ passed: false, error: String(error) });
  process.exitCode = 1;
  console.error(error);
} finally {
  await browser?.close();
  await server.close();
  await writeFile(
    join(output, 'summary.json'),
    JSON.stringify(
      {
        browser: 'Chromium; mobile emulation, not a physical device',
        limitations:
          'No configured Firebase/Supabase, Pages API implementation, service-worker/offline, or live provider acceptance',
        results,
      },
      null,
      2,
    ),
  );
  const failed = results.filter((result) => !result.passed);
  console.log(
    `${results.length - failed.length} passed${failed.length > 0 ? `, ${failed.length} failed` : ''}; report: ${output}`,
  );
  for (const failure of failed) console.log(`  ${failure.name}: ${failure.error.split('\n')[0]}`);
}
