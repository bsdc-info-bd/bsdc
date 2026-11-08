#!/usr/bin/env node
/* global document, innerHeight, innerWidth, localStorage */
/** Real React messenger in Chromium, with all API/provider responses mocked. */
import assert from 'node:assert/strict';
import { chromium, devices } from 'playwright-core';
import bundled from '@sparticuz/chromium';
import { createServer } from 'vite';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliDecompressSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = resolve(process.env.BROWSER_REPORT_DIR ?? join(root, '.browser-evidence'));
await mkdir(output, { recursive: true });
const require = createRequire(import.meta.url);
let libraryPath = process.env.LD_LIBRARY_PATH ?? '';
let extractedLibraries = null;
if (!process.env.CHROMIUM_EXECUTABLE_PATH && process.platform === 'linux') {
  const bin = resolve(dirname(require.resolve('@sparticuz/chromium')), '../bin');
  // Independent runs must not write or extract the same tar at once.
  const target = await mkdtemp(join(tmpdir(), 'bsdc-browser-libs-'));
  extractedLibraries = target;
  const tar = join(target, 'libs.tar');
  await writeFile(tar, brotliDecompressSync(await readFile(join(bin, 'al2023.tar.br'))));
  assert.equal(spawnSync('tar', ['-xf', tar, '-C', target]).status, 0);
  libraryPath = `${target}/lib:${libraryPath}`;
}
process.env.VITE_FB_API_KEY = '';
process.env.VITE_FB_PROJECT_ID = '';
process.env.VITE_SUPABASE_URL = 'https://messenger-api.invalid';
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'browser-test-public-key';
const server = await createServer({
  root,
  server: { host: '0.0.0.0', port: 0, strictPort: false, allowedHosts: true },
  logLevel: 'error',
});
await server.listen();
const origin = `http://localhost:${server.httpServer.address().port}`;
const cid = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const uid = 'browser-alice';
const bob = 'browser-bob';
const carol = 'browser-carol';
const profiles = {
  [uid]: { uid, username: 'alice', display_name: 'Alice', avatar_url: '' },
  [bob]: { uid: bob, username: 'bob', display_name: 'Bob Rahman', avatar_url: '' },
  [carol]: { uid: carol, username: 'carol', display_name: 'Carol Hasan', avatar_url: '' },
};
function makeRow(id, conversation, sender, body, createdAt) {
  return { id, conversation_id: conversation, sender_uid: sender, kind: 'text', body,
    media_url: '', media_name: '', code_language: '', reply_to: null, reply_body: null,
    reply_sender: null, edited_at: null, deleted_at: null, created_at: createdAt,
    client_id: null, reactions: {}, my_reactions: [], read_by: [], starred: false, pinned: false };
}
const initial = Array.from({ length: 84 }, (_, index) => makeRow(
  `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, cid,
  index % 2 ? uid : bob, `History message ${index + 1}`,
  new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
));
let messages = [...initial, makeRow('99999999-9999-4999-8999-999999999999', otherId, carol, 'Other room message', '2026-01-02T00:00:00Z')];
const state = new Map([[cid, { draft_body: '', is_pinned: false, is_archived: false, muted_until: null }],
  [otherId, { draft_body: '', is_pinned: false, is_archived: false, muted_until: null }]]);
const sentByKey = new Map();
const attempts = [];
let failNextAfterCommit = false;
let failNextDraftWrite = false;
let failNextSavedRead = false;
let failNextSearch = false;
let activePage;
let browser;
const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'content-type': 'application/json' };
const records = [];
const uploads = [];
async function routeHandler(route) {
  const request = route.request();
  const url = new URL(request.url());
  if (url.pathname === '/api/media/providers') {
    return route.fulfill({ status: 200, headers, body: JSON.stringify({ proxy: true, imgbb: true }) });
  }
  if (url.pathname === '/api/media/upload') {
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    uploads.push(url.pathname);
    return route.fulfill({ status: 200, headers, body: JSON.stringify({
      ok: true,
      provider: 'imgbb',
      kind: 'image',
      url: 'https://i.ibb.co/browser-test/photo.png',
      thumbUrl: 'https://i.ibb.co/browser-test/photo-medium.png',
      deleteToken: '',
      width: 64,
      height: 64,
      bytes: 68,
      mimeType: 'image/png',
    }) });
  }
  if (url.hostname === 'i.ibb.co') {
    const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'image/png' }, body: pixel });
  }
  if (url.hostname !== 'messenger-api.invalid') return route.continue();
  if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
  const name = url.pathname.split('/').at(-1);
  const args = request.postDataJSON() ?? {};
  records.push({ name, method: request.method(), search: url.search, args });
  let body = [];
  if (name === 'conversation_inbox') {
    body = [[cid, bob], [otherId, carol]].map(([id, person]) => ({ id, kind: 'direct', title: '', avatar_url: '',
      last_message_at: '2026-01-02T00:00:00Z', last_message_preview: id === cid ? 'History message 84' : 'Other room message',
      unread_count: 0, muted: false, other_uid: person, other_username: profiles[person].username,
      other_name: profiles[person].display_name, other_avatar: '' }));
  } else if (name === 'conversation_state') {
    // Exercise the messages-before-membership race, not just the faster path.
    await new Promise((resolve) => setTimeout(resolve, 150));
    const value = state.get(args.p_conversation_id);
    body = value ? [{ is_member: true, muted: Boolean(value.muted_until), is_pinned: value.is_pinned,
      is_archived: value.is_archived, draft_body: value.draft_body, last_read_at: '2025-01-01T00:00:00Z' }] : [];
  } else if (name === 'conversation_messages_page') {
    const selected = messages.filter((row) => row.conversation_id === args.p_conversation_id &&
      (!args.p_before || row.created_at < args.p_before ||
        (args.p_before_id && row.created_at === args.p_before && row.id < args.p_before_id)))
      .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
    body = selected.slice(-Number(args.p_limit ?? 60)).reverse();
  } else if (name === 'conversation_pins') body = [];
  else if (name === 'saved_messages') {
    if (failNextSavedRead) {
      failNextSavedRead = false;
      return route.fulfill({ status: 503, headers, body: JSON.stringify({ code: '08006', message: 'mock saved read failed' }) });
    }
    const row = initial[0];
    body = [{ message_id: row.id, conversation_id: cid, body: row.body, media_name: '', kind: 'text', created_at: row.created_at }];
  } else if (name === 'search_messages') {
    if (failNextSearch) {
      failNextSearch = false;
      return route.fulfill({ status: 503, headers, body: JSON.stringify({ code: '08006', message: 'mock search failed' }) });
    }
    const row = initial[1];
    body = args.p_query === 'deep needle' ? [{ message_id: row.id, conversation_id: cid, sender_uid: row.sender_uid,
      body: 'Find deep history', created_at: row.created_at }] : [];
  } else if (name === 'unread_message_count') body = 0;
  else if (name === 'mark_message_read' || name === 'mark_conversation_read' || name === 'record_vital') body = null;
  else if (name === 'record_media_asset') body = [{ id: 'asset-browser' }];
  else if (name === 'send_message_once') {
    attempts.push(args);
    let row = sentByKey.get(args.p_client_id);
    if (!row) {
      row = makeRow(`aaaaaaaa-aaaa-4aaa-8aaa-${String(sentByKey.size + 1).padStart(12, '0')}`,
        args.p_conversation_id, uid, args.p_body, new Date().toISOString());
      row.client_id = args.p_client_id;
      row.kind = args.p_kind;
      row.media_url = args.p_media_url;
      row.media_name = args.p_media_name;
      row.reply_to = args.p_reply_to;
      sentByKey.set(args.p_client_id, row);
      messages.push(row);
    }
    if (failNextAfterCommit) {
      failNextAfterCommit = false;
      return route.fulfill({ status: 503, headers, body: JSON.stringify({ code: '08006', message: 'mock lost response' }) });
    }
    body = row;
  } else if (name === 'conversation_members') {
    const target = url.searchParams.get('conversation_id')?.replace('eq.', '');
    if (request.method() === 'PATCH') {
      if (failNextDraftWrite && Object.hasOwn(args, 'draft_body')) {
        failNextDraftWrite = false;
        return route.fulfill({ status: 503, headers, body: JSON.stringify({ code: '08006', message: 'mock draft write failed' }) });
      }
      const value = state.get(target);
      if (value) Object.assign(value, args);
      body = [{ uid }];
    } else if (url.searchParams.get('select')?.includes('is_pinned')) {
      assert.equal(url.searchParams.get('uid'), `eq.${uid}`, 'settings must be scoped to the current user');
      body = [...state].map(([conversation_id, value]) => ({ conversation_id, ...value }));
    } else {
      const person = target === otherId ? carol : bob;
      body = [uid, person].map((member) => ({ conversation_id: target, uid: member, role: 'member',
        joined_at: '2026-01-01T00:00:00Z', last_read_at: '2025-01-01T00:00:00Z', muted_until: null,
        left_at: null, profiles: profiles[member] }));
    }
  } else if (name === 'profiles') body = Object.values(profiles);
  else if (name === 'notifications') body = [];
  else if (name === 'messages' && request.method() === 'PATCH') {
    const id = url.searchParams.get('id')?.replace('eq.', '');
    const row = messages.find((item) => item.id === id);
    if (row) Object.assign(row, args);
    body = row ? [{ id }] : [];
  }
  return route.fulfill({ status: 200, headers, body: JSON.stringify(body) });
}
async function check(name, fn) { await fn(); console.log(`PASS ${name}`); }
try {
  for (const [name, options] of [
    ['320px phone', { ...devices['Pixel 7'], viewport: { width: 320, height: 640 } }],
    ['375px phone', { ...devices['Pixel 7'], viewport: { width: 375, height: 760 } }],
    ['desktop', { viewport: { width: 1280, height: 900 } }],
  ]) {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH ?? await bundled.executablePath(),
      args: bundled.args.filter((arg) => !arg.includes('disable-web-security') && !arg.includes('allow-running-insecure-content') && !arg.includes('disable-site-isolation-trials')),
      env: { ...process.env, LD_LIBRARY_PATH: libraryPath }, headless: true });
    const context = await browser.newContext({ ...options, serviceWorkers: 'block', reducedMotion: 'reduce' });
    await context.addInitScript(() => { if (!localStorage.getItem('bsdc.language')) localStorage.setItem('bsdc.language', 'en'); });
    await context.route('**/*', routeHandler);
    const page = await context.newPage();
    activePage = page;
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${origin}/scripts/browser/fixtures/messenger.html?path=/messages/${cid}`, { waitUntil: 'domcontentloaded' });
    const input = page.getByLabel('Write a message');
    await input.waitFor({ timeout: 20000 });
    await page.getByRole('region', { name: 'Conversation' }).getByText('History message 84', { exact: true }).waitFor();
    await check(`${name}: thread scrolls and the composer and header remain within the viewport`, async () => {
      const layout = await page.evaluate(() => {
        const input = document.querySelector('#message-composer');
        const scroller = document.querySelector('.fab-scroll.overflow-y-auto');
        const send = document.querySelector('button[aria-label="Send"]');
        const header = document.querySelector('header');
        const i = input.getBoundingClientRect(); const b = send.getBoundingClientRect(); const h = header.getBoundingClientRect();
        return { viewport: innerWidth, width: document.documentElement.scrollWidth,
          inputBottom: i.bottom, sendBottom: b.bottom, headerTop: h.top, height: innerHeight,
          scrollHeight: scroller.scrollHeight, clientHeight: scroller.clientHeight };
      });
      assert(layout.width <= layout.viewport, `horizontal overflow: ${JSON.stringify(layout)}`);
      assert(layout.sendBottom <= layout.height && layout.inputBottom <= layout.height && layout.headerTop >= 0, `controls clipped: ${JSON.stringify(layout)}`);
      assert(layout.scrollHeight > layout.clientHeight, 'long history must scroll inside the thread');
      assert(await page.getByRole('button', { name: 'Send', exact: true }).isVisible());
    });
    await check(`${name}: unread divider appears after a delayed conversation-state response`, async () => {
      await page.getByText('New messages', { exact: true }).waitFor();
    });
    await check(`${name}: text sends via the visible button`, async () => {
      const text = `${name} working send`;
      await input.fill(text);
      await Promise.all([
        page.waitForResponse((response) => response.url().endsWith('/rpc/send_message_once') &&
          response.request().postDataJSON()?.p_body === text && response.status() === 200),
        page.getByRole('button', { name: 'Send', exact: true }).click(),
      ]);
      await page.getByText(text, { exact: true }).waitFor();
      assert.equal(await input.inputValue(), '');
      assert(attempts.some((entry) => entry.p_body === text));
    });
    if (name === '320px phone') {
      await check('phone: failed response can be retried without duplicating the committed message', async () => {
        failNextAfterCommit = true;
        await input.fill('Ambiguous connection failure');
        await page.getByRole('button', { name: 'Send', exact: true }).click();
        const retry = page.getByRole('button', { name: 'Try again', exact: true });
        await retry.waitFor();
        await Promise.all([
          page.waitForResponse((response) => response.url().endsWith('/rpc/send_message_once') && response.status() === 200),
          retry.click(),
        ]);
        await retry.waitFor({ state: 'detached' });
        const relevant = attempts.filter((entry) => entry.p_body === 'Ambiguous connection failure');
        assert.equal(relevant.length, 2);
        assert.equal(relevant[0].p_client_id, relevant[1].p_client_id);
        assert.equal(messages.filter((row) => row.body === 'Ambiguous connection failure').length, 1);
      });
      await check('phone: menu exposes message reply and reaction actions on touch', async () => {
        const line = page.locator('[id^="message-"]').filter({ hasText: 'Ambiguous connection failure' }).first();
        const menu = line.getByRole('button', { name: 'More actions' });
        await menu.click();
        assert(await line.getByRole('menuitem', { name: 'Reply' }).isVisible());
        await line.getByRole('menuitem', { name: 'Reply' }).click();
        assert(await page.getByText(/Replying to/).isVisible());
        await page.getByRole('button', { name: 'Cancel reply' }).click();
      });
      await check('phone: action menus stay inside the scrollable thread at both edges', async () => {
        const scroller = page.locator('.fab-scroll.overflow-y-auto');
        const assertMenuFits = async (line) => {
          await line.getByRole('button', { name: 'More actions' }).click();
          const menu = line.getByRole('menu');
          await menu.waitFor();
          const box = await menu.boundingBox();
          const bounds = await scroller.boundingBox();
          assert(box && bounds, 'menu and scroller must be visible');
          assert(box.x >= 0 && box.x + box.width <= options.viewport.width, `menu overflows horizontally: ${JSON.stringify(box)}`);
          assert(box.y >= bounds.y - 1 && box.y + box.height <= bounds.y + bounds.height + 1,
            `menu clipped by thread: ${JSON.stringify({ box, bounds })}`);
          await page.keyboard.press('Escape');
          await menu.waitFor({ state: 'detached' });
        };
        await scroller.evaluate((element) => { element.scrollTop = 0; });
        await assertMenuFits(scroller.locator('[id^="message-"]').first());
        await scroller.evaluate((element) => { element.scrollTop = element.scrollHeight; });
        await assertMenuFits(scroller.locator('[id^="message-"]').last());
      });
      await check('phone: older history loads without losing the scroll position', async () => {
        const scroller = page.locator('.fab-scroll.overflow-y-auto');
        await scroller.evaluate((element) => { element.scrollTop = 0; });
        const anchor = await scroller.evaluate((element) => {
          const first = element.querySelector('[id^="message-"]');
          return { id: first.id, top: first.getBoundingClientRect().top };
        });
        const before = records.length;
        await page.getByRole('button', { name: 'Load older messages' }).click();
        await page.getByText('History message 1', { exact: true }).waitFor();
        await page.waitForFunction(() => document.querySelector('[data-message-scroller]').scrollTop > 0);
        const request = records.slice(before).find((record) => record.name === 'conversation_messages_page');
        assert(request?.args.p_before && request?.args.p_before_id, 'history request must include both cursor fields');
        const anchorTop = await page.locator(`[id="${anchor.id}"]`).evaluate((element) => element.getBoundingClientRect().top);
        assert(Math.abs(anchorTop - anchor.top) <= 2,
          `loading older messages should preserve the same visible line: ${JSON.stringify({ before: anchor.top, after: anchorTop })}`);
      });
      await check('phone: replying while editing restores the unsent draft', async () => {
        await input.fill('Draft before editing');
        const mine = page.locator('[id^="message-"]').filter({ hasText: 'History message 84' }).first();
        await mine.getByRole('button', { name: 'More actions' }).click();
        await mine.getByRole('menuitem', { name: 'Edit', exact: true }).click();
        assert.equal(await input.inputValue(), 'History message 84');
        const incoming = page.locator('[id^="message-"]').filter({ hasText: 'History message 83' }).first();
        await incoming.getByRole('button', { name: 'More actions' }).click();
        await incoming.getByRole('menuitem', { name: 'Reply', exact: true }).click();
        assert.equal(await input.inputValue(), 'Draft before editing');
        await page.getByRole('button', { name: 'Cancel reply' }).click();
      });
      await check('phone: unsupported attachments show an error and preserve the caption', async () => {
        await input.fill('Caption should stay');
        await page.locator('input[type="file"]').last().setInputFiles({
          name: 'unsupported.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('not a supported file'),
        });
        await page.getByText('That file type is not supported.', { exact: true }).waitFor();
        assert.equal(await input.inputValue(), 'Caption should stay');
        assert(await input.isEnabled());
      });
      await check('phone: a failed image send retries without uploading the image twice', async () => {
        const beforeUploads = uploads.length;
        failNextAfterCommit = true;
        await input.fill('Photo attached');
        const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
        await page.locator('input[type="file"]').last().setInputFiles({
          name: 'photo.png', mimeType: 'image/png', buffer: tinyPng,
        });
        const retry = page.getByRole('button', { name: 'Try again', exact: true });
        await retry.waitFor();
        assert.equal(await input.inputValue(), '', 'the caption is preserved in the queued attachment');
        assert.equal(uploads.length - beforeUploads, 1);
        assert(records.some((record) => record.name === 'record_media_asset'));
        await Promise.all([
          page.waitForResponse((response) => response.url().endsWith('/rpc/send_message_once') && response.status() === 200),
          retry.click(),
        ]);
        await retry.waitFor({ state: 'detached' });
        const attemptsForFile = attempts.filter((entry) => entry.p_media_name === 'photo.png');
        assert.equal(attemptsForFile.length, 2);
        assert.equal(attemptsForFile[0].p_client_id, attemptsForFile[1].p_client_id);
        assert.equal(attemptsForFile[0].p_media_url, attemptsForFile[1].p_media_url);
        assert.equal(uploads.length - beforeUploads, 1, 'retry must reuse the uploaded URL');
      });
      await check('phone: drafts survive fast switches between conversations', async () => {
        await input.fill('Draft for Bob');
        const stateReadsBefore = records.filter((record) => record.name === 'conversation_state').length;
        await page.getByRole('link', { name: 'Back to the inbox' }).click();
        await page.getByRole('link', { name: /Carol Hasan/ }).waitFor();
        assert.equal(records.filter((record) => record.name === 'conversation_state').length, stateReadsBefore,
          'opening the inbox should use the bulk settings query, not fetch each row');
        await page.getByRole('link', { name: /Carol Hasan/ }).click();
        await page.getByLabel('Write a message').fill('Draft for Carol');
        await page.getByRole('link', { name: 'Back to the inbox' }).click();
        await page.getByRole('link', { name: /Bob Rahman/ }).click();
        assert.equal(await page.getByLabel('Write a message').inputValue(), 'Draft for Bob');
        await page.getByRole('link', { name: 'Back to the inbox' }).click();
        await page.getByRole('link', { name: /Carol Hasan/ }).click();
        assert.equal(await page.getByLabel('Write a message').inputValue(), 'Draft for Carol');
        await page.getByRole('link', { name: 'Back to the inbox' }).click();
      });
      await check('phone: pin and archive filters follow the saved settings', async () => {
        await page.getByRole('button', { name: 'Actions for Bob Rahman' }).click();
        await page.getByRole('menuitem', { name: 'Pin this conversation' }).click();
        await page.getByRole('button', { name: 'Pinned', exact: true }).click();
        await page.getByRole('link', { name: /Bob Rahman/ }).waitFor();
        assert.equal(await page.getByRole('link', { name: /Carol Hasan/ }).count(), 0);
        await page.getByRole('button', { name: 'All', exact: true }).click();
        await page.getByRole('button', { name: 'Actions for Carol Hasan' }).click();
        await page.getByRole('menuitem', { name: 'Archive', exact: true }).click();
        await page.getByRole('button', { name: 'Archived', exact: true }).click();
        await page.getByRole('link', { name: /Carol Hasan/ }).waitFor();
        assert.equal(await page.getByRole('link', { name: /Bob Rahman/ }).count(), 0);
        await page.getByRole('button', { name: 'Actions for Carol Hasan' }).click();
        await page.getByRole('menuitem', { name: 'Move out of the archive' }).click();
        await page.getByRole('button', { name: 'All', exact: true }).click();
        await page.getByRole('link', { name: /Bob Rahman/ }).click();
      });
      await check('phone: failed draft saving is visible and retryable', async () => {
        const composer = page.getByLabel('Write a message');
        failNextDraftWrite = true;
        await composer.fill('Please save this draft');
        const warning = page.getByRole('status').filter({ hasText: 'Draft not saved' });
        await warning.waitFor();
        assert.equal(await composer.inputValue(), 'Please save this draft');
        await Promise.all([
          page.waitForResponse((response) => response.request().method() === 'PATCH' &&
            response.url().includes('/conversation_members') && response.status() === 200 &&
            response.request().postDataJSON()?.draft_body === 'Please save this draft', { timeout: 15000 }),
          warning.getByRole('button', { name: 'Try again' }).click({ timeout: 15000 }),
        ]);
        await warning.waitFor({ state: 'detached' });
        assert.equal(state.get(cid).draft_body, 'Please save this draft');
      });
      await check('phone: saved and search results retry errors and jump to the right older line', async () => {
        const assertScrolledTo = async (id) => {
          await page.waitForFunction((target) => {
            const item = document.getElementById(`message-${target}`);
            const scroller = document.querySelector('[data-message-scroller]');
            if (!item || !scroller) return false;
            const row = item.getBoundingClientRect(); const bounds = scroller.getBoundingClientRect();
            return row.top >= bounds.top && row.bottom <= bounds.bottom;
          }, id, { timeout: 15000 });
        };
        await page.getByRole('link', { name: 'Back to the inbox' }).click();
        failNextSavedRead = true;
        await page.getByRole('button', { name: 'Saved', exact: true }).click();
        await page.getByText('Saved messages could not be loaded.').waitFor();
        await page.getByRole('button', { name: 'Try again' }).click();
        await page.getByRole('link', { name: /History message 1/ }).click();
        await assertScrolledTo(initial[0].id);
        await page.getByRole('link', { name: 'Back to the inbox' }).click();
        await page.getByRole('button', { name: 'Search every conversation' }).click();
        failNextSearch = true;
        await page.getByPlaceholder('Search every conversation').fill('deep needle');
        await page.getByText('Search could not be completed.').waitFor();
        await page.getByRole('alert').filter({ hasText: 'Search could not be completed.' })
          .getByRole('button', { name: 'Try again' }).click();
        await page.getByRole('link', { name: /Find deep history/ }).click();
        await assertScrolledTo(initial[1].id);
      });
      await check('phone: composer and conversation actions work in Bengali', async () => {
        await page.evaluate(() => localStorage.setItem('bsdc.language', 'bn'));
        await page.reload();
        await page.getByLabel('কথোপকথনের বিকল্প').waitFor();
        const loadedFaces = await page.evaluate(async () => (await document.fonts.load('16px "BSDC Bengali"', 'বাংলা')).length);
        assert(loadedFaces > 0, 'the self-hosted Bengali font must actually load');
        await page.getByLabel('কথোপকথনের বিকল্প').click();
        assert(await page.getByRole('menuitem', { name: 'নীরব করুন' }).isVisible());
      });
    }
    await check(`${name}: no uncaught page exceptions`, async () => assert.deepEqual(errors, []));
    await page.screenshot({ path: join(output, `messenger-${name.replaceAll(' ', '-')}.png`), fullPage: true });
    await context.close();
    await browser.close();
  }
  assert(records.some((entry) => entry.name === 'conversation_members' && entry.search.includes('uid=')));
  console.log('Messenger browser smoke uses mocked providers; it does not prove live Firebase, Supabase, Realtime or media.');
} catch (error) {
  if (activePage) await activePage.screenshot({ path: join(output, 'messenger-failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser?.close();
  await server.close();
  if (extractedLibraries !== null) await rm(extractedLibraries, { recursive: true, force: true });
}
