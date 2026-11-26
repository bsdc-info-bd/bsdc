#!/usr/bin/env node
/* global document, window, getComputedStyle, HTMLElement, matchMedia */
/**
 * A console left open across a deploy.
 *
 * `main-site/scripts/browser/stale-build.mjs` proved the recovery for the
 * public site. Gap G5 was that no console had it: an operator on a duty console
 * at 03:00, a deploy lands, they click a tab, and the console shows a blank or
 * an error screen until they think to reload. This suite is the console version
 * of the same experiment, run against a real build of a real console.
 *
 * The mechanism is the one this repository already trusts: build twice so a
 * chunk really does get a new content hash, serve the first, load it, swap the
 * server to the second, then navigate. The console must recover into the new
 * build and keep working — because "recovered once" is not the same as fixed.
 *
 * Auth: the consoles sit behind a Firebase sign-in that a headless run cannot
 * complete, and the recovery lives in the shell *around* the gate. So the test
 * injects a minimal fixture of the session before the module graph runs, which
 * is enough to mount the shell and therefore to exercise the recovery. The
 * fixture is asserted to be what mounted: if the shell ever stops mounting, the
 * failure reads as "the shell did not render", not as a timeout.
 *
 * Run: node main-site/scripts/browser/console-stale.mjs [console…]
 * Build first: npm run build --workspace=<console>, or for each in turn.
 */
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { brotliDecompressSync } from 'node:zlib';
import { serveBuild } from './server.mjs';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repo = resolve(root, '..');
const output = resolve(process.env.BROWSER_REPORT_DIR ?? join(root, '.browser-evidence'));
await mkdir(output, { recursive: true });

/** The consoles this suite covers. Each appends its own assets on top of the kit. */
const ALL_CONSOLES = [
  'admin-site',
  'users-admin-site',
  'users-moderator-site',
  'moderator-site',
  'certificate-site',
  'notice-site',
  'config-site',
  'customize-site',
  'ip-site',
  'performance-site',
  'connect-site',
  'status-site',
  'vf-site',
];

const requested = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
const consoles = requested.length > 0 ? requested : ALL_CONSOLES;

/**
 * Chromium comes from the workspace so the suite does not download one.
 *
 * Two sources, in order: an explicit `CHROMIUM_EXECUTABLE_PATH`, then a browser
 * already unpacked under /tmp (the sandbox convention this repository's other
 * browser suites use). A directory is accepted and resolved to the binary
 * inside it, because "point this at the browser" is what a person will do and
 * refusing a directory is a papercut, not a safety property.
 */
async function launchBrowser() {
  const { chromium } = await import('playwright-core');
  const explicit = process.env.CHROMIUM_EXECUTABLE_PATH;
  const candidates = [
    explicit && !explicit.endsWith('/') ? explicit : null,
    '/tmp/chromebin/chromium',
    '/tmp/chromium/chromium',
    '/tmp/chromium',
    '/tmp/chromium/chrome',
  ].filter(Boolean);
  let executablePath = candidates.find((path) => existsSync(path) && !isDirectory(path));
  if (!executablePath) {
    const dir = candidates.find((path) => existsSync(path) && isDirectory(path));
    if (dir) {
      const inner = ['chrome', 'chromium', 'headless_shell']
        .map((name) => join(dir, name))
        .find((path) => existsSync(path));
      if (inner) executablePath = inner;
    }
  }

  let args = ['--no-sandbox', '--disable-dev-shm-usage'];
  let libraryPath = process.env.LD_LIBRARY_PATH ?? '';
  if (!executablePath) {
    // Use the same pinned Chromium as the other repository browser suites. A
    // runner with no system browser must not silently skip the console gate.
    const bundled = (await import('@sparticuz/chromium')).default;
    executablePath = await bundled.executablePath();
    args = bundled.args.filter(
      (arg) =>
        !arg.includes('disable-web-security') &&
        !arg.includes('allow-running-insecure-content') &&
        !arg.includes('disable-site-isolation-trials'),
    );
    if (process.platform === 'linux') {
      const bin = resolve(dirname(require.resolve('@sparticuz/chromium')), '../bin');
      const target = join(tmpdir(), 'bsdc-console-browser-libs');
      await mkdir(target, { recursive: true });
      const tar = join(target, 'libs.tar');
      await writeFile(tar, brotliDecompressSync(await readFile(join(bin, 'al2023.tar.br'))));
      const unpacked = spawnSync('tar', ['-xf', tar, '-C', target], { encoding: 'utf8' });
      assert.equal(unpacked.status, 0, `Chromium shared libraries unpack: ${unpacked.stderr}`);
      libraryPath = `${target}/lib:${libraryPath}`;
    }
  } else {
    for (const libs of [
      '/tmp/bsdc-console-browser-libs/lib',
      '/tmp/bsdclibs/lib',
      '/tmp/crlibs/lib',
    ]) {
      if (existsSync(libs)) {
        libraryPath = libraryPath.includes(libs) ? libraryPath : `${libs}:${libraryPath}`;
        break;
      }
    }
  }
  return {
    browser: await chromium.launch({
      executablePath,
      args,
      env: { ...process.env, LD_LIBRARY_PATH: libraryPath },
      headless: true,
    }),
  };
}

function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

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

/**
 * The session fixture.
 *
 * It must run before the console's module graph so `readEnv` and the session
 * provider find what they expect. It authenticates nothing: the shell still
 * refuses to render its tabs without a profile, and the recovery is deliberately
 * exercised on the pre-auth screen, which is the state an operator sees when a
 * deploy lands between sign-in and first paint.
 */
const FIXTURE = `
  window.__BSDC_BROWSER_TEST__ = true;
  // addInitScript runs before the document exists, so the marker goes on as
  // soon as there is a documentElement to put it on.
  const mark = () => document.documentElement.setAttribute('data-test-harness', 'console-stale');
  if (document.documentElement) mark();
  else document.addEventListener('DOMContentLoaded', mark, { once: true });
`;

/**
 * Builds a second, genuinely different deployment.
 *
 * Changing a comment is not enough: the minifier strips it, so the chunk bytes
 * are identical and the hash does not move — which makes the test pass without
 * proving anything. A rendered attribute survives minification, so the marker
 * is set on `documentElement` in `main.tsx`, which every console has and which
 * touches no screen's behaviour.
 */
async function buildSecond(consoleDir, outputDir) {
  const candidate = join(consoleDir, 'src', 'main.tsx');
  const original = await readFile(candidate, 'utf8');
  const marker = `bsdc-deploy-${Date.now()}`;
  const next = original.replace(
    'mountConsole(',
    `document.documentElement.setAttribute('data-deploy-marker', '${marker}');\nmountConsole(`,
  );
  assert.notEqual(next, original, `${consoleDir}: the deploy marker was inserted into main.tsx`);
  try {
    await writeFile(candidate, next);
    const built = spawnSync('npx', ['vite', 'build', '--outDir', outputDir], {
      cwd: consoleDir,
      encoding: 'utf8',
    });
    assert.equal(
      built.status,
      0,
      `second build of ${consoleDir} succeeds: ${(built.stderr ?? '').slice(-300)}`,
    );
  } finally {
    await writeFile(candidate, original);
  }
  return marker;
}

const { browser } = await launchBrowser();
try {
  for (const name of consoles) {
    const consoleDir = join(repo, name);
    const dist = join(consoleDir, 'dist');
    let built = true;
    try {
      await stat(join(dist, 'index.html'));
    } catch {
      built = false;
    }
    if (!built) {
      results.push({
        name,
        passed: false,
        error: 'missing dist/index.html; the browser gate must never skip an unbuilt console',
      });
      console.log(`FAIL ${name} — no dist/index.html; build the console before running this gate`);
      process.exitCode = 1;
      continue;
    }

    await check(`${name}: a deploy does not blank the console`, async () => {
      const work = await mkdtemp(join(tmpdir(), `bsdc-${name}-`));
      const buildA = join(work, 'a');
      const buildB = join(work, 'b');
      const live = join(work, 'live');
      try {
        await cp(dist, buildA, { recursive: true });
        const marker = await buildSecond(consoleDir, buildB);
        // The second deployment is built into the isolated temp directory.
        // The real dist/ is never overwritten, even if a build fails midway.

        const assetsOf = async (build) =>
          (await readdir(join(build, 'assets'))).filter((file) => file.endsWith('.js'));
        const before = await assetsOf(buildA);
        const after = await assetsOf(buildB);
        const added = after.filter((file) => !before.includes(file));
        assert.ok(added.length > 0, `${name}: the second build names at least one new chunk`);
        const indexB = await readFile(
          join(buildB, 'assets', after.find((f) => f.startsWith('index-')) ?? ''),
          'utf8',
        ).catch(() => '');
        assert.ok(
          indexB.includes(marker),
          `${name}: the second build really is the one just compiled (marker present)`,
        );

        await cp(buildA, live, { recursive: true });
        const server = await serveBuild(live);
        try {
          const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
          await context.addInitScript(FIXTURE);
          const page = await context.newPage();
          const missing = [];
          const pageErrors = [];
          page.on('response', (response) => {
            if (response.url().includes('/assets/') && response.status() === 404) {
              missing.push(response.url().split('/').pop());
            }
          });
          page.on('pageerror', (error) => pageErrors.push(error.message));

          // Load build A.
          await page.goto(server.origin + '/', { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(1_000);
          assert.ok(
            await page.locator('[data-test-harness="console-stale"]').count(),
            `${name}: the document loaded and the fixture ran`,
          );

          // A real narrow screen, not a screenshot at one convenient width.
          // These nine points cover the plan's 250px–4K range and common breakpoints.
          for (const width of [250, 320, 375, 640, 768, 1024, 1440, 2560, 3840]) {
            await page.setViewportSize({ width, height: 900 });
            await page.waitForTimeout(40);
            const overflow = await page.evaluate(
              () => document.documentElement.scrollWidth > window.innerWidth,
            );
            assert.equal(overflow, false, `${name}: horizontal overflow at ${width}px`);
          }
          await page.setViewportSize({ width: 1280, height: 900 });

          const focusableSelector =
            'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
          const expectedTabStops = await page.locator(focusableSelector).evaluateAll((nodes) => {
            let index = 0;
            return nodes
              .filter((node) => {
                const style = getComputedStyle(node);
                return (
                  !node.hasAttribute('disabled') &&
                  style.visibility !== 'hidden' &&
                  style.display !== 'none' &&
                  node.getClientRects().length > 0 &&
                  node.tabIndex >= 0
                );
              })
              .map((node) => {
                node.setAttribute('data-craft-tab-stop', String(index));
                index += 1;
                return index - 1;
              });
          });
          assert.ok(
            expectedTabStops.length > 0,
            `${name}: the first screen exposes keyboard controls`,
          );
          const reached = new Set();
          const focusProblems = [];
          for (let step = 0; step < expectedTabStops.length + 2; step += 1) {
            await page.keyboard.press('Tab');
            const focus = await page.evaluate(() => {
              const element = document.activeElement;
              if (!(element instanceof HTMLElement)) return null;
              const style = getComputedStyle(element);
              return {
                stop: element.getAttribute('data-craft-tab-stop'),
                outline: style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0,
                outlineStyle: style.outlineStyle,
                outlineWidth: style.outlineWidth,
                focusVisible: element.matches(':focus-visible'),
                label: `${element.tagName}.${String(element.className)}[${element.getAttribute('aria-label') ?? ''}] ${element.textContent?.trim().slice(0, 48) ?? ''}`,
              };
            });
            if (focus?.stop !== null && focus?.stop !== undefined) {
              reached.add(Number(focus.stop));
              if (!focus.outline)
                focusProblems.push(
                  `${focus.label} [focus-visible=${String(focus.focusVisible)}, ${focus.outlineStyle} ${focus.outlineWidth}]`,
                );
            }
          }
          assert.deepEqual(
            [...reached].sort((a, b) => a - b),
            expectedTabStops,
            `${name}: Tab reaches every visible control in DOM order`,
          );
          assert.deepEqual(
            focusProblems,
            [],
            `${name}: every visited control has a visible focus ring: ${focusProblems.join(', ')}`,
          );
          await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
          const mediaProof = await page.evaluate(() => {
            const ms = (value) =>
              value.trim().endsWith('ms')
                ? Number.parseFloat(value)
                : Number.parseFloat(value) * 1_000;
            const motion = [...document.querySelectorAll('*')].flatMap((element) => {
              const style = getComputedStyle(element);
              return [style.animationDuration, style.transitionDuration]
                .flatMap((value) => value.split(','))
                .filter((value) => ms(value) > 0.01)
                .map((value) => `${element.tagName}.${String(element.className)}:${value.trim()}`);
            });
            return {
              visible: document.body.getClientRects().length > 0,
              reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
              forcedColors: matchMedia('(forced-colors: active)').matches,
              motion,
            };
          });
          assert.ok(mediaProof.visible, `${name}: the app remains visible in forced-colors mode`);
          assert.ok(mediaProof.reducedMotion, `${name}: reduced-motion media mode is active`);
          assert.ok(mediaProof.forcedColors, `${name}: forced-colors media mode is active`);
          assert.deepEqual(
            mediaProof.motion,
            [],
            `${name}: every animation and transition respects reduced motion`,
          );
          await page.emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'none' });

          // Swap the deployment underneath the open tab, then ask for a chunk
          // that only exists in the old build. This is exactly the production
          // sequence; a plain reload would not reproduce it because the reload
          // fetches a fresh index.html.
          await rm(live, { recursive: true, force: true });
          await cp(buildB, live, { recursive: true });
          missing.length = 0;
          const staleChunk = before.find(
            (file) => file.startsWith('index-') || file.includes('CommandPalette'),
          );
          assert.ok(staleChunk, `${name}: found a chunk name to ask for`);
          // Importing the removed chunk is exactly what a lazily-loaded tab
          // does when the operator clicks it. The import is not caught, so the
          // rejection reaches the page's own `unhandledrejection` listener —
          // which is the listener under test.
          await page.evaluate((chunk) => {
            void import(`/assets/${chunk}`);
          }, staleChunk);
          await page.waitForTimeout(3_000);

          // Recovery may have reloaded the page. Either way the console must be
          // alive: no error screen, and the document is the new build.
          const text = await page.evaluate(() => document.body.innerText ?? '');
          assert.ok(!/Something went wrong on this screen/i.test(text), `${name}: no error screen`);
          assert.ok(
            await page.locator('[data-test-harness="console-stale"]').count(),
            `${name}: the console is still mounted after the deploy`,
          );
          assert.ok(
            !pageErrors.some((message) =>
              /Failed to fetch dynamically imported module/i.test(message),
            ),
            `${name}: no unhandled chunk failure escaped to the page`,
          );

          // And it still works afterwards: a second load must succeed outright.
          await page.goto(server.origin + '/', { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(800);
          assert.ok(
            await page.locator('[data-test-harness="console-stale"]').count(),
            `${name}: the console opens on the new build`,
          );

          await page.screenshot({ path: join(output, `console-stale-${name}.png`) });
          await context.close();
        } finally {
          await server.close();
        }
      } finally {
        await rm(work, { recursive: true, force: true });
      }
    });
  }
} finally {
  await browser.close();
}

const failed = results.filter((result) => !result.passed);
const skipped = consoles.length - results.length;
console.log(
  `\n${results.length - failed.length} passed, ${failed.length} failed${skipped > 0 ? `, ${skipped} skipped` : ''}`,
);
if (failed.length > 0) process.exitCode = 1;
