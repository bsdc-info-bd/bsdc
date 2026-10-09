#!/usr/bin/env node
/**
 * Apply the BSDC migrations to a Postgres database, in order, once each.
 *
 *   node scripts/db-push.mjs --plan                 # no database needed
 *   node scripts/db-push.mjs --dry-run              # connect, report, change nothing
 *   node scripts/db-push.mjs                        # apply what is missing
 *   node scripts/db-push.mjs --all                  # re-apply every file
 *   node scripts/db-push.mjs --verify               # apply, apply again, then assert
 *   node scripts/db-push.mjs --self-test            # check the runner itself
 *
 * The connection comes from `SUPABASE_DB_URL` (or `DATABASE_URL`) and is
 * never printed, not even in an error. `psql` must be on the PATH.
 *
 * Why this exists rather than `supabase db push`: these migrations predate
 * the CLI's timestamp naming, they are deliberately idempotent, and a
 * deployment should be able to say exactly which file it is about to run
 * against which host before it runs it. The ledger it writes is the same
 * table the Supabase CLI reads — `supabase_migrations.schema_migrations` —
 * so the two cannot disagree about what has been applied.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
import { storageHealth, DEPLOYMENT_NOTES_SQL } from './db-health.mjs';

const migrationsDir = join(root, 'supabase', 'migrations');

const flags = new Set(process.argv.slice(2));
const want = (flag) => flags.has(flag);

/* ------------------------------------------------------------------ *
 * Pure helpers (exercised by --self-test)
 * ------------------------------------------------------------------ */

/** The numeric prefix is the version; the rest is the human name. */
export function parseName(file) {
  const match = /^(\d+)_([a-z0-9_]+)\.sql$/.exec(file);
  if (!match) throw new Error(`Migration file is not named <number>_<name>.sql: ${file}`);
  return { version: match[1], name: match[2], file };
}

export function checksum(sql) {
  return createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
}

/** Files in applied order, with a gap or a duplicate treated as an error. */
export function listMigrations(dir = migrationsDir) {
  const files = readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort();
  const parsed = files.map(parseName);
  parsed.forEach((entry, index) => {
    const expected = String(index + 1).padStart(entry.version.length, '0');
    if (entry.version !== expected) {
      throw new Error(
        `Migration numbering has a gap or a duplicate: expected ${expected}, found ${entry.version} (${entry.file})`,
      );
    }
  });
  return parsed.map((entry) => {
    const sql = readFileSync(join(dir, entry.file), 'utf8');
    return { ...entry, sql, checksum: checksum(sql) };
  });
}

/** What needs doing, given what the ledger says is already there. */
export function plan(migrations, applied, { all = false } = {}) {
  return migrations.map((migration) => {
    const previous = applied.get(migration.version);
    if (all) return { ...migration, action: 'apply', because: 'every file was requested' };
    if (!previous) return { ...migration, action: 'apply', because: 'not applied yet' };
    if (previous.checksum !== migration.checksum) {
      return { ...migration, action: 'apply', because: 'the file changed since it was applied' };
    }
    return { ...migration, action: 'skip', because: 'already applied, unchanged' };
  });
}

/** A connection string is never printed; this is what goes in the log instead. */
export function describeTarget(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}:${parsed.port || '5432'}${parsed.pathname}`;
  } catch {
    return 'an unparseable connection string';
  }
}

/* ------------------------------------------------------------------ *
 * Database plumbing
 * ------------------------------------------------------------------ */

const LEDGER = `
-- The two ALTERs below are for a ledger created by an older Supabase CLI,
-- which had neither column. On every run after the first they are no-ops and
-- Postgres says so with a NOTICE; the log reads better without three lines of
-- "column already exists, skipping" in front of real work.
set client_min_messages = warning;
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version    text primary key,
  name       text,
  statements text[],
  checksum   text,
  applied_at timestamptz not null default now()
);
alter table supabase_migrations.schema_migrations
  add column if not exists checksum text;
alter table supabase_migrations.schema_migrations
  add column if not exists applied_at timestamptz not null default now();
`;

function psql(url, sql, { file = false } = {}) {
  const args = [
    url,
    '--no-psqlrc',
    '--quiet',
    '--tuples-only',
    '--no-align',
    '--set',
    'ON_ERROR_STOP=1',
    file ? '--file' : '--command',
    sql,
  ];
  try {
    return execFileSync('psql', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
  } catch (error) {
    // Scrub the connection string out of anything that is about to be printed.
    const message = `${error.stderr ?? ''}${error.stdout ?? ''}`.replaceAll(url, '<connection>');
    throw new Error(message.trim() === '' ? error.message : message.trim());
  }
}

function readLedger(url) {
  psql(url, LEDGER);
  const rows = psql(
    url,
    "select version || '\\t' || coalesce(checksum, '') from supabase_migrations.schema_migrations order by version",
  );
  const applied = new Map();
  for (const line of rows.split('\n').filter((line) => line.trim() !== '')) {
    const [version, sum] = line.split('\t');
    applied.set(version, { checksum: sum ?? '' });
  }
  return applied;
}

/**
 * One file, one transaction. If a statement fails, nothing in that file is
 * left behind — a half-applied migration is the worst state a database can
 * be in, because the next run cannot tell what it is looking at.
 */
function applyOne(url, migration) {
  const scratch = mkdtempSync(join(tmpdir(), 'bsdc-migration-'));
  const path = join(scratch, migration.file);
  writeFileSync(
    path,
    [
      'begin;',
      migration.sql,
      `insert into supabase_migrations.schema_migrations (version, name, statements, checksum)
       values ('${migration.version}', '${migration.name}', array[]::text[], '${migration.checksum}')
       on conflict (version) do update
         set name = excluded.name,
             checksum = excluded.checksum,
             applied_at = now();`,
      'commit;',
    ].join('\n\n'),
  );
  psql(url, path, { file: true });
}

/* ------------------------------------------------------------------ *
 * Assertions run after a verification apply
 * ------------------------------------------------------------------ */

const ASSERTIONS = [
  {
    label: 'every table in public has row level security enabled',
    sql: `select coalesce(string_agg(relname, ', '), '')
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    expect: '',
  },
  {
    label: 'every table in public has at least one policy',
    sql: `select coalesce(string_agg(c.relname, ', '), '')
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'r'
            and not exists (select 1 from pg_policy p where p.polrelid = c.oid)`,
    expect: '',
  },
  {
    label: 'no security definer function runs with a mutable search path',
    sql: `select coalesce(string_agg(p.proname, ', '), '')
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname in ('public', 'bsdc') and p.prosecdef
            and (p.proconfig is null or not exists (
              select 1 from unnest(p.proconfig) cfg where cfg like 'search_path=%'))`,
    expect: '',
  },
  {
    label: 'anon holds no table-level insert, update or delete',
    sql: `select coalesce(string_agg(distinct table_name, ', '), '')
          from information_schema.role_table_grants
          where grantee = 'anon' and privilege_type in ('INSERT', 'UPDATE', 'DELETE')`,
    expect: '',
  },
];

/**
 * What the migrations could not do.
 *
 * A migration that meets an object it has no rights over — `storage` is owned by
 * `supabase_storage_admin`, not by the role applying here — records the refusal in
 * `bsdc.deployment_notes` instead of failing the whole run. That is only useful if
 * somebody reads it, so the run ends by printing every note that is still open. A
 * note clears itself the first time a run manages the work it describes.
 */
function reportDeploymentNotes(url) {
  let output = '';
  try {
    output = psql(url, DEPLOYMENT_NOTES_SQL);
  } catch {
    // A database from before the table existed owes nothing this run can name.
    return 0;
  }
  const notes = output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  if (notes.length === 0) return 0;

  process.stdout.write(
    `\n${notes.length} thing(s) the migrations could not do with the rights they were given:\n`,
  );
  for (const note of notes) {
    const [topic, detail] = note.split(' :: ');
    process.stdout.write(`  ! ${topic}\n`);
    if (detail) process.stdout.write(`    ${detail}\n`);
  }
  process.stdout.write('    The exact SQL and the dashboard path are in docs/deploying.md.\n');
  return notes.length;
}

/* ------------------------------------------------------------------ *
 * --check: read-only. What does this database still owe?
 * ------------------------------------------------------------------ */

/**
 * A migration that could not do its work writes it down; a database that was
 * changed by hand writes nothing down at all. `--check` reads the catalog and
 * answers the second case: which migrations are unapplied, and whether the one
 * part of this schema that belongs to somebody else — Storage — is actually set
 * up. Nothing here writes.
 */

async function check(url) {
  const ask = (sql) => psql(url, sql).trim();
  const problems = [];
  const line = (ok, label, detail = '') => {
    process.stdout.write(`${ok ? 'ok  ' : 'MISS'}  ${label}${detail ? `  (${detail})` : ''}\n`);
    if (!ok) problems.push(label);
  };

  process.stdout.write(`Checking ${describeTarget(url)}, changing nothing.\n\n`);

  // -- the ledger ---------------------------------------------------------
  const ledger = ask(`select to_regclass('supabase_migrations.schema_migrations')::text`);
  if (ledger === '') {
    line(false, 'no migration ledger: this database has not been through db-push');
  } else {
    const applied = readLedger(url);
    const pending = plan(listMigrations(), applied).filter((entry) => entry.action === 'apply');
    line(
      pending.length === 0,
      'every migration in the repository is applied',
      pending.length === 0
        ? `${applied.size} recorded`
        : `${pending.length} pending: ${pending.map((entry) => entry.version).join(', ')}`,
    );
  }

  // -- storage, the one schema this platform does not own -----------------
  const storage = await storageHealth(ask);
  for (const line of storage.lines) {
    process.stdout.write(
      `${line.ok ? 'ok  ' : 'MISS'}  ${line.label}${line.detail ? `  (${line.detail})` : ''}\n`,
    );
  }
  problems.push(...storage.problems);

  // -- what the migrations themselves wrote down --------------------------
  const notesTable = ask(`select to_regclass('bsdc.deployment_notes')::text`);
  if (notesTable !== '') {
    const notes = reportDeploymentNotes(url);
    if (notes > 0) problems.push(`${notes} unresolved deployment note(s)`);
  }

  if (problems.length > 0) {
    process.stdout.write(
      `\n${problems.length} thing(s) still owed. The remedy for each is in docs/deploying.md;\n` +
        'the storage ones need a role that owns the table, which is the dashboard or a superuser.\n',
    );
    return 1;
  }
  process.stdout.write('\nNothing is owed.\n');
  return 0;
}

function runAssertions(url) {
  let failures = 0;
  for (const assertion of ASSERTIONS) {
    const actual = psql(url, assertion.sql).trim();
    const ok = actual === assertion.expect;
    process.stdout.write(`${ok ? 'ok  ' : 'FAIL'}  ${assertion.label}\n`);
    if (!ok) {
      failures += 1;
      process.stdout.write(`      offending: ${actual}\n`);
    }
  }
  return failures;
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

function selfTest() {
  const checks = [];
  const assert = (label, condition) => checks.push({ label, ok: Boolean(condition) });

  const migrations = listMigrations();
  assert('migrations are discovered', migrations.length > 0);
  assert('numbering has no gap', true); // listMigrations throws otherwise
  assert(
    'each file has a checksum',
    migrations.every((entry) => entry.checksum.length === 16),
  );
  assert(
    'the first file is the core schema',
    migrations[0].name.includes('core') && migrations[0].version === '0001',
  );

  const applied = new Map(
    migrations.slice(0, 2).map((entry) => [entry.version, { checksum: entry.checksum }]),
  );
  const planned = plan(migrations, applied);
  assert('an applied, unchanged file is skipped', planned[0].action === 'skip');
  assert('an unapplied file is applied', planned[2].action === 'apply');

  const changed = new Map([[migrations[0].version, { checksum: 'deadbeefdeadbeef' }]]);
  assert('a changed file is applied again', plan(migrations, changed)[0].action === 'apply');
  assert(
    '--all re-applies everything',
    plan(migrations, applied, { all: true }).every((entry) => entry.action === 'apply'),
  );
  assert(
    'the target description carries no credentials',
    !describeTarget('postgresql://user:secret@db.example.com:5432/postgres').includes('secret'),
  );

  for (const check of checks)
    process.stdout.write(`${check.ok ? 'ok  ' : 'FAIL'}  ${check.label}\n`);
  const failed = checks.filter((check) => !check.ok).length;
  process.stdout.write(`\n${checks.length - failed} passed, ${failed} failed.\n`);
  return failed === 0 ? 0 : 1;
}

async function main() {
  if (want('--self-test')) return selfTest();

  const migrations = listMigrations();

  if (want('--plan')) {
    process.stdout.write(`${migrations.length} migrations, in order:\n`);
    for (const migration of migrations) {
      process.stdout.write(
        `  ${migration.version}  ${migration.name.padEnd(28)} ${String(migration.sql.split('\n').length).padStart(5)} lines  ${migration.checksum}\n`,
      );
    }
    return 0;
  }

  const url = process.env['SUPABASE_DB_URL'] ?? process.env['DATABASE_URL'] ?? '';
  if (url === '') {
    process.stderr.write(
      'SUPABASE_DB_URL is not set. Refusing to guess which database to change.\n',
    );
    return 2;
  }
  if (!existsSync(migrationsDir)) {
    process.stderr.write('No supabase/migrations directory found.\n');
    return 2;
  }

  if (want('--check')) return await check(url);

  process.stdout.write(`Target: ${describeTarget(url)}\n`);

  const applied = readLedger(url);
  const work = plan(migrations, applied, { all: want('--all') });
  const todo = work.filter((entry) => entry.action === 'apply');

  for (const entry of work) {
    process.stdout.write(
      `  ${entry.action === 'apply' ? 'APPLY' : 'skip '}  ${entry.file}  (${entry.because})\n`,
    );
  }

  if (want('--dry-run')) {
    process.stdout.write(
      `\n${todo.length} would be applied, ${work.length - todo.length} skipped. Nothing was changed.\n`,
    );
    return 0;
  }

  for (const entry of todo) {
    process.stdout.write(`applying ${entry.file} ... `);
    applyOne(url, entry);
    process.stdout.write('done\n');
  }
  process.stdout.write(`\n${todo.length} applied, ${work.length - todo.length} already present.\n`);
  reportDeploymentNotes(url);

  if (want('--verify')) {
    // Running the whole set a second time proves the claim the audit makes
    // about these files: every one of them is idempotent.
    process.stdout.write('\nre-applying every migration to prove idempotency\n');
    for (const entry of migrations) {
      applyOne(url, entry);
    }
    process.stdout.write('all migrations applied twice without error\n\n');
    const failures = runAssertions(url);
    if (failures > 0) {
      process.stdout.write(`\n${failures} assertion(s) failed.\n`);
      return 1;
    }
    process.stdout.write('\nevery assertion held.\n');
    reportDeploymentNotes(url);
  }

  return 0;
}

process.exit(await main());
