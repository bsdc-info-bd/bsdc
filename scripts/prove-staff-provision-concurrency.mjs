#!/usr/bin/env node
/** Real overlapping first sign-ins. Run only on a disposable PostgreSQL DB. */
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';

const url = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL;
if (process.env.BSDC_THROWAWAY_DB !== '1' || !url) {
  console.error('Set BSDC_THROWAWAY_DB=1 and a disposable database URL; never run this on production.');
  process.exit(2);
}
const uid = `staff-provision-proof-${randomBytes(6).toString('hex')}`;
const claims = JSON.stringify({ sub: uid, role: 'authenticated', bsdc_role: 'owner', staff: true });
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
try {
  const session = `
    begin;
    set local role authenticated;
    select set_config('request.jwt.claims', '${claims}', true);
    select pg_sleep(0.1);
    select role::text from public.provision_staff('Concurrent sign-in');
    select pg_sleep(1);
    commit;
  `;
  const results = await Promise.all([psql(session), psql(session), psql(session)]);
  if (!results.every((result) => result.split('\n').includes('member'))) {
    throw new Error('Concurrent sign-ins did not all obtain the member profile.');
  }
  const proof = await psql(`
    select p.role::text || ',' || p.status::text || ',' ||
      (select count(*) from public.audit_log where actor_uid='${uid}' and action='staff.provisioned')
    from public.profiles p where p.uid='${uid}';
  `);
  if (proof !== 'member,active,1') throw new Error(`Unexpected provisioning invariant: ${proof}`);
  console.log('ok    three concurrent sign-ins create one active member and one audit record');
  console.log('ok    a stale owner claim cannot promote the resulting profile');
} finally {
  await psql(`delete from public.audit_log where actor_uid='${uid}' and action='staff.provisioned';
              delete from public.profiles where uid='${uid}';`);
}
