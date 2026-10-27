/** Raw-table regression: every child read follows the caller's parent RLS. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeDb, MIGRATIONS_DIR } from './lib.mjs';

const db = await makeDb();
let checks = 0;
const children = ['post_tags', 'post_media', 'post_mentions', 'poll_options', 'poll_votes'];
async function readAs(uid, sql) {
  try {
    const role = uid ? 'authenticated' : 'anon';
    const claims = JSON.stringify({ sub: uid ?? '', role, bsdc_role: 'member' });
    await db.exec(`set role ${role}; select set_config('request.jwt.claims', '${claims}', false)`);
    return (await db.query(sql)).rows;
  } finally {
    await db.exec('reset role');
  }
}
async function visible(uid, id, expected, label) {
  for (const table of children) {
    const rows = await readAs(uid, `select * from public.${table} where post_id = '${id}'`);
    assert.equal(rows.length, expected, `${label}: ${table}`);
    checks++;
  }
  console.log(`ok    ${label} (${children.length} tables)`);
}
try {
  await db.exec(`
    insert into public.profiles (uid, username, display_name) values
      ('author', 'privacyauthor', 'Author'), ('reader', 'privacyreader', 'Reader'),
      ('stranger', 'privacystranger', 'Stranger');
    insert into public.tags (slug, label_en) values ('privacy', 'Privacy');
  `);
  const groupId = (
    await readAs(
      'author',
      `select public.create_group('child-privacy', 'Child Privacy', 'Private', 'private', 'en') as id`,
    )
  )[0].id;
  await db.exec(
    `insert into public.group_members (group_id, uid, role) values ('${groupId}', 'reader', 'member')`,
  );
  const channel = (
    await db.query(`select id from public.channels where group_id = '${groupId}' limit 1`)
  ).rows[0].id;
  const media = (
    await db.query(`insert into public.media_assets (owner_uid, provider, kind, url)
    values ('author', 'imgbb', 'image', 'https://example.invalid/private.png') returning id`)
  ).rows[0].id;
  const ids = {};
  for (const [name, status, visibility, channelId] of [
    ['public', 'published', 'public', null],
    ['draft', 'draft', 'public', null],
    ['followers', 'published', 'followers', null],
    ['channel', 'published', 'public', channel],
  ]) {
    const id = (
      await db.query(`insert into public.posts
      (author_uid, kind, slug, title, body, status, visibility, published_at, channel_id)
      values ('author', 'poll', 'child-${name}', 'Private title', 'Private body', '${status}', '${visibility}', now(),
        ${channelId ? `'${channelId}'` : 'null'}) returning id`)
    ).rows[0].id;
    ids[name] = id;
    await db.exec(`
      insert into public.post_tags values ('${id}', 'privacy');
      insert into public.post_media (post_id, media_id, alt_text) values ('${id}', '${media}', 'Secret caption');
      insert into public.post_mentions values ('${id}', 'reader');
      insert into public.poll_options (post_id, position, label) values ('${id}', 0, 'Secret option');
      insert into public.poll_votes (post_id, voter_uid, option_id)
        select '${id}', 'reader', id from public.poll_options where post_id = '${id}';
    `);
  }
  // Reproduce the pre-fix leak using the otherwise identical schema.
  for (const table of children) {
    await db.exec(`drop policy post_parent_read_guard on public.${table}`);
  }
  await visible('stranger', ids.draft, 1, 'pre-fix private draft children leak to stranger');
  await db.exec(readFileSync(join(MIGRATIONS_DIR, '0069_post_child_read_privacy.sql'), 'utf8'));
  for (const uid of [null, 'stranger']) {
    await visible(uid, ids.public, 1, `${uid ?? 'anonymous'} reads public children`);
    for (const name of ['draft', 'followers', 'channel']) {
      await visible(uid, ids[name], 0, `${uid ?? 'anonymous'} cannot read ${name} children`);
    }
  }
  await visible('reader', ids.channel, 1, 'group member reads channel children');
  await visible('reader', ids.draft, 0, 'mention and vote do not grant draft access');
  for (const id of Object.values(ids)) await visible('author', id, 1, 'author reads own children');
  await db.exec(
    `insert into public.follows (follower_uid, followee_uid) values ('reader', 'author')`,
  );
  await visible('reader', ids.followers, 1, 'follower reads follower-only children');
  await db.exec(
    `delete from public.group_members where group_id = '${groupId}' and uid = 'reader'`,
  );
  await visible('reader', ids.channel, 0, 'membership removal immediately hides children');
  await db.exec(`update public.posts set deleted_at = now() where id = '${ids.public}'`);
  await visible('stranger', ids.public, 0, 'trash hides previously public children');
  await visible('author', ids.public, 1, 'author can recover trashed children');
  // Even the permissive author FOR ALL policy cannot bypass the parent guard.
  await db.exec(`update public.posts set status = 'removed' where id = '${ids.draft}'`);
  await visible('author', ids.draft, 0, 'removed parent hides children even from author');
  for (let i = 0; i < 2; i++) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, '0069_post_child_read_privacy.sql'), 'utf8'));
    checks++;
  }
  console.log(`SUMMARY: ${checks} passed, 0 failed`);
} finally {
  await db.close();
}
