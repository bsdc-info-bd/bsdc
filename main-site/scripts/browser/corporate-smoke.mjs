#!/usr/bin/env node
/* global document, window, navigator */
/* Browser regression checks against production builds and mocked providers.
 * This checks application wiring, not live Firebase/Supabase deployment. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { brotliDecompressSync } from 'node:zlib';
import { chromium } from 'playwright-core';
import bundled from '@sparticuz/chromium';
import { serveBuild } from './server.mjs';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const appDirs = ['performance-site', 'vf-site', 'admin-site', 'certificate-site', 'notice-site'];
const config = {
  VITE_FB2_API_KEY: 'browser-test',
  VITE_FB2_AUTH_DOMAIN: 'browser-test.firebaseapp.com',
  VITE_FB2_PROJECT_ID: 'browser-test',
  VITE_FB2_APP_ID: 'browser-test',
  VITE_SUPABASE_URL: 'https://browser-test.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'browser-test',
  VITE_CORPORATE_VITALS: 'true',
};
// Build with test-only public configuration; the requests below are intercepted.
for (const app of appDirs) {
  const build = spawnSync('npm', ['run', 'build'], {
    cwd: join(root, app), env: { ...process.env, ...config }, encoding: 'utf8',
  });
  if (build.status !== 0) throw new Error(`${app} build failed:\n${build.stdout}\n${build.stderr}`);
  console.log(`PASS ${app}: production build`);
}

// Use the same bundled Chromium and library setup as the main-site smoke.
let libraryPath = process.env.LD_LIBRARY_PATH ?? '';
if (!process.env.CHROMIUM_EXECUTABLE_PATH && process.platform === 'linux') {
  const bin = resolve(dirname(require.resolve('@sparticuz/chromium')), '../bin');
  const target = join(tmpdir(), 'bsdc-browser-libs');
  await mkdir(target, { recursive: true });
  const tar = join(target, 'libs.tar');
  await writeFile(tar, brotliDecompressSync(await readFile(join(bin, 'al2023.tar.br'))));
  assert.equal(spawnSync('tar', ['-xf', tar, '-C', target]).status, 0);
  libraryPath = `${target}/lib:${libraryPath}`;
}
const servers = {};
let browser;
let page;
const temp = await mkdtemp(join(tmpdir(), 'bsdc-corporate-smoke-'));
try {
  for (const app of appDirs) servers[app] = await serveBuild(join(root, app, 'dist'));
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH ?? (await bundled.executablePath()),
    args: bundled.args.filter((arg) =>
      !arg.includes('disable-web-security') &&
      !arg.includes('allow-running-insecure-content') &&
      !arg.includes('disable-site-isolation-trials')),
    env: { ...process.env, LD_LIBRARY_PATH: libraryPath },
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', acceptDownloads: true,
  });
  const errors = [];
  context.on('page', (opened) => opened.on('pageerror', (error) => errors.push(error.message)));

  const now = Math.floor(Date.now() / 1000);
  const fakeJwt = [
    { alg: 'RS256', typ: 'JWT' },
    { iss: 'https://securetoken.google.com/browser-test', aud: 'browser-test', auth_time: now,
      iat: now, exp: now + 3600, sub: 'staff-demo', user_id: 'staff-demo',
      email: 'staff@example.test', firebase: { sign_in_provider: 'password' } },
  ].map((part) => Buffer.from(JSON.stringify(part)).toString('base64url')).join('.') + '.fake';
  const receipt = { receipt_id: '12345678-1234-4234-8234-123456789abc', generated_at: '2026-11-07T12:00:00Z' };
  const calls = [];
  let allocated = null;
  let digest = '';
  let reportSourceFails = true;
  let campaignBookFails = true;
  const headers = {
    'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS', 'content-type': 'application/json',
  };
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = request.url();
    if (url.includes('identitytoolkit.googleapis.com') || url.includes('securetoken.googleapis.com')) {
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      if (url.includes('signInWithPassword')) return route.fulfill({ status: 200, headers, body: JSON.stringify({
        kind: 'identitytoolkit#VerifyPasswordResponse', localId: 'staff-demo', email: 'staff@example.test',
        displayName: 'Test Staff', idToken: fakeJwt, refreshToken: 'fake', expiresIn: '3600', registered: true,
      }) });
      if (url.includes('accounts:lookup')) return route.fulfill({ status: 200, headers, body: JSON.stringify({
        users: [{ localId: 'staff-demo', email: 'staff@example.test', displayName: 'Test Staff',
          emailVerified: true, providerUserInfo: [], createdAt: '1700000000000', lastLoginAt: '1700000000000' }],
      }) });
      throw new Error(`Unexpected Firebase request: ${url}`);
    }
    if (!url.startsWith(`${config.VITE_SUPABASE_URL}/`)) return route.continue();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const name = new URL(url).pathname.split('/').at(-1);
    const args = request.postDataJSON() ?? {};
    calls.push({ name, args });
    let response = [];
    if (name === 'record_vital') response = null;
    else if (name === 'staff_identity') response = [{ uid: 'staff-demo', display_name: 'Test Staff', avatar_url: null,
      role: 'owner', status: 'active', rank: 7, onboarding_complete: true, created_at: '2024-01-01', last_seen_at: null }];
    else if (name === 'performance_vitals_overall' && reportSourceFails && args.p_days === 7) {
      return route.fulfill({ status: 503, headers, body: JSON.stringify({ code: 'TEST_UNAVAILABLE', message: 'Source unavailable' }) });
    } else if (name === 'performance_vitals_overall') response = [{ metric: 'LCP', samples: 5, p75: 900, p95: 1000 }];
    else if (name === 'vitals_summary') response = [{ route: '/', metric: 'LCP', samples: 5, p75: 900, p95: 1000, rating: 'good' }];
    else if (name === 'vitals_trend') response = [{ day: '2026-11-01', samples: 5, p75: 900, mobile_p75: 950, desktop_p75: 800 }];
    else if (name === 'performance_edge_for_app') response = [{ endpoint: '/api/example', calls: 7, p50: 150, p95: 200, error_rate: 0 }];
    else if (name === 'start_performance_report') { allocated = args; response = [receipt]; }
    else if (name === 'finalize_performance_report') { digest = args.p_sha256; response = true; }
    else if (name === 'verify_performance_report') response = digest ? [{ ...receipt, app: allocated.p_app,
      days: allocated.p_days, title: allocated.p_title, sections: allocated.p_sections, sha256: digest }] : [];
    else if (name === 'campaign_book' && campaignBookFails) return route.fulfill({ status: 404, headers,
      body: JSON.stringify({ code: 'PGRST202', message: 'Function not found', details: 'mock' }) });
    else if (name === 'campaign_owners') response = [{ uid: 'owner-1', username: 'advertiser', display_name: 'Advertiser One',
      avatar_url: '', status: 'active', campaigns: 0, active_campaigns: 0, wallet_balance: 500000,
      lifetime_spend: 0, last_campaign_at: null }];
    else if (name === 'ad_inventory') response = [{ placement: 'feed', live_campaigns: 0,
      impressions_today: 0, clicks_today: 0, spend_today: 0, ctr_today: 0, floor_bid: 100 }];
    else if (name === 'verify_code') response = [{ code: args.p_code, kind: 'CT', valid: true, state: 'valid',
      reason: '', subject: 'Frontend', detail: 'Ayesha', issuer: 'BSDC', issued_on: '2026-11-07', expires_on: null, verifications: 1 }];
    else if (name === 'certificate_templates') response = [{ key: 'course-completion', name: 'Course', purpose: 'Learning',
      heading: 'Certificate of Completion', body_template: 'Template wording', accent: '#1b4332', orientation: 'portrait',
      signature_name: 'Chief Executive Officer', signature_title: 'Bangladesh Software Development Community', is_active: true }];
    else if (name === 'certificate_registry') response = [{ code: 'BSDC-CT-4A7C21B9-0', template_key: 'course-completion',
      recipient_name: 'Ayesha', subject: 'List summary only', issued_on: '2026-11-07', expires_on: null,
      status: 'revoked', revoke_reason: 'Incorrect record', verifications: 0 }];
    else if (name === 'certificate_for_print') response = [{ code: args.p_code, template_key: 'course-completion',
      recipient_name: 'Ayesha', body: 'Frozen issued wording from the registry.', issued_on: '2026-11-07', expires_on: null, status: 'revoked' }];
    else if (name === 'notice_registry') {
      const row = { summary: 'Notice summary', body: 'The full notice body is here.', category: 'general', audience: 'public',
        priority: 'routine', pinned: false, requires_ack: false, expires_at: null, updated_at: '2026-01-01T00:00:00Z',
        acknowledgements: 0, staff_total: 0 };
      response = [
        { ...row, id: 'published', code: 'BSDC-NT-91B2C3D4-5', title: 'Published notice', status: 'published', publish_at: '2026-01-01T00:00:00Z' },
        { ...row, id: 'draft', code: 'BSDC-NT-91B2C3D4-5', title: 'Draft notice', status: 'draft', publish_at: null },
      ];
    }
    return route.fulfill({ status: 200, headers, body: JSON.stringify(response) });
  });

  page = await context.newPage();
  const login = async (app) => {
    await page.goto(servers[app].origin, { waitUntil: 'networkidle' });
    await page.getByLabel('Email address').fill('staff@example.test');
    await page.getByLabel('Password').fill('browser-test');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('button', { name: 'Sign out' }).waitFor({ timeout: 20000 });
  };
  const saveDownload = async (locator, filename) => {
    const [download] = await Promise.all([page.waitForEvent('download'), locator.click()]);
    const path = join(temp, filename);
    await download.saveAs(path);
    return readFile(path);
  };

  const firstVital = page.waitForRequest((request) => request.url().endsWith('/rpc/record_vital'), { timeout: 15000 });
  await login('performance-site');
  const beacon = (await firstVital).postDataJSON();
  assert.equal(beacon.p_app, 'bsdc-perf');
  assert.equal(beacon.p_route, '/');
  assert(!Object.keys(beacon).some((key) => /uid|token|email|code/i.test(key)));
  console.log('PASS deployed console sends an anonymous, query-free field vital');
  await page.getByText('Only 5 measurements; interpret cautiously.').waitFor();
  assert.equal(await page.getByText('unknown', { exact: true }).count(), 5);
  console.log('PASS small samples are not rated good');
  await page.getByRole('button', { name: 'Edge', exact: true }).click();
  await page.getByLabel('Application', { exact: true }).selectOption('bsdc-vf');
  await page.getByText('/api/example').waitFor();
  assert(calls.some((call) => call.name === 'performance_edge_for_app' && call.args.p_app === 'bsdc-vf'));
  console.log('PASS edge board queries selected app');

  await page.getByRole('button', { name: 'Reports', exact: true }).click();
  await page.getByLabel('Report title').fill('Custom real-source test report');
  await page.getByLabel('Application', { exact: true }).selectOption('bsdc-vf');
  await page.getByLabel('Rolling period (days)').fill('7');
  await page.getByLabel('Report theme', { exact: true }).selectOption('#1e3a5f');
  await page.getByLabel('Private report note (optional)').fill('A private note.');
  await page.getByRole('button', { name: 'Create verified PDF' }).click();
  await page.getByText('The report was not downloaded').waitFor();
  assert.equal(allocated, null, 'A failed source must not allocate or download a report');
  reportSourceFails = false;
  const reportBytes = await saveDownload(page.getByRole('button', { name: 'Create verified PDF' }), 'report.pdf');
  await page.getByText('Report registered and downloaded').waitFor();
  assert.equal(allocated.p_app, 'bsdc-vf');
  assert.equal(allocated.p_days, 7);
  assert.equal(allocated.p_title, 'Custom real-source test report');
  assert(!JSON.stringify(allocated).includes('private note'));
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert(reportBytes.includes(Buffer.from('A private note.')));
  console.log('PASS report failure aborts; successful report is registered and downloaded');

  await page.goto(`${servers['vf-site'].origin}/?report=${receipt.receipt_id}`, { waitUntil: 'networkidle' });
  await page.getByText('Registered performance report').waitFor();
  await page.getByLabel('Check the PDF file (stays on this device)').setInputFiles(join(temp, 'report.pdf'));
  await page.getByText('Exact match', { exact: true }).waitFor();
  reportBytes[100] ^= 1;
  await writeFile(join(temp, 'tampered.pdf'), reportBytes);
  await page.getByLabel('Check the PDF file (stays on this device)').setInputFiles(join(temp, 'tampered.pdf'));
  await page.getByText('File does not match', { exact: true }).waitFor();
  console.log('PASS public desk matches the downloaded PDF and rejects changed bytes locally');
  await page.goto(`${servers['vf-site'].origin}/?code=BSDC-CT-4A7C21B9-0`, { waitUntil: 'networkidle' });
  assert(calls.some((call) => call.name === 'verify_code' && call.args.p_code === 'BSDC-CT-4A7C21B9-0'));
  await page.setViewportSize({ width: 375, height: 812 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.setViewportSize({ width: 1280, height: 900 });
  console.log('PASS certificate QR landing queries public registry and portal fits mobile');

  const privatePage = await context.newPage();
  await privatePage.addInitScript(() => {
    Object.defineProperty(navigator, 'doNotTrack', { get: () => '1', configurable: true });
  });
  let privateBeacon = false;
  privatePage.on('request', (request) => {
    if (request.url().endsWith('/rpc/record_vital')) privateBeacon = true;
  });
  await privatePage.goto(`${servers['vf-site'].origin}/?code=BSDC-CT-4A7C21B9-0`, { waitUntil: 'networkidle' });
  await privatePage.close();
  assert.equal(privateBeacon, false, 'DNT must disable field collection');
  console.log('PASS Do Not Track suppresses the corporate beacon');

  await login('admin-site');
  await page.getByRole('button', { name: 'Campaigns', exact: true }).click();
  await page.getByText('Some campaign data did not load').waitFor();
  await page.getByText('campaign_book: the database function is missing', { exact: false }).waitFor();
  await page.getByText('Record a received payment').waitFor();
  await page.getByText('Set up a campaign').waitFor();
  campaignBookFails = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await page.getByText('Every campaign').waitFor();
  assert.equal(await page.getByText('Some campaign data did not load').count(), 0);
  console.log('PASS campaign partial failure preserves working sections and retry recovers');

  await login('certificate-site');
  await page.getByRole('button', { name: 'Registry', exact: true }).click();
  await page.getByText('List summary only').waitFor();
  const cert = await saveDownload(page.getByRole('button', { name: 'PDF', exact: true }), 'certificate.pdf');
  assert(cert.includes(Buffer.from('Frozen issued wording from the registry.')));
  assert(!cert.includes(Buffer.from('List summary only')));
  assert(cert.includes(Buffer.from('REVOKED - CHECK REGISTRY')));
  assert(cert.includes(Buffer.from('vf.main.bsdc.info.bd')));
  console.log('PASS revoked certificate reprint uses frozen body and verification portal');

  await login('notice-site');
  const published = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Published notice', exact: true }) });
  const draft = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Draft notice', exact: true }) });
  const publishedPdf = await saveDownload(published.getByRole('button', { name: 'PDF', exact: true }), 'published.pdf');
  const draftPdf = await saveDownload(draft.getByRole('button', { name: 'PDF', exact: true }), 'draft.pdf');
  assert(publishedPdf.includes(Buffer.from('Authorized BSDC signature')));
  assert(!draftPdf.includes(Buffer.from('Authorized BSDC signature')));
  assert(draftPdf.includes(Buffer.from('DRAFT - NOT PUBLISHED')));
  console.log('PASS published notice is signed and draft is clearly unsigned');

  assert.deepEqual(errors, [], 'No uncaught browser exceptions');
} catch (error) {
  if (page) {
    const evidence = join(root, 'main-site', '.browser-evidence');
    await mkdir(evidence, { recursive: true });
    await page.screenshot({ path: join(evidence, 'corporate-failure.png'), fullPage: true });
    console.error('Page URL:', page.url());
    console.error('Page text:', await page.locator('body').innerText());
  }
  throw error;
} finally {
  if (browser) await browser.close();
  await Promise.all(Object.values(servers).map((server) => server.close()));
  await rm(temp, { recursive: true, force: true });
}
