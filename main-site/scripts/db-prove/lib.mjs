import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** The migrations this harness replays, relative to the repository itself. */
export const MIGRATIONS_DIR = resolve(HERE, '..', '..', '..', 'supabase', 'migrations');

const DIR = MIGRATIONS_DIR;

export async function makeDb({ maxExclusive = null, skip = [], extra = [] } = {}) {
  const db = await new PGlite({ extensions: { pgcrypto, citext, pg_trgm, unaccent } });
  await db.exec(
    `create role anon nologin noinherit; create role authenticated nologin noinherit;` +
      ` create role service_role nologin noinherit bypassrls;` +
      ` grant usage on schema public to anon, authenticated, service_role;`,
  );
  for (const f of readdirSync(DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    if (maxExclusive && f >= maxExclusive) continue;
    if (skip.some((prefix) => f.startsWith(prefix))) continue;
    try {
      await db.exec('begin;\n' + readFileSync(join(DIR, f), 'utf8') + '\ncommit;');
    } catch (e) {
      throw new Error(`migration ${f} failed: ${e.message}`);
    }
  }
  for (const sql of extra) await db.exec(sql);
  return db;
}

let passes = 0;
const failures = [];
function record(label, error) {
  if (error) {
    failures.push(label);
    console.log(
      `FAIL  ${label}  -> [${error.code ?? '?'}] ${String(error.message).split('\n')[0]}`,
    );
    return null;
  }
  passes += 1;
  console.log(`ok    ${label}`);
}
export async function as(db, sub, sql, label, claims = {}) {
  const payload = JSON.stringify({ sub, role: 'authenticated', bsdc_role: 'member', ...claims });
  try {
    await db.exec(
      `set role authenticated; select set_config('request.jwt.claims', $jwt$${payload}$jwt$, false);`,
    );
    const result = await db.query(sql);
    record(label, null);
    return result;
  } catch (e) {
    record(label, e);
    return null;
  } finally {
    await db.exec('reset role;');
  }
}
export async function asAnon(db, sql, label) {
  try {
    await db.exec(
      `set role anon; select set_config('request.jwt.claims', '{"sub":"","role":"anon"}', false);`,
    );
    const result = await db.query(sql);
    record(label, null);
    return result;
  } catch (e) {
    record(label, e);
    return null;
  } finally {
    await db.exec('reset role;');
  }
}
export async function expectFail(db, sub, sql, expected, label, claims = {}) {
  const payload = JSON.stringify({ sub, role: 'authenticated', bsdc_role: 'member', ...claims });
  try {
    await db.exec(
      `set role authenticated; select set_config('request.jwt.claims', $jwt$${payload}$jwt$, false);`,
    );
    await db.query(sql);
    record(`${label} (expected ${expected})`, {
      code: 'NO-ERROR',
      message: 'the statement succeeded',
    });
  } catch (e) {
    if (expected && e.code !== expected)
      record(label, { code: e.code, message: `expected ${expected}: ${e.message}` });
    else record(label, null);
  } finally {
    await db.exec('reset role;');
  }
}
export async function asOwner(db, sql) {
  await db.exec(sql);
}
export function summary() {
  console.log(`SUMMARY: ${passes} passed, ${failures.length} failed`);
  for (const f of failures) console.log('  failed: ' + f);
  return failures.length;
}
