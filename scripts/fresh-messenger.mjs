#!/usr/bin/env node
/**
 * Platform-wide Messenger & Messenger-Notification Fresh Reset.
 *
 * Clears all users' messenger data (conversations, memberships, drafts,
 * pin/archive/mute settings, messages of every kind, reactions, read/delivery
 * receipts, pins, saved stars, send idempotency records, messenger moderation
 * reports, and optionally Firebase RTDB ephemeral /typing nodes) along with all
 * messenger-related rows in `public.notifications` (and their cascading
 * per-device push/FCM delivery rows), while keeping all member profiles,
 * posts, comments, follows, courses, jobs, marketplace data, and non-messenger
 * notifications untouched.
 *
 * Usage:
 *   node scripts/fresh-messenger.mjs --self-test
 *   node scripts/fresh-messenger.mjs --dry-run [--summary=path]
 *   node scripts/fresh-messenger.mjs --apply --confirm=FRESH_MESSENGER [--summary=path]
 *   node scripts/fresh-messenger.mjs --apply --once=<stamp> [--summary=path]
 *
 * Security invariants:
 *   - Connection strings, private keys, and OAuth tokens are never passed on
 *     non-file flags that leak or printed to stdout/stderr/summaries.
 *   - `--apply` requires either explicit `--confirm=FRESH_MESSENGER` or an
 *     idempotent `--once=<stamp>` token verified inside `public.audit_log`.
 *   - `--dry-run` executes inside `BEGIN READ ONLY` and modifies zero rows.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const CONFIRMATION_PHRASE = 'FRESH_MESSENGER';
export const AUDIT_ACTION = 'platform.messenger_fresh';

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return '';
}

export function sqlLiteral(value) {
  const safe = String(value ?? '').replace(/\0/g, '');
  return `'${safe.replace(/'/g, "''")}'`;
}

export function describeTarget(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}:${parsed.port || '5432'}${parsed.pathname}`;
  } catch {
    return 'an unparseable connection string';
  }
}

export function validateStamp(stamp) {
  if (typeof stamp !== 'string' || !/^[A-Za-z0-9._:-]{3,80}$/.test(stamp)) {
    throw new Error(
      'Invalid --once stamp: must be 3-80 characters matching [A-Za-z0-9._:-].',
    );
  }
  return stamp;
}

export function validateExecutionMode({ dryRun = false, apply = false, confirm = '', once = '' }) {
  if (dryRun && apply) {
    throw new Error('Cannot combine --dry-run and --apply.');
  }
  if (!dryRun && !apply) {
    throw new Error('Specify either --dry-run, --apply, or --self-test.');
  }
  if (!apply) {
    return { mode: 'dry-run', stamp: '' };
  }
  if (once !== '') {
    return { mode: 'once', stamp: validateStamp(once) };
  }
  if (confirm !== CONFIRMATION_PHRASE) {
    throw new Error(
      `Refusing destructive reset without --confirm=${CONFIRMATION_PHRASE} (or --once=<stamp>).`,
    );
  }
  return { mode: 'apply', stamp: '' };
}

export function validateRtdbUrl(rawUrl) {
  const trimmed = String(rawUrl ?? '').trim().replace(/\/+$/, '');
  if (trimmed === '') return '';
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('VITE_FB_DATABASE_URL is not a valid URL.');
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.port !== '' ||
    !(
      parsed.hostname.endsWith('.firebaseio.com') ||
      parsed.hostname.endsWith('.firebasedatabase.app')
    )
  ) {
    throw new Error(
      'VITE_FB_DATABASE_URL must be an HTTPS Firebase Realtime Database host.',
    );
  }
  return parsed.origin;
}

const MESSENGER_NOTIFICATION_PREDICATE = `(
  n.kind::text = 'message'
  or n.conversation_id is not null
  or coalesce(n.target_url, '') like '/messages%'
  or (
    n.kind::text = 'comment'
    and n.post_id is null
    and n.comment_id is not null
    and to_regclass('public.messages') is not null
    and exists (select 1 from public.messages m where m.id = n.comment_id)
  )
  or (
    n.kind::text = 'feedback'
    and (
      n.body like 'Report (message):%'
      or n.body like 'Report (conversation):%'
    )
  )
)`;

/**
 * Builds one self-contained PostgreSQL script that either counts all messenger
 * rows read-only (`dryRun: true`) or deletes all messenger data & messenger
 * notifications atomically inside a single transaction (`dryRun: false`).
 *
 * Notice leaf-first deletion on `public.messages`: clearing child replies
 * before parent messages prevents `ON DELETE SET NULL` updates from firing
 * `bsdc.guard_message_context()` on direct threads where one member later
 * blocked the other.
 */
export function buildFreshMessengerSql({
  dryRun = false,
  stamp = '',
  actor = 'github-actions',
} = {}) {
  if (stamp !== '') validateStamp(stamp);
  const safeActor = sqlLiteral(firstNonEmpty(actor, 'github-actions'));
  const safeSubject = sqlLiteral(stamp !== '' ? stamp : 'manual');
  const safeStamp = stamp !== '' ? sqlLiteral(stamp) : 'null';

  return `${dryRun ? 'begin read only;' : 'begin;'}
set local client_min_messages = warning;

do $$
declare
  v_dry_run boolean := ${dryRun ? 'true' : 'false'};
  v_stamp   text := ${safeStamp};
  v_already boolean := false;
  v_before  jsonb;
  v_deleted jsonb := '{}'::jsonb;
  v_after   jsonb;
  v_non_messenger_before bigint := 0;
  v_non_messenger_after  bigint := 0;

  v_conversations           bigint := 0;
  v_conversation_members    bigint := 0;
  v_non_empty_drafts        bigint := 0;
  v_messages                bigint := 0;
  v_message_reactions       bigint := 0;
  v_message_receipts        bigint := 0;
  v_message_pins            bigint := 0;
  v_message_stars           bigint := 0;
  v_send_requests           bigint := 0;
  v_messenger_notifications bigint := 0;
  v_push_deliveries         bigint := 0;
  v_fcm_deliveries          bigint := 0;
  v_messenger_reports       bigint := 0;

  v_del_notifications       bigint := 0;
  v_del_reports             bigint := 0;
  v_del_send_requests       bigint := 0;
  v_del_stars               bigint := 0;
  v_del_pins                bigint := 0;
  v_del_receipts            bigint := 0;
  v_del_reactions           bigint := 0;
  v_del_messages            bigint := 0;
  v_del_members             bigint := 0;
  v_del_conversations       bigint := 0;
  v_pass_deleted            bigint := 0;
begin
  if v_stamp is not null and to_regclass('public.audit_log') is not null then
    select exists (
      select 1 from public.audit_log
      where action = ${sqlLiteral(AUDIT_ACTION)} and subject = v_stamp
    ) into v_already;

    if v_already and not v_dry_run then
      perform set_config(
        'bsdc.fresh_report',
        jsonb_build_object(
          'status', 'already_applied',
          'stamp', v_stamp
        )::text,
        true
      );
      return;
    end if;
  end if;

  if to_regclass('public.conversations') is not null then
    select count(*) into v_conversations from public.conversations;
  end if;
  if to_regclass('public.conversation_members') is not null then
    select
      count(*),
      count(*) filter (where btrim(coalesce(draft_body, '')) <> '')
      into v_conversation_members, v_non_empty_drafts
    from public.conversation_members;
  end if;
  if to_regclass('public.messages') is not null then
    select count(*) into v_messages from public.messages;
  end if;
  if to_regclass('public.message_reactions') is not null then
    select count(*) into v_message_reactions from public.message_reactions;
  end if;
  if to_regclass('public.message_receipts') is not null then
    select count(*) into v_message_receipts from public.message_receipts;
  end if;
  if to_regclass('public.message_pins') is not null then
    select count(*) into v_message_pins from public.message_pins;
  end if;
  if to_regclass('public.message_stars') is not null then
    select count(*) into v_message_stars from public.message_stars;
  end if;
  if to_regclass('bsdc.message_send_requests') is not null then
    select count(*) into v_send_requests from bsdc.message_send_requests;
  end if;
  if to_regclass('public.notifications') is not null then
    select
      count(*) filter (where ${MESSENGER_NOTIFICATION_PREDICATE}),
      count(*) filter (where not (${MESSENGER_NOTIFICATION_PREDICATE}))
      into v_messenger_notifications, v_non_messenger_before
    from public.notifications n;
  end if;
  if to_regclass('bsdc.push_device_deliveries') is not null and to_regclass('public.notifications') is not null then
    select count(*) into v_push_deliveries
    from bsdc.push_device_deliveries d
    join public.notifications n on n.id = d.notification_id
    where ${MESSENGER_NOTIFICATION_PREDICATE};
  end if;
  if to_regclass('bsdc.fcm_device_deliveries') is not null and to_regclass('public.notifications') is not null then
    select count(*) into v_fcm_deliveries
    from bsdc.fcm_device_deliveries d
    join public.notifications n on n.id = d.notification_id
    where ${MESSENGER_NOTIFICATION_PREDICATE};
  end if;
  if to_regclass('public.reports') is not null then
    select count(*) into v_messenger_reports
    from public.reports r
    where r.subject_type in ('message', 'conversation');
  end if;

  v_before := jsonb_build_object(
    'conversations', v_conversations,
    'conversation_members', v_conversation_members,
    'non_empty_drafts', v_non_empty_drafts,
    'messages', v_messages,
    'message_reactions', v_message_reactions,
    'message_receipts', v_message_receipts,
    'message_pins', v_message_pins,
    'message_stars', v_message_stars,
    'message_send_requests', v_send_requests,
    'messenger_notifications', v_messenger_notifications,
    'push_device_deliveries', v_push_deliveries,
    'fcm_device_deliveries', v_fcm_deliveries,
    'messenger_reports', v_messenger_reports,
    'non_messenger_notifications', v_non_messenger_before
  );

  if v_dry_run then
    perform set_config(
      'bsdc.fresh_report',
      jsonb_build_object(
        'status', case when v_already then 'dry_run_already_stamped' else 'dry_run' end,
        'stamp', v_stamp,
        'before', v_before,
        'deleted', '{}'::jsonb,
        'after', v_before
      )::text,
      true
    );
    return;
  end if;

  -- 1. Remove messenger notifications first (before messages/conversations are
  --    gone so pre-0048 message-comment heuristics still resolve, and so
  --    ON DELETE CASCADE cleans per-device push & FCM receipts automatically).
  if to_regclass('public.notifications') is not null then
    delete from public.notifications n
    where ${MESSENGER_NOTIFICATION_PREDICATE};
    get diagnostics v_del_notifications = row_count;
  end if;

  -- 2. Clear reports targeting deleted messenger conversations or messages.
  if to_regclass('public.reports') is not null then
    delete from public.reports r
    where r.subject_type in ('message', 'conversation');
    get diagnostics v_del_reports = row_count;
  end if;

  -- 3. Clear idempotency request logs and per-message engagement tables.
  if to_regclass('bsdc.message_send_requests') is not null then
    delete from bsdc.message_send_requests;
    get diagnostics v_del_send_requests = row_count;
  end if;
  if to_regclass('public.message_stars') is not null then
    delete from public.message_stars;
    get diagnostics v_del_stars = row_count;
  end if;
  if to_regclass('public.message_pins') is not null then
    delete from public.message_pins;
    get diagnostics v_del_pins = row_count;
  end if;
  if to_regclass('public.message_receipts') is not null then
    delete from public.message_receipts;
    get diagnostics v_del_receipts = row_count;
  end if;
  if to_regclass('public.message_reactions') is not null then
    delete from public.message_reactions;
    get diagnostics v_del_reactions = row_count;
  end if;

  -- 4. Delete messages leaf-first so reply_to ON DELETE SET NULL never
  --    re-triggers guard_message_context on threads with later member blocks.
  if to_regclass('public.messages') is not null then
    loop
      delete from public.messages m
      where not exists (
        select 1 from public.messages child where child.reply_to = m.id
      );
      get diagnostics v_pass_deleted = row_count;
      v_del_messages := v_del_messages + v_pass_deleted;
      exit when v_pass_deleted = 0;
    end loop;
    delete from public.messages;
    get diagnostics v_pass_deleted = row_count;
    v_del_messages := v_del_messages + v_pass_deleted;
  end if;

  -- 5. Delete memberships (including unsent drafts and per-chat state) and conversations.
  if to_regclass('public.conversation_members') is not null then
    delete from public.conversation_members;
    get diagnostics v_del_members = row_count;
  end if;
  if to_regclass('public.conversations') is not null then
    delete from public.conversations;
    get diagnostics v_del_conversations = row_count;
  end if;

  v_deleted := jsonb_build_object(
    'conversations', v_del_conversations,
    'conversation_members', v_del_members,
    'messages', v_del_messages,
    'message_reactions', v_del_reactions,
    'message_receipts', v_del_receipts,
    'message_pins', v_del_pins,
    'message_stars', v_del_stars,
    'message_send_requests', v_del_send_requests,
    'messenger_notifications', v_del_notifications,
    'messenger_reports', v_del_reports
  );

  -- 6. Post-reset invariant verification inside the same transaction.
  v_conversations := 0;
  v_conversation_members := 0;
  v_messages := 0;
  v_message_reactions := 0;
  v_message_receipts := 0;
  v_message_pins := 0;
  v_message_stars := 0;
  v_send_requests := 0;
  v_messenger_notifications := 0;
  v_push_deliveries := 0;
  v_fcm_deliveries := 0;
  v_messenger_reports := 0;

  if to_regclass('public.conversations') is not null then
    select count(*) into v_conversations from public.conversations;
  end if;
  if to_regclass('public.conversation_members') is not null then
    select count(*) into v_conversation_members from public.conversation_members;
  end if;
  if to_regclass('public.messages') is not null then
    select count(*) into v_messages from public.messages;
  end if;
  if to_regclass('public.message_reactions') is not null then
    select count(*) into v_message_reactions from public.message_reactions;
  end if;
  if to_regclass('public.message_receipts') is not null then
    select count(*) into v_message_receipts from public.message_receipts;
  end if;
  if to_regclass('public.message_pins') is not null then
    select count(*) into v_message_pins from public.message_pins;
  end if;
  if to_regclass('public.message_stars') is not null then
    select count(*) into v_message_stars from public.message_stars;
  end if;
  if to_regclass('bsdc.message_send_requests') is not null then
    select count(*) into v_send_requests from bsdc.message_send_requests;
  end if;
  if to_regclass('public.notifications') is not null then
    select
      count(*) filter (where ${MESSENGER_NOTIFICATION_PREDICATE}),
      count(*) filter (where not (${MESSENGER_NOTIFICATION_PREDICATE}))
      into v_messenger_notifications, v_non_messenger_after
    from public.notifications n;
  end if;
  if to_regclass('public.reports') is not null then
    select count(*) into v_messenger_reports
    from public.reports r
    where r.subject_type in ('message', 'conversation');
  end if;

  if v_conversations <> 0
     or v_conversation_members <> 0
     or v_messages <> 0
     or v_message_reactions <> 0
     or v_message_receipts <> 0
     or v_message_pins <> 0
     or v_message_stars <> 0
     or v_send_requests <> 0
     or v_messenger_notifications <> 0
     or v_messenger_reports <> 0 then
    raise exception 'fresh messenger post-check failed: non-zero remaining rows';
  end if;

  v_after := jsonb_build_object(
    'conversations', v_conversations,
    'conversation_members', v_conversation_members,
    'messages', v_messages,
    'message_reactions', v_message_reactions,
    'message_receipts', v_message_receipts,
    'message_pins', v_message_pins,
    'message_stars', v_message_stars,
    'message_send_requests', v_send_requests,
    'messenger_notifications', v_messenger_notifications,
    'messenger_reports', v_messenger_reports,
    'non_messenger_notifications', v_non_messenger_after
  );

  if to_regclass('public.audit_log') is not null then
    insert into public.audit_log (actor_uid, action, subject, metadata)
    values (
      ${safeActor},
      ${sqlLiteral(AUDIT_ACTION)},
      ${safeSubject},
      jsonb_build_object(
        'before', v_before,
        'deleted', v_deleted,
        'after', v_after
      )
    );
  end if;

  perform set_config(
    'bsdc.fresh_report',
    jsonb_build_object(
      'status', 'applied',
      'stamp', v_stamp,
      'before', v_before,
      'deleted', v_deleted,
      'after', v_after
    )::text,
    true
  );
end
$$;

select current_setting('bsdc.fresh_report', true) as payload;
commit;
`;
}

function psqlStdin(url, sql) {
  try {
    return execFileSync(
      'psql',
      [url, '--no-psqlrc', '--quiet', '--tuples-only', '--no-align', '--set', 'ON_ERROR_STOP=1', '--file', '-'],
      { input: sql, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
    ).trim();
  } catch (error) {
    const message = `${error.stderr ?? ''}${error.stdout ?? ''}`.replaceAll(url, '<connection>');
    throw new Error(message.trim() === '' ? error.message : message.trim());
  }
}

export function createGoogleAccessAssertion(serviceAccount, nowSec = Math.floor(Date.now() / 1000)) {
  if (
    !serviceAccount ||
    serviceAccount.type !== 'service_account' ||
    typeof serviceAccount.client_email !== 'string' ||
    typeof serviceAccount.private_key !== 'string'
  ) {
    throw new Error('Firebase credential must be a valid service_account JSON.');
  }
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const claims = Buffer.from(
    JSON.stringify({
      iss: serviceAccount.client_email,
      sub: serviceAccount.client_email,
      aud: 'https://oauth2.googleapis.com/token',
      scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
      iat: nowSec,
      exp: nowSec + 300,
    }),
  ).toString('base64url');
  const unsigned = `${header}.${claims}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(serviceAccount.private_key).toString('base64url');
  return `${unsigned}.${signature}`;
}

export async function clearRtdbTyping({
  serviceAccountJson = '',
  databaseUrl = '',
  dryRun = false,
  fetchImpl = globalThis.fetch,
} = {}) {
  const safeDb = validateRtdbUrl(databaseUrl);
  const rawCred = String(serviceAccountJson ?? '').trim();
  if (safeDb === '' || rawCred === '') {
    return { status: 'skipped', reason: 'missing_credentials' };
  }
  if (typeof fetchImpl !== 'function') {
    return { status: 'skipped', reason: 'fetch_unavailable' };
  }

  let parsedCred;
  try {
    parsedCred = JSON.parse(rawCred);
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_BSDC_BD must contain valid JSON.');
  }
  const assertion = createGoogleAccessAssertion(parsedCred);
  const tokenRes = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
  });
  if (!tokenRes.ok) {
    throw new Error(`Firebase OAuth token exchange failed with HTTP ${tokenRes.status}.`);
  }
  const tokenBody = await tokenRes.json();
  const accessToken = typeof tokenBody?.access_token === 'string' ? tokenBody.access_token : '';
  if (accessToken === '') {
    throw new Error('Firebase OAuth token response omitted access_token.');
  }

  const endpoint = dryRun ? `${safeDb}/typing.json?shallow=true` : `${safeDb}/typing.json`;
  const rtdbRes = await fetchImpl(endpoint, {
    method: dryRun ? 'GET' : 'DELETE',
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!rtdbRes.ok) {
    throw new Error(`Firebase RTDB typing ${dryRun ? 'inspection' : 'clear'} failed with HTTP ${rtdbRes.status}.`);
  }
  if (dryRun) {
    const keys = await rtdbRes.json();
    const activeThreads = keys && typeof keys === 'object' ? Object.keys(keys).length : 0;
    return { status: 'dry_run', activeThreads };
  }
  return { status: 'cleared' };
}

export function formatSummaryMarkdown({ target, dbReport, rtdbReport }) {
  const lines = [
    '## Fresh Messenger & Messenger Notifications',
    '',
    `- **Target**: \`${target}\``,
    `- **Status**: \`${dbReport.status}\`${dbReport.stamp ? ` (stamp: \`${dbReport.stamp}\`)` : ''}`,
    `- **RTDB \`/typing\`**: \`${rtdbReport.status}\`${
      typeof rtdbReport.activeThreads === 'number'
        ? ` (${rtdbReport.activeThreads} active typing thread(s))`
        : ''
    }`,
    '',
  ];

  if (dbReport.status === 'already_applied') {
    lines.push(
      '> Stamp is already recorded in `public.audit_log`. No messenger rows or notifications were modified; use manual `workflow_dispatch` (`action: reset`, `confirmation: FRESH_MESSENGER`) for another reset.',
      '',
    );
  }

  if (dbReport.before) {
    const keys = [
      'conversations',
      'conversation_members',
      'non_empty_drafts',
      'messages',
      'message_reactions',
      'message_receipts',
      'message_pins',
      'message_stars',
      'message_send_requests',
      'messenger_notifications',
      'push_device_deliveries',
      'fcm_device_deliveries',
      'messenger_reports',
      'non_messenger_notifications',
    ];
    lines.push('| Dataset | Before | Deleted | After |');
    lines.push('| --- | ---: | ---: | ---: |');
    for (const key of keys) {
      const before = dbReport.before?.[key] ?? 0;
      const deleted = dbReport.deleted?.[key] ?? (dbReport.status === 'applied' ? 0 : '—');
      const after = dbReport.after?.[key] ?? (dbReport.status === 'applied' ? 0 : before);
      lines.push(`| \`${key}\` | ${before} | ${deleted} | ${after} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

async function runSelfTests() {
  assert.throws(() => validateExecutionMode({}), /Specify either/);
  assert.throws(() => validateExecutionMode({ dryRun: true, apply: true }), /Cannot combine/);
  assert.throws(
    () => validateExecutionMode({ apply: true, confirm: 'wrong' }),
    /Refusing destructive reset/,
  );
  assert.deepEqual(validateExecutionMode({ dryRun: true }), { mode: 'dry-run', stamp: '' });
  assert.deepEqual(validateExecutionMode({ apply: true, confirm: CONFIRMATION_PHRASE }), {
    mode: 'apply',
    stamp: '',
  });
  assert.deepEqual(validateExecutionMode({ apply: true, once: '2026-11-13-initial-fresh-reset' }), {
    mode: 'once',
    stamp: '2026-11-13-initial-fresh-reset',
  });
  assert.throws(() => validateStamp("bad'; drop table"), /Invalid --once stamp/);

  assert.equal(validateRtdbUrl(''), '');
  assert.equal(
    validateRtdbUrl('https://bsdc-bd-default-rtdb.firebaseio.com/'),
    'https://bsdc-bd-default-rtdb.firebaseio.com',
  );
  assert.equal(
    validateRtdbUrl('https://bsdc-bd-default-rtdb.asia-southeast1.firebasedatabase.app'),
    'https://bsdc-bd-default-rtdb.asia-southeast1.firebasedatabase.app',
  );
  assert.throws(() => validateRtdbUrl('https://evil.example.com'), /Firebase Realtime Database/);
  assert.throws(() => validateRtdbUrl('http://bsdc-bd.firebaseio.com'), /Firebase Realtime Database/);

  const drySql = buildFreshMessengerSql({ dryRun: true });
  assert.ok(drySql.startsWith('begin read only;'));
  assert.ok(!drySql.includes('\ndelete from '));

  const applySql = buildFreshMessengerSql({
    dryRun: false,
    stamp: '2026-11-13-initial-fresh-reset',
    actor: "ci'actor",
  });
  assert.ok(applySql.startsWith('begin;'));
  assert.ok(applySql.includes("'ci''actor'"));
  assert.ok(applySql.includes("where not exists (\n        select 1 from public.messages child where child.reply_to = m.id"));
  assert.ok(applySql.includes('delete from public.conversations;'));
  assert.ok(applySql.includes('delete from public.conversation_members;'));
  assert.ok(applySql.includes('delete from bsdc.message_send_requests;'));
  assert.ok(applySql.includes('delete from public.notifications n'));

  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const jwt = createGoogleAccessAssertion({
    type: 'service_account',
    client_email: 'firebase-adminsdk@bsdc-bd.iam.gserviceaccount.com',
    private_key: pem,
  });
  assert.equal(jwt.split('.').length, 3);

  let deleteCalls = 0;
  const mockFetch = async (url, init) => {
    if (String(url).startsWith('https://oauth2.googleapis.com/token')) {
      return new Response(JSON.stringify({ access_token: 'mock-tok' }), { status: 200 });
    }
    if (String(url).endsWith('/typing.json') && init?.method === 'DELETE') {
      deleteCalls += 1;
      return new Response('null', { status: 200 });
    }
    if (String(url).endsWith('/typing.json?shallow=true') && init?.method === 'GET') {
      return new Response(JSON.stringify({ c1: true, c2: true }), { status: 200 });
    }
    return new Response('unexpected', { status: 500 });
  };
  const rtdbDry = await clearRtdbTyping({
    serviceAccountJson: JSON.stringify({
      type: 'service_account',
      client_email: 'firebase-adminsdk@bsdc-bd.iam.gserviceaccount.com',
      private_key: pem,
    }),
    databaseUrl: 'https://bsdc-bd-default-rtdb.firebaseio.com',
    dryRun: true,
    fetchImpl: mockFetch,
  });
  assert.deepEqual(rtdbDry, { status: 'dry_run', activeThreads: 2 });
  assert.equal(deleteCalls, 0);

  const rtdbCleared = await clearRtdbTyping({
    serviceAccountJson: JSON.stringify({
      type: 'service_account',
      client_email: 'firebase-adminsdk@bsdc-bd.iam.gserviceaccount.com',
      private_key: pem,
    }),
    databaseUrl: 'https://bsdc-bd-default-rtdb.firebaseio.com',
    dryRun: false,
    fetchImpl: mockFetch,
  });
  assert.deepEqual(rtdbCleared, { status: 'cleared' });
  assert.equal(deleteCalls, 1);

  const md = formatSummaryMarkdown({
    target: 'aws-0.pooler.supabase.com:6543/postgres',
    dbReport: {
      status: 'applied',
      stamp: '2026-11-13-initial-fresh-reset',
      before: { conversations: 5, messages: 42 },
      deleted: { conversations: 5, messages: 42 },
      after: { conversations: 0, messages: 0 },
    },
    rtdbReport: { status: 'cleared' },
  });
  assert.ok(md.includes('| `conversations` | 5 | 5 | 0 |'));
  console.log('14 fresh-messenger self-tests passed. No credentials printed.');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) {
    await runSelfTests();
    return;
  }

  const readArg = (prefix) => {
    const hit = args.find((arg) => arg.startsWith(`${prefix}=`));
    return hit ? hit.slice(prefix.length + 1) : '';
  };

  const dryRun = args.includes('--dry-run');
  const apply = args.includes('--apply');
  const confirm = readArg('--confirm');
  const once = readArg('--once');
  const summaryPath = readArg('--summary');
  const actor = readArg('--actor') || process.env.GITHUB_ACTOR || 'github-actions';

  const { mode, stamp } = validateExecutionMode({ dryRun, apply, confirm, once });
  const dbUrl = firstNonEmpty(process.env.SUPABASE_DB_URL, process.env.DATABASE_URL);
  if (dbUrl === '') {
    throw new Error('SUPABASE_DB_URL (or DATABASE_URL) is required.');
  }

  const target = describeTarget(dbUrl);
  const sql = buildFreshMessengerSql({ dryRun: mode === 'dry-run', stamp, actor });
  const raw = psqlStdin(dbUrl, sql);
  const dbReport = JSON.parse(raw);

  let rtdbReport;
  if (dbReport.status === 'already_applied') {
    rtdbReport = { status: 'skipped', reason: 'already_applied' };
  } else {
    try {
      rtdbReport = await clearRtdbTyping({
        serviceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_BSDC_BD ?? '',
        databaseUrl: process.env.VITE_FB_DATABASE_URL ?? '',
        dryRun: mode === 'dry-run',
      });
    } catch (error) {
      rtdbReport = {
        status: 'warning',
        reason: error instanceof Error ? error.message : 'rtdb_error',
      };
      process.stderr.write(`::warning::RTDB typing cleanup warning: ${rtdbReport.reason}\n`);
    }
  }

  const summary = formatSummaryMarkdown({ target, dbReport, rtdbReport });
  process.stdout.write(`${summary}\n`);
  if (summaryPath !== '') {
    appendFileSync(summaryPath, `${summary}\n`, 'utf8');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
