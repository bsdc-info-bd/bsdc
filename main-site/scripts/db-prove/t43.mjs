/** Column grants must protect secrets even when RLS permits the public row. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeDb, MIGRATIONS_DIR } from './lib.mjs';

const db = await makeDb();
let checks = 0;
async function run(uid, sql) {
  try {
    const role = uid ? 'authenticated' : 'anon';
    const claims = JSON.stringify({ sub: uid ?? '', role, bsdc_role: 'member' });
    await db.exec(`set role ${role}; select set_config('request.jwt.claims', '${claims}', false)`);
    return (await db.query(sql)).rows;
  } finally {
    await db.exec('reset role');
  }
}
async function denied(uid, sql) {
  await assert.rejects(() => run(uid, sql), { code: '42501' });
  checks++;
}
try {
  await db.exec(`
    insert into public.profiles (uid, username, display_name) values
      ('host', 'columnhost', 'Host'), ('guest', 'columnguest', 'Guest');
    insert into public.media_assets (owner_uid, provider, kind, url, delete_token)
      values ('host', 'imgbb', 'image', 'https://example.invalid/image.png', 'SECRET-DELETE');
    insert into public.events (slug, title, host_uid, join_url, starts_at, ends_at)
      values ('column-event', 'Column Event', 'host', 'https://example.invalid/SECRET-JOIN',
        now() + interval '1 day', now() + interval '2 days');
  `);
  for (const uid of [null, 'guest', 'host']) {
    for (const sql of [
      'select * from public.media_assets',
      'select delete_token from public.media_assets',
      "select id from public.media_assets where delete_token <> ''",
      'select * from public.events',
      'select join_url from public.events',
      'select slug from public.events order by join_url',
    ])
      await denied(uid, sql);
    assert.equal((await run(uid, 'select id, url, thumb_url from public.media_assets')).length, 1);
    assert.equal((await run(uid, 'select slug, title from public.events')).length, 1);
    const detail = await run(uid, "select join_url from public.event_detail('column-event')");
    assert.equal(detail[0].join_url, uid === 'host' ? 'https://example.invalid/SECRET-JOIN' : '');
    checks += 3;
  }
  await db.exec(`insert into public.event_rsvps (event_id, uid, status)
    select id, 'guest', 'going' from public.events where slug = 'column-event'`);
  assert.equal(
    (await run('guest', "select join_url from public.event_detail('column-event')"))[0].join_url,
    'https://example.invalid/SECRET-JOIN',
  );
  checks++;
  await db.exec(`update public.event_rsvps set status = 'interested' where uid = 'guest'`);
  assert.equal(
    (await run('guest', "select join_url from public.event_detail('column-event')"))[0].join_url,
    '',
  );
  checks++;
  // Upload recording may persist a credential, but its returning projection is safe.
  const recorded = await run(
    'guest',
    `insert into public.media_assets
    (owner_uid, provider, kind, url, delete_token) values
    ('guest', 'imgbb', 'image', 'https://example.invalid/new.png', 'NEW-SECRET')
    returning id, owner_uid, url`,
  );
  assert.equal(recorded[0].owner_uid, 'guest');
  checks++;
  // Event creation still supports the current browser's RETURNING slug contract.
  assert.equal(
    (
      await run(
        'host',
        `insert into public.events
    (slug, title, host_uid, join_url, starts_at, ends_at) values
    ('second-event', 'Second Event', 'host', 'https://example.invalid/secret',
      now() + interval '1 day', now() + interval '2 days') returning slug`,
      )
    )[0].slug,
    'second-event',
  );
  checks++;
  for (let i = 0; i < 2; i++) {
    await db.exec(
      readFileSync(join(MIGRATIONS_DIR, '0070_private_columns_are_not_public_reads.sql'), 'utf8'),
    );
    await denied('guest', 'select delete_token from public.media_assets');
    await denied('guest', 'select join_url from public.events');
  }
  console.log(`SUMMARY: ${checks} passed, 0 failed`);
} finally {
  await db.close();
}
