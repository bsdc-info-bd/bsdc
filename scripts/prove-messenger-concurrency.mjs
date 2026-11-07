#!/usr/bin/env node
/** Real overlapping direct opens and message retries. Use a disposable DB only. */
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

const url = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL;
if (process.env.BSDC_THROWAWAY_DB !== '1' || !url) {
  console.error('Set BSDC_THROWAWAY_DB=1 and a disposable database URL; never run this on production.');
  process.exit(2);
}
const suffix = randomBytes(6).toString('hex');
const alice = `messenger-proof-a-${suffix}`;
const bob = `messenger-proof-b-${suffix}`;
const requestId = randomUUID();
let conversation = '';
function psql(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', url], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', () => reject(new Error('Could not start psql.')));
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`PostgreSQL proof failed: ${stderr.replaceAll(url, '[database]').trim()}`));
      else resolve(stdout.trim());
    });
    child.stdin.end(sql);
  });
}
const claims = (uid) => JSON.stringify({ sub: uid, role: 'authenticated', bsdc_role: 'member' });
const session = (uid, sql) => `begin; set local role authenticated;
  select set_config('request.jwt.claims', '${claims(uid)}', true);
  select pg_sleep(0.15); ${sql}; select pg_sleep(0.6); commit;`;
function uuid(result) {
  const value = result.split('\n').find((line) => /^[a-f0-9-]{36}$/.test(line));
  if (!value) throw new Error(`Expected a UUID in response: ${result}`);
  return value;
}
try {
  await psql(`insert into public.profiles(uid, display_name) values ('${alice}', 'Proof Alice'), ('${bob}', 'Proof Bob');`);
  const opened = await Promise.all([
    psql(session(alice, `select public.open_direct_conversation('${bob}')`)),
    psql(session(bob, `select public.open_direct_conversation('${alice}')`)),
  ]);
  const ids = opened.map(uuid);
  conversation = ids[0];
  if (!ids.every((id) => id === conversation)) throw new Error('Concurrent direct opens returned different rooms');
  const shape = await psql(`select count(*) || ',' || count(distinct uid) from public.conversation_members where conversation_id='${conversation}'`);
  if (shape !== '2,2') throw new Error(`Unexpected direct membership: ${shape}`);
  console.log('ok    concurrent opposite-direction opens produce one direct room with two members');

  const sql = `select (public.send_message_once('${conversation}', '${requestId}', 'one concurrent message')).id`;
  const delivered = await Promise.all([psql(session(alice, sql)), psql(session(alice, sql)), psql(session(alice, sql))]);
  const messageIds = delivered.map(uuid);
  if (!messageIds.every((id) => id === messageIds[0])) throw new Error('Concurrent retries returned different message IDs');
  const count = await psql(`select count(*) from public.messages where conversation_id='${conversation}' and body='one concurrent message'`);
  if (count !== '1') throw new Error(`Concurrent retries stored ${count} messages`);
  console.log('ok    three concurrent sends with the same request key commit one message');
} finally {
  if (conversation) await psql(`delete from public.conversations where id='${conversation}';`);
  await psql(`delete from public.profiles where uid in ('${alice}', '${bob}');`);
}
