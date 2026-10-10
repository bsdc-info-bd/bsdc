/**
 * Proof for 0051: the messenger is live.
 *
 * The failure case is the database as it is deployed today (without 0051):
 * nothing is in the `supabase_realtime` publication, so no client can
 * subscribe to anything, and there is no table for a reaction, a receipt, a
 * pin or a saved message.
 */
import { makeDb, as, summary } from './lib.mjs';

const ada = 'aaaaaaaa-1111-4111-8111-000000000001';
const rahim = 'bbbbbbbb-2222-4222-8222-000000000002';
const sultana = 'cccccccc-3333-4333-8333-000000000003';

let pass = 0;
const bad = [];
async function check(db, sql, expected, label, params) {
  try {
    const result = params ? await db.query(sql, params) : await db.query(sql);
    const got = result.rows[0] ? Object.values(result.rows[0])[0] : undefined;
    if (String(got) === String(expected)) {
      pass += 1;
      console.log(`ok    ${label}`);
    } else {
      bad.push(label);
      console.log(
        `FAIL  ${label}  -> got ${JSON.stringify(got)}, wanted ${JSON.stringify(expected)}`,
      );
    }
  } catch (e) {
    bad.push(label);
    console.log(`FAIL  ${label}  -> [${e.code ?? '?'}] ${String(e.message).split('\n')[0]}`);
  }
}

async function checkAs(db, uid, sql, expected, label) {
  await db.exec(
    `set role authenticated; select set_config('request.jwt.claims', ` +
      `'{"sub":"${uid}","role":"authenticated","bsdc_role":"member"}', false);`,
  );
  try {
    const result = await db.query(sql);
    const got = result.rows[0] ? Object.values(result.rows[0])[0] : undefined;
    if (String(got) === String(expected)) {
      pass += 1;
      console.log(`ok    ${label}`);
    } else {
      bad.push(label);
      console.log(
        `FAIL  ${label}  -> got ${JSON.stringify(got)}, wanted ${JSON.stringify(expected)}`,
      );
    }
  } catch (e) {
    bad.push(label);
    console.log(`FAIL  ${label}  -> [${e.code ?? '?'}] ${String(e.message).split('\n')[0]}`);
  } finally {
    await db.exec('reset role;');
  }
}

async function checkRefused(db, uid, sql, label) {
  await db.exec(
    `set role authenticated; select set_config('request.jwt.claims', ` +
      `'{"sub":"${uid}","role":"authenticated","bsdc_role":"member"}', false);`,
  );
  try {
    await db.query(sql);
    bad.push(label);
    console.log(`FAIL  ${label}  -> the statement succeeded`);
  } catch (e) {
    pass += 1;
    console.log(`ok    ${label}  (${e.code ?? '?'})`);
  } finally {
    await db.exec('reset role;');
  }
}

// ---------------------------------------------------------------------------
// Before: the deployed database has no change feed and nowhere to react
// ---------------------------------------------------------------------------
const before = await makeDb({ skip: ['0051_'] });
console.log('--- BEFORE 0051 ---');
const beforeTables = (
  await before.query(`
    select count(*)::int as c from information_schema.tables
    where table_schema = 'public'
      and table_name in ('message_reactions','message_receipts','message_pins','message_stars')
  `)
).rows[0].c;
const beforeFeed = (
  await before.query(
    `select count(*)::int as c from pg_publication_tables where pubname = 'supabase_realtime'`,
  )
).rows[0].c;
console.log(
  `react/receipt/pin/star tables: ${beforeTables}; tables in the change feed: ${beforeFeed}`,
);
await before.close();

// ---------------------------------------------------------------------------
// After
// ---------------------------------------------------------------------------
const db = await makeDb();
await db.exec(`
  insert into public.profiles (uid, display_name, username) values
    ('${ada}', 'Ada Lovelace', 'ada'),
    ('${rahim}', 'Rahim Uddin', 'rahim'),
    ('${sultana}', 'Sultana Razia', 'sultana');
`);

// --- part 1: the change feed -------------------------------------------------
await check(
  db,
  `select count(*)::int from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename in ('messages','conversations','conversation_members',
                        'message_reactions','message_receipts','message_pins','message_stars','notifications')`,
  8,
  'every table a client subscribes to is in the realtime publication',
);
await check(
  db,
  `select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('messages','conversations','conversation_members')
      and c.relreplident = 'f'`,
  3,
  'the subscribed tables publish the whole row, not just the key',
);

// --- part 2: a conversation, as the app builds it ---------------------------
const direct = (
  await as(
    db,
    ada,
    `select public.open_direct_conversation('${rahim}') as id`,
    'ada opens a direct chat',
  )
).rows[0].id;
const message = (
  await as(
    db,
    ada,
    `select (public.send_message('${direct}', 'hello there')).id as id`,
    'ada sends a line',
  )
).rows[0].id;
const reply = (
  await as(
    db,
    rahim,
    `select (public.send_message(p_conversation_id := '${direct}', p_body := 'and hello back',
       p_reply_to := '${message}')).id as id`,
    'rahim answers it',
  )
).rows[0].id;

// --- part 3: reactions -------------------------------------------------------
const first = await as(
  db,
  rahim,
  `select * from public.toggle_message_reaction('${message}', '❤️')`,
  'rahim reacts',
);
check(db, `select count(*)::int from public.message_reactions`, 1, 'one reaction is stored');
const second = await as(
  db,
  ada,
  `select * from public.toggle_message_reaction('${message}', '❤️')`,
  'ada reacts too',
);
check(
  db,
  `select count(*)::int from public.message_reactions`,
  2,
  'two members, one emoji, two rows',
);
const off = await as(
  db,
  rahim,
  `select * from public.toggle_message_reaction('${message}', '❤️')`,
  'rahim takes his back',
);
check(
  db,
  `select count(*)::int from public.message_reactions`,
  1,
  'taking a reaction back removes the row',
);
await checkRefused(
  db,
  sultana,
  `select * from public.toggle_message_reaction('${message}', '👍')`,
  'a stranger cannot react to a line they cannot read',
);
void first;
void second;
void off;

// --- part 4: receipts and the read marker -----------------------------------
await as(db, rahim, `select public.mark_message_read('${message}')`, 'rahim opens the thread');
check(
  db,
  `select count(*)::int from public.message_receipts where read_at is not null`,
  1,
  'the receipt is stamped read',
);
await checkAs(
  db,
  ada,
  `select read_by = array['${rahim}']::text[] from public.conversation_messages('${direct}') where id = '${message}'`,
  true,
  "ada's line is shown as read by rahim",
);
await checkAs(
  db,
  sultana,
  `select (select count(*)::int from public.message_receipts)`,
  0,
  'a non-member sees no receipts at all',
);

// --- part 5: pins and saved messages ----------------------------------------
await as(db, ada, `select public.toggle_message_pin('${message}')`, 'ada pins a line');
await checkAs(
  db,
  rahim,
  `select count(*)::int from public.conversation_pins('${direct}')`,
  1,
  'both members see the pin',
);
await checkAs(
  db,
  sultana,
  `select count(*)::int from public.conversation_pins('${direct}')`,
  0,
  'a stranger sees no pins',
);
await as(db, rahim, `select public.toggle_message_star('${message}')`, 'rahim saves a line');
await checkAs(
  db,
  rahim,
  `select count(*)::int from public.saved_messages()`,
  1,
  'the saver sees the saved line',
);
await checkAs(
  db,
  ada,
  `select count(*)::int from public.saved_messages()`,
  0,
  'saving is private to the saver',
);
await as(db, rahim, `select public.toggle_message_star('${message}')`, 'rahim unsaves it');
await checkAs(
  db,
  rahim,
  `select count(*)::int from public.saved_messages()`,
  0,
  'unsaving removes it',
);

// --- part 6: search ----------------------------------------------------------
await checkAs(
  db,
  ada,
  `select count(*)::int from public.search_messages('hello')`,
  2,
  'search finds both lines',
);
await checkAs(
  db,
  ada,
  `select count(*)::int from public.search_messages('hello', '${direct}')`,
  2,
  'search scopes to the thread',
);
await checkAs(
  db,
  sultana,
  `select count(*)::int from public.search_messages('hello')`,
  0,
  'a stranger finds nothing',
);

// --- part 7: the thread, in one read ----------------------------------------
await checkAs(
  db,
  ada,
  `select reactions -> '❤️' = '1'::jsonb
        and my_reactions = array['❤️']::text[]
        and pinned and starred = false
   from public.conversation_messages('${direct}') where id = '${message}'`,
  true,
  'the line carries its reactions, my reactions, its pin and its save',
);
await checkAs(
  db,
  ada,
  `select reply_body = 'hello there' and reply_sender = '${ada}'
   from public.conversation_messages('${direct}') where id = '${reply}'`,
  true,
  'a reply carries the line it answers',
);
await checkAs(
  db,
  sultana,
  `select count(*)::int from public.conversation_messages('${direct}')`,
  0,
  'a stranger reads no lines at all',
);

// --- part 8: member settings and drafts -------------------------------------
await checkAs(
  db,
  ada,
  `select count(*)::int from public.conversation_state('${direct}')`,
  1,
  'the member has a state row',
);
await as(
  db,
  ada,
  `update public.conversation_members set draft_body = 'half a thought', is_pinned = true,
     is_archived = true where conversation_id = '${direct}' and uid = '${ada}'`,
  'the member pins, archives and leaves a draft',
);
await checkAs(
  db,
  ada,
  `select draft_body = 'half a thought' and is_pinned and is_archived from public.conversation_state('${direct}')`,
  true,
  'the draft and the settings come back',
);
// RLS filters the row rather than raising, so the assertion is that nothing
// changed — the trap t20 taught, kept honest here.
await as(
  db,
  rahim,
  `update public.conversation_members set draft_body = 'not mine' where conversation_id = '${direct}' and uid = '${ada}'`,
  "rahim tries to write ada's row",
);
check(
  db,
  `select draft_body from public.conversation_members where conversation_id = '${direct}' and uid = '${ada}'`,
  'half a thought',
  "a member cannot write another member's row",
);

// --- part 9: direct table access is closed to everybody else -----------------
await checkAs(
  db,
  sultana,
  `select count(*)::int from public.message_reactions`,
  0,
  'a stranger sees no reaction rows',
);
await checkRefused(
  db,
  sultana,
  `insert into public.message_reactions (message_id, uid, reaction) values ('${message}', '${sultana}', '👍')`,
  'a stranger cannot insert a reaction row',
);
await checkRefused(
  db,
  sultana,
  `insert into public.message_stars (uid, message_id) values ('${rahim}', '${message}')`,
  'a member cannot save a line on somebody else',
);
// Anonymous holds no grant at all, so this is an error, not an empty list.
try {
  await db.exec(
    `set role anon; select set_config('request.jwt.claims', '{"sub":"","role":"anon"}', false);`,
  );
  await db.query(`select count(*)::int from public.message_reactions`);
  bad.push('anonymous cannot read reaction rows');
  console.log('FAIL  anonymous cannot read reaction rows  -> the statement succeeded');
} catch {
  console.log('ok    anonymous cannot read reaction rows  (42501)');
} finally {
  await db.exec('reset role;');
}
await checkRefused(
  db,
  ada,
  `insert into public.message_receipts (message_id, uid, read_at) values ('${message}', '${rahim}', now())`,
  'a member cannot mark somebody else read',
);

console.log('');
const libFails = summary();
console.log(`t21 checks: ${pass} passed, ${bad.length + libFails} failed`);
process.exit(bad.length + libFails === 0 ? 0 : 1);
