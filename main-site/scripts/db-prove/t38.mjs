/**
 * Proof for 0066: a reaction is a name, not a picture.
 *
 * The thread stored whatever string the client sent, and the client sent
 * emoji. That is data already in production, so this harness does not start
 * from an empty database. It builds the schema as it stands before 0066, plants
 * the emoji rows the old client wrote, applies 0066 exactly as the operator will,
 * and then asks what the database now holds and what it now refuses.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { as, asOwner, expectFail, makeDb, MIGRATIONS_DIR, summary } from './lib.mjs';

const ada = 'aaaaaaaa-1111-4111-8111-000000000001';
const rahim = 'bbbbbbbb-2222-4222-8222-000000000002';
const sultana = 'cccccccc-3333-4333-8333-000000000003';

// Everything up to and including 0065 — the database a production push finds.
const db = await makeDb({ maxExclusive: '0066' });

await db.exec(`
  insert into public.profiles (uid, display_name, username) values
    ('${ada}', 'Ada Lovelace', 'ada'),
    ('${rahim}', 'Rahim Uddin', 'rahim'),
    ('${sultana}', 'Sultana Razia', 'sultana');
`);

const direct = (
  await as(
    db,
    ada,
    `select public.open_direct_conversation('${rahim}') as id`,
    'ada opens a conversation with rahim',
  )
).rows[0].id;
const message = (
  await as(
    db,
    ada,
    `select (public.send_message(p_conversation_id := '${direct}', p_body := 'the ferry is at nine')).id as id`,
    'ada sends a line',
  )
).rows[0].id;

// What the old client wrote: emoji, one row per member per emoji.
await db.exec(`
  insert into public.message_reactions (message_id, uid, reaction) values
    ('${message}', '${ada}',   '👍'),
    ('${message}', '${rahim}', '❤️'),
    ('${message}', '${rahim}', '🙏'),
    ('${message}', '${sultana}', '😂'),
    ('${message}', '${sultana}', '😮');
`);

const before = (await db.query(`select count(*)::int as c from public.message_reactions`)).rows[0]
  .c;
console.log(`ok    ${before} emoji reactions exist before the migration`);

// Apply 0066 the way the operator does: one file, one transaction.
await db.exec(
  'begin;\n' +
    readFileSync(join(MIGRATIONS_DIR, '0066_a_reaction_is_a_name_not_a_picture.sql'), 'utf8') +
    '\ncommit;',
);
console.log('ok    0066 applies to a database that already holds emoji reactions');

// ---------------------------------------------------------------------------
// the stored data is words, and no emoji survives
// ---------------------------------------------------------------------------
const remaining = (
  await db.query(`select reaction from public.message_reactions order by reaction`)
).rows.map((row) => row.reaction);
const allWords = remaining.every((word) => /^[a-z]+$/.test(word));
if (allWords) {
  console.log(`ok    every stored reaction is a word: ${[...new Set(remaining)].join(', ')}`);
} else {
  console.log(`FAIL  a stored reaction is not a word: ${JSON.stringify(remaining)}`);
  process.exitCode = 1;
}

const byMember = (
  await db.query(
    `select uid, reaction from public.message_reactions where uid = '${rahim}' order by reaction`,
  )
).rows.map((row) => row.reaction);
if (JSON.stringify(byMember) === JSON.stringify(['support'])) {
  console.log('ok    two emoji from one member become one word, not two votes');
} else {
  console.log(`FAIL  rahim's two emoji did not collapse to one word: ${JSON.stringify(byMember)}`);
  process.exitCode = 1;
}

const sultanaWords = (
  await db.query(
    `select reaction from public.message_reactions where uid = '${sultana}' order by reaction`,
  )
).rows.map((row) => row.reaction);
if (JSON.stringify(sultanaWords) === JSON.stringify(['celebrate', 'curious'])) {
  console.log('ok    laughing maps to celebrate and surprise to curious');
} else {
  console.log(`FAIL  sultana's mapping is wrong: ${JSON.stringify(sultanaWords)}`);
  process.exitCode = 1;
}

const emojiLeft = (
  await db.query(
    `select count(*)::int as c from public.message_reactions where reaction !~ '^[a-z]+$'`,
  )
).rows[0].c;
if (emojiLeft === 0) console.log('ok    no emoji row remains after the translation');
else {
  console.log(`FAIL  ${emojiLeft} emoji rows remain`);
  process.exitCode = 1;
}

// ---------------------------------------------------------------------------
// the database refuses a picture, whatever the client sends
// ---------------------------------------------------------------------------
const constraint = (
  await db.query(
    `select count(*)::int as c from pg_constraint
       where conname = 'message_reactions_known_reaction' and contype = 'c'`,
  )
).rows[0].c;
if (constraint === 1)
  console.log('ok    the table carries a check constraint naming the five words');
else {
  console.log('FAIL  the check constraint is missing');
  process.exitCode = 1;
}

await expectFail(
  db,
  ada,
  `select * from public.toggle_message_reaction('${message}', '🚀')`,
  '22023',
  'the toggle refuses an emoji with 22023',
);
await expectFail(
  db,
  ada,
  `select * from public.toggle_message_reaction('${message}', 'LIKE')`,
  '22023',
  'the toggle refuses a word that is not in the set, even in capitals',
);
await expectFail(
  db,
  ada,
  `select * from public.toggle_message_reaction('${message}', 'wave')`,
  '22023',
  'the toggle refuses a plausible word that is not one of the five',
);

await as(
  db,
  ada,
  `select * from public.toggle_message_reaction('${message}', 'insightful')`,
  'ada reacts with a word the thread offers',
);
let directInsertRefused = false;
try {
  await db.query(
    `insert into public.message_reactions (message_id, uid, reaction) values ('${message}', '${ada}', '🔥')`,
  );
} catch {
  directInsertRefused = true;
}
if (directInsertRefused)
  console.log('ok    a direct insert of an emoji is refused by the constraint');
else {
  console.log('FAIL  a direct insert of an emoji was accepted');
  process.exitCode = 1;
}

// ---------------------------------------------------------------------------
// the rule the function copied from 0051 still holds
// ---------------------------------------------------------------------------
await expectFail(
  db,
  sultana,
  `select * from public.toggle_message_reaction('${message}', 'like')`,
  null,
  'a stranger still cannot react to a line they cannot read',
);

// Re-running the file is a no-op: the translation finds nothing, the constraint
// is replaced rather than duplicated, and the function is replaced in place.
await asOwner(
  db,
  'begin;\n' +
    readFileSync(join(MIGRATIONS_DIR, '0066_a_reaction_is_a_name_not_a_picture.sql'), 'utf8') +
    '\ncommit;',
);
const after = (await db.query(`select count(*)::int as c from public.message_reactions`)).rows[0].c;
console.log(`ok    0066 applies a second time, and the row count is unchanged (${after})`);

if (summary() > 0) process.exitCode = 1;
await db.close();
