/**
 * Proof for 0058: a voice note is not a document, and an archive is a write a
 * member can make.
 *
 * Both failures looked the same from the chair of the member: a control that
 * does nothing. Archiving was refused at the column grant — the row policy has
 * always allowed a member to update their own `conversation_members` row, but
 * the three columns that hold pin, archive and the shared draft were granted
 * later, in 0051, and a deployment that has not had 0051 applied answers 42501.
 * Because the control is optimistic, the only thing on screen was the toggle
 * snapping back.
 *
 * Recording a voice note worked in the browser and then arrived as a file chip,
 * because `bsdc_message_kind` had no value for sound.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDb, MIGRATIONS_DIR } from './lib.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const MIGRATION = join(MIGRATIONS_DIR, '0058_a_voice_note_is_not_a_document.sql');
const COMPOSER = join(HERE, '..', '..', 'src', 'components', 'messaging', 'MessageComposer.tsx');
const RECORDER = join(HERE, '..', '..', 'src', 'lib', 'messaging', 'voice-recorder.ts');

const me = 'aaaaaaaa-1111-4111-8111-000000000001';
const you = 'bbbbbbbb-2222-4222-8222-000000000002';

let pass = 0;
const bad = [];
function check(condition, label, detail = '') {
  if (condition) {
    pass += 1;
    console.log(`ok    ${label}`);
  } else {
    bad.push(label);
    console.log(`FAIL  ${label}${detail ? `  -> ${detail}` : ''}`);
  }
}

const db = await makeDb();

await db.exec(`
  insert into public.profiles (uid, username, display_name, role) values
    ('${me}', 'mefirst',  'Me First',  'member'),
    ('${you}', 'yousecond','You Second','member');
`);

async function as(sub, sql) {
  const payload = JSON.stringify({
    sub,
    role: 'authenticated',
    bsdc_role: 'member',
    email: `${sub.slice(0, 8)}@bsdc.info.bd`,
    email_verified: true,
  });
  try {
    await db.exec(
      `set role authenticated; select set_config('request.jwt.claims', $jwt$${payload}$jwt$, false);`,
    );
    return { ok: true, rows: (await db.query(sql)).rows };
  } catch (error) {
    return { ok: false, code: error.code, message: String(error.message).split('\n')[0] };
  } finally {
    await db.exec('reset role;');
  }
}

// ------------------------------------------------------- the kinds a line is ---
const kinds = await db.query(
  `select unnest(enum_range(null::bsdc_message_kind))::text as kind order by 1`,
);
const kindList = kinds.rows.map((row) => row.kind);
check(kindList.includes('audio'), 'a voice note has a kind of its own');
check(kindList.includes('video'), 'and so does a video');
for (const older of ['text', 'image', 'file', 'snippet', 'system']) {
  check(kindList.includes(older), `the kinds already in use are still there (${older})`);
}

// --------------------------------------------------- the grant behind archive ---
for (const column of ['is_archived', 'is_pinned', 'draft_body']) {
  const granted = await db.query(
    `select has_column_privilege('authenticated', 'public.conversation_members', '${column}', 'UPDATE') as allowed`,
  );
  check(
    granted.rows[0]?.allowed === true,
    `a member may write their own ${column}`,
    String(granted.rows[0]?.allowed),
  );
}
for (const column of ['last_read_at', 'muted_until', 'left_at']) {
  const granted = await db.query(
    `select has_column_privilege('authenticated', 'public.conversation_members', '${column}', 'UPDATE') as allowed`,
  );
  check(granted.rows[0]?.allowed === true, `and still their own ${column}`);
}
const forbidden = await db.query(
  `select has_column_privilege('authenticated', 'public.conversation_members', 'role', 'UPDATE') as allowed`,
);
check(
  forbidden.rows[0]?.allowed === false,
  "but not the role they hold in somebody else's conversation",
);

// ------------------------------------------------------------- doing it ---
const opened = await as(me, `select public.open_direct_conversation('${you}') as id`);
check(
  opened.ok && typeof opened.rows?.[0]?.id === 'string',
  'a member opens a conversation',
  opened.message ?? '',
);
const conversation = opened.rows?.[0]?.id ?? '';

const archived = await as(
  me,
  `update public.conversation_members set is_archived = true
    where conversation_id = '${conversation}' and uid = '${me}'
    returning is_archived`,
);
check(
  archived.ok && archived.rows?.[0]?.is_archived === true,
  'archiving it is a write that lands',
  archived.code ?? JSON.stringify(archived.rows ?? archived.message),
);

const pinned = await as(
  me,
  `update public.conversation_members set is_pinned = true, draft_body = 'half a thought'
    where conversation_id = '${conversation}' and uid = '${me}'
    returning is_pinned, draft_body`,
);
check(
  pinned.ok &&
    pinned.rows?.[0]?.is_pinned === true &&
    pinned.rows?.[0]?.draft_body === 'half a thought',
  'as are the pin and the draft that follows the member across devices',
  pinned.code ?? pinned.message ?? '',
);

const unarchived = await as(
  me,
  `update public.conversation_members set is_archived = false
    where conversation_id = '${conversation}' and uid = '${me}' returning is_archived`,
);
check(
  unarchived.ok && unarchived.rows?.[0]?.is_archived === false,
  'and moving it back out of the archive',
);

// Somebody else's row in the same conversation is not theirs to change. Row
// security does not raise for this: the row is simply not there to match.
const theirs = await as(
  me,
  `update public.conversation_members set is_archived = true
    where conversation_id = '${conversation}' and uid = '${you}' returning uid`,
);
check(
  !theirs.ok || (theirs.rows ?? []).length === 0,
  'one member cannot archive the conversation for the other',
  JSON.stringify(theirs.rows ?? theirs.code),
);
const untouched = await db.query(
  `select is_archived from public.conversation_members
    where conversation_id = '${conversation}' and uid = '${you}'`,
);
check(untouched.rows[0]?.is_archived === false, "and the other member's row is unchanged");

// ------------------------------------------------------ a note that is sound ---
const sent = await as(
  me,
  `select (public.send_message(
     p_conversation_id := '${conversation}',
     p_body := '',
     p_kind := 'audio',
     p_media_url := 'https://project.supabase.co/storage/v1/object/public/media/${me}/voice-note/202610/a.webm',
     p_media_name := 'voice-20261008T140506.webm'
   )).kind::text as kind`,
);
check(
  sent.ok && sent.rows?.[0]?.kind === 'audio',
  'a voice note is stored as one',
  sent.code ?? sent.message ?? '',
);

const stillText = await as(
  me,
  `select (public.send_message('${conversation}', 'and a line of text')).kind::text as kind`,
);
check(
  stillText.ok && stillText.rows?.[0]?.kind === 'text',
  'and an ordinary line is still stored as text',
);

// ---------------------------------------------------- the client agrees ---
const composer = readFileSync(COMPOSER, 'utf8');
check(
  /audio: 'voice-note'/.test(composer) &&
    /export type AttachmentKind = 'image' \| 'file' \| 'audio'/.test(composer),
  'the composer files a voice note under its own purpose',
);
check(
  /useVoiceRecorder/.test(composer) && /voice\.level/.test(composer),
  'and shows the member that the microphone is hearing them',
);
const recorder = readFileSync(RECORDER, 'utf8');
check(
  /NotAllowedError/.test(recorder) && /chat\.voice\.denied/.test(recorder),
  'a refused permission is its own sentence, not a failed upload',
);
check(
  /MAX_VOICE_MS/.test(recorder) && /isTypeSupported/.test(recorder),
  'with a limit and a codec it checked first',
);

// ------------------------------------------------------------ twice over ---
for (let round = 1; round <= 2; round += 1) {
  try {
    await db.exec(readFileSync(MIGRATION, 'utf8'));
    check(true, `0058 re-applied (round ${round})`);
  } catch (error) {
    check(false, `0058 re-applied (round ${round})`, String(error.message).split('\n')[0]);
  }
}
const kindsAfter = await db.query(
  `select count(*)::int as n from unnest(enum_range(null::bsdc_message_kind)) as kind`,
);
check(
  (kindsAfter.rows[0]?.n ?? 0) === kindList.length,
  'the enum has no duplicates in it afterwards',
  String(kindsAfter.rows[0]?.n),
);
const archivedAfter = await as(
  me,
  `update public.conversation_members set is_archived = true
    where conversation_id = '${conversation}' and uid = '${me}' returning is_archived`,
);
check(archivedAfter.ok, 'and archiving still works');

await db.close();
console.log('');
console.log(`SUMMARY: ${pass} passed, ${bad.length} failed`);
if (bad.length) console.log(`  failed: ${bad.join(', ')}`);
process.exit(bad.length === 0 ? 0 : 1);
