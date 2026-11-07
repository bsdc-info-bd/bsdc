/** Messenger delivery, privacy and membership boundaries, on a real PGlite database. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { as, asAnon, expectFail, makeDb, MIGRATIONS_DIR, summary } from './lib.mjs';

const ada = 'messenger-ada';
const bob = 'messenger-bob';
const eve = 'messenger-eve';
const dana = 'messenger-dana';
const db = await makeDb({ skip: ['0082_'] });
let failures = 0;
function check(value, label) {
  if (value) console.log(`ok    ${label}`);
  else { failures += 1; console.log(`FAIL  ${label}`); }
}
try {
  await db.exec(`insert into public.profiles (uid, username, display_name) values
    ('${ada}','msg_ada','Ada'), ('${bob}','msg_bob','Bob'),
    ('${eve}','msg_eve','Eve'), ('${dana}','msg_dana','Dana');`);
  const direct = (await as(db, ada, `select public.open_direct_conversation('${bob}') as id`, 'Ada opens Bob’s direct thread')).rows[0].id;
  const other = (await as(db, eve, `select public.open_direct_conversation('${dana}') as id`, 'Eve opens an unrelated thread')).rows[0].id;
  const secret = (await as(db, eve, `select (public.send_message('${other}', 'other conversation secret')).id as id`, 'Eve sends a private line')).rows[0].id;
  const legacy = (await as(db, ada, `select (public.send_message('${direct}', 'legacy cross-thread reply', p_reply_to := '${secret}')).id as id`, 'reproduce legacy cross-thread reply')).rows[0].id;
  await db.exec(`update public.conversation_members set draft_body='Ada private draft' where uid='${ada}' and conversation_id='${direct}';`);
  const migration = readFileSync(join(MIGRATIONS_DIR, '0082_messenger_delivery_and_privacy.sql'), 'utf8');
  await db.exec(migration);
  await db.exec(migration);
  check(true, '0082 applies and reapplies');

  await expectFail(db, bob, `select draft_body from public.conversation_members where uid='${ada}'`, '42501', 'other members cannot select draft text');
  const own = await as(db, ada, `select draft_body from public.conversation_state('${direct}')`, 'own draft is returned by the scoped RPC');
  check(own.rows[0].draft_body === 'Ada private draft', 'own draft remains intact after upgrade');
  const bobState = await as(db, bob, `select draft_body from public.conversation_state('${direct}')`, 'Bob sees only Bob’s state');
  check(bobState.rows[0].draft_body === '', 'Bob cannot read Ada’s draft through state RPC');
  await as(db, ada, `update public.conversation_members set draft_body='New draft' where conversation_id='${direct}' and uid='${ada}'`, 'own draft remains writable');
  const quote = await as(db, bob, `select reply_body, reply_sender from public.conversation_messages('${direct}') where id='${legacy}'`, 'legacy reply can still be rendered');
  check(quote.rows[0].reply_body === null && quote.rows[0].reply_sender === null, 'legacy foreign quote is redacted');
  await expectFail(db, ada, `select public.send_message('${direct}', 'cross-thread', p_reply_to := '${secret}')`, '22023', 'legacy sender cannot make a cross-thread reply');
  await expectFail(db, ada, `select public.send_message_once('${direct}', '00000000-0000-4000-8000-000000000001', 'cross-thread', p_reply_to := '${secret}')`, '22023', 'new sender cannot make a cross-thread reply');

  const key = '11111111-1111-4111-8111-111111111111';
  const send = `select (public.send_message_once('${direct}', '${key}', 'hello once')).id as id`;
  const first = await as(db, ada, send, 'first delivery succeeds');
  const second = await as(db, ada, send, 'retry with the same key succeeds');
  check(first.rows[0].id === second.rows[0].id, 'retry returns the original message id');
  const delivered = await as(db, ada, `select client_id from public.conversation_messages_page('${direct}') where id='${first.rows[0].id}'`, 'delivered row exposes its request key');
  check(delivered.rows[0].client_id === key, 'sender can reconcile a lost HTTP response with a delivered row');
  await expectFail(db, ada, `update public.messages set client_id='00000000-0000-4000-8000-000000000099' where id='${first.rows[0].id}'`, '42501', 'members cannot rewrite a delivery request key');
  check((await db.query(`select count(*)::int as n from public.messages where conversation_id='${direct}' and body='hello once'`)).rows[0].n === 1, 'retry produces exactly one row');
  await expectFail(db, ada, `select public.send_message_once('${direct}', '${key}', 'changed text')`, '22023', 'key reuse with changed content is rejected');
  await expectFail(db, eve, `select public.send_message_once('${direct}', '${key}', 'hello once')`, '42501', 'non-member cannot send or replay');
  await asAnon(db, `select 1`, 'anonymous database session is available');
  await expectFail(db, ada, `select * from bsdc.message_send_requests`, '42501', 'request ledger is not member-readable');

  const reply = (await as(db, bob, `select (public.send_message_once('${direct}', '${key}', 'reply once', p_reply_to := '${first.rows[0].id}')).id as id`, 'another sender may use the same random key')).rows[0].id;
  await as(db, ada, `update public.messages set body='', deleted_at=now() where id='${first.rows[0].id}'`, 'text deletion creates a tombstone');
  const deleted = await as(db, bob, `select deleted_at is not null as deleted from public.conversation_messages('${direct}') where id='${first.rows[0].id}'`, 'recipient can see the tombstone');
  check(deleted.rows[0].deleted === true, 'deleted text is retained as a tombstone');
  await db.exec(`delete from public.messages where id='${first.rows[0].id}';`);
  await expectFail(db, ada, send, '22023', 'hard deletion cannot turn the same request into a second message');

  // Several messages can share one transaction timestamp. Walk small pages to
  // prove the UUID tiebreaker neither drops nor repeats rows at the boundary.
  const tiedIds = Array.from({ length: 7 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
  await db.exec(`insert into public.messages (id, conversation_id, sender_uid, body, created_at) values ${tiedIds.map((id) => `('${id}', '${direct}', '${ada}', 'same timestamp', '2099-01-01T00:00:00Z')`).join(',')}`);
  const seen = [];
  let before = 'null';
  let beforeId = 'null';
  for (let pageNumber = 0; pageNumber < 3; pageNumber += 1) {
    const page = await as(db, ada, `select id, created_at from public.conversation_messages_page('${direct}', ${before}, ${beforeId}, 3)`, `cursor page ${pageNumber + 1} is readable`);
    const tied = page.rows.filter((row) => tiedIds.includes(row.id));
    seen.push(...tied.map((row) => row.id));
    const tail = page.rows.at(-1);
    before = `'${tail.created_at.toISOString()}'::timestamptz`;
    beforeId = `'${tail.id}'::uuid`;
  }
  check(JSON.stringify(seen) === JSON.stringify([...tiedIds].reverse()), 'tied timestamps paginate without omissions or duplicates');
  const noLeak = await as(db, eve, `select id from public.conversation_messages_page('${direct}')`, 'non-member page request is empty');
  check(noLeak.rows.length === 0, 'cursor RPC does not reveal another conversation');

  const group = (await as(db, ada, `select public.create_group_conversation('Ada group', array['${bob}']) as id`, 'Ada creates a group')).rows[0].id;
  const foreignGroup = (await as(db, eve, `select public.create_group_conversation('Eve group', array['${dana}']) as id`, 'Eve creates a different group')).rows[0].id;
  await expectFail(db, ada, `insert into public.conversation_members (conversation_id, uid) values ('${foreignGroup}', '${ada}')`, '42501', 'admin of one group cannot join an unrelated group');
  await expectFail(db, ada, `insert into public.conversation_members (conversation_id, uid) values ('${direct}', '${eve}')`, '42501', 'direct threads cannot be expanded to include strangers');
  await as(db, ada, `insert into public.conversation_members (conversation_id, uid) values ('${group}', '${dana}')`, 'group owner can invite a member');
  await expectFail(db, ada, `insert into public.conversation_members (conversation_id, uid, role) values ('${group}', '${eve}', 'owner')`, '42501', 'group invite cannot mint a new owner');
  await as(db, dana, `select public.leave_conversation('${group}')`, 'member leaves the group');
  const leftState = await as(db, dana, `select * from public.conversation_state('${group}')`, 'left member requests their old state');
  check(leftState.rows.length === 0, 'left member cannot continue opening the conversation');
  const leftPage = await as(db, dana, `select id from public.conversation_messages_page('${group}')`, 'left member requests old messages');
  check(leftPage.rows.length === 0, 'left member cannot read the message page');

  await db.exec(`update public.messages set created_at='2026-01-01 10:00:00+00' where id='${reply}';
    update public.conversation_members set last_read_at='1970-01-01' where uid='${ada}' and conversation_id='${direct}';`);
  await as(db, ada, `select public.mark_message_read('${reply}')`, 'mark one message read');
  check((await db.query(`select last_read_at='2026-01-01 10:00:00+00'::timestamptz as ok from public.conversation_members where uid='${ada}' and conversation_id='${direct}'`)).rows[0].ok, 'receipt advances only to the observed message timestamp');
  await db.exec(`insert into public.blocks (blocker_uid, blocked_uid) values ('${bob}', '${ada}');`);
  await expectFail(db, ada, `select public.send_message('${direct}', 'blocked legacy')`, '42501', 'block stops legacy sends to an existing direct thread');
  await expectFail(db, ada, `select public.send_message_once('${direct}', '22222222-2222-4222-8222-222222222222', 'blocked')`, '42501', 'block stops new sends to an existing direct thread');
  await as(db, ada, `select public.send_message_once('${group}', '33333333-3333-4333-8333-333333333333', 'group still works')`, 'a block does not silently break a shared group');
} finally {
  await db.close();
}
process.exit(summary() + failures ? 1 : 0);
