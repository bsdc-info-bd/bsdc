/**
 * Real-browser verification for brief §14.1/§14.2/§9-style checks:
 * - loads the running site at every §11 breakpoint (250px → 2560px)
 * - asserts no horizontal overflow at any width
 * - captures screenshots to ./shots for manual review
 * - exercises keyboard navigation, theme toggle and Bangla/English toggle
 * - fails on any console error or page error
 *
 * Usage:  npm run dev   (separate terminal)
 *         npm run verify:ui
 * Requires: npx playwright install chromium
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE_URL = process.env.VERIFY_BASE_URL ?? 'http://localhost:5173';
const WIDTHS = [250, 320, 375, 480, 768, 1024, 1280, 1440, 1920, 2560];

mkdirSync('shots', { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 250, height: 900 } });
const page = await context.newPage();

const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));

let failures = 0;

// Wait for the dev server (CI starts it in the background).
async function gotoWithRetry(url, attempts = 40) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 5000 });
      return;
    } catch (err) {
      if (i === attempts - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

console.log(`Verifying ${BASE_URL} at ${WIDTHS.join(', ')}px`);
await page.setViewportSize({ width: 250, height: 900 });
for (const width of WIDTHS) {
  await page.setViewportSize({ width, height: 900 });
  await gotoWithRetry(BASE_URL);
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  const ok = scrollWidth <= innerWidth;
  if (!ok) failures += 1;
  console.log(
    `  ${String(width).padStart(4)}px  scrollWidth=${scrollWidth} innerWidth=${innerWidth}  ${ok ? 'OK' : 'FAIL: horizontal overflow'}`,
  );
  await page.screenshot({ path: `shots/landing-${width}.png` });
}

// Keyboard navigation: skip link must be the first stop and work (§14.3).
await page.setViewportSize({ width: 375, height: 900 });
await gotoWithRetry(BASE_URL);
await page.keyboard.press('Tab');
const skipFocused = await page.evaluate(() => document.activeElement?.textContent ?? '');
if (!/skip to content/i.test(skipFocused)) {
  failures += 1;
  console.log(`  keyboard: skip link not first focusable (got "${skipFocused}") FAIL`);
} else {
  console.log('  keyboard: skip link is first focusable and labeled  OK');
}

// Language toggle → Bangla renders + <html lang="bn"> (§14.7).
await page.getByRole('button', { name: /language/i }).click();
await page.getByRole('menuitemradio', { name: 'বাংলা' }).click();
await page.waitForFunction(() => document.documentElement.lang === 'bn');
const bnH1 = await page.locator('h1').textContent();
if (!bnH1 || !bnH1.includes('উন্মুক্ত ঠিকানা')) {
  failures += 1;
  console.log(`  i18n: Bangla h1 not rendered (got "${bnH1}") FAIL`);
} else {
  console.log('  i18n: Bangla locale renders hero + html[lang=bn]  OK');
}
await page.screenshot({ path: 'shots/landing-375-bn.png' });

// Theme toggle → dark class (§11).
await page.getByRole('button', { name: /theme/i }).click();
await page.getByRole('menuitemradio', { name: /গাঢ়|dark/i }).click();
await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
console.log('  theme: dark mode class applied  OK');
await page.screenshot({ path: 'shots/landing-375-bn-dark.png' });

// A not-yet-implemented route must be honest and reachable.
await gotoWithRetry(`${BASE_URL}/@someuser`);
const phaseLabel = await page.getByText(/Planned for Phase 1|ফেজ 1-এর জন্য পরিকল্পিত/).count();
if (phaseLabel < 1) {
  failures += 1;
  console.log('  routes: /@username honesty screen missing  FAIL');
} else {
  console.log('  routes: /@username shows explicit Phase 1 not-yet screen  OK');
}

if (consoleErrors.length > 0) {
  failures += 1;
  console.log(`  console errors (${consoleErrors.length}):`);
  for (const err of consoleErrors) console.log(`    - ${err}`);
} else {
  console.log('  console: zero errors/warnings-as-errors  OK');
}

await browser.close();
if (failures > 0) {
  console.error(`verify:ui FAILED with ${failures} failure(s)`);
  process.exit(1);
}
console.log('verify:ui PASSED');
