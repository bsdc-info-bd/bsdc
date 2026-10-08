#!/usr/bin/env node
/**
 * Every proof this repository makes about its database, in one command.
 *
 * Each harness replays `supabase/migrations/` from nothing into an in-process
 * Postgres (PGlite), then asks the database the questions the migration
 * promised to answer — as `anon`, as a member, as staff, as the owner. Nothing
 * here touches a network or a secret: the schema is built from the files in
 * this repository, so a claim about production can be checked before it is
 * deployed, and checked again by CI on every pull request.
 *
 *      npm run db:prove
 *
 * Add a harness by dropping `tNN.mjs` in this directory and naming it below;
 * a harness exits non-zero when any one of its checks fails.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const HARNESSES = [
  ['t15.mjs', 'courses, quizzes, certificates and the counters behind them'],
  ['t19.mjs', 'the platform tables staff write — incidents, notices, service checks'],
  ['t20.mjs', 'the thirty day recovery window: trash, restore, expiry, purge'],
  ['t21.mjs', 'the messenger: publication, replica identity, reactions, receipts, privacy'],
  ['t22.mjs', 'a profile row without a handle, and a picture that survives a sign-in'],
  ['t23.mjs', 'the post author as moderator, and the row they can read again'],
  ['t24.mjs', '0046–0053 applied three times over: nothing doubles, nothing breaks'],
  ['t25.mjs', 'the new endpoints refuse anonymous callers and serve members'],
  ['rls-proof-run.mjs', "the repository's own scripts/rls-proof.sql, the CI gate"],
];

const results = [];
for (const [file, description] of HARNESSES) {
  process.stdout.write(`\n=== ${file} — ${description}\n`);
  const run = spawnSync(process.execPath, [join(HERE, file)], { stdio: 'inherit' });
  results.push({ file, description, ok: run.status === 0 });
}

console.log('\n=== db:prove summary');
for (const { file, description, ok } of results) {
  console.log(`${ok ? 'pass' : 'FAIL'}  ${file.padEnd(18)} ${description}`);
}
const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length} of ${results.length} harnesses passed`);
process.exit(failed.length === 0 ? 0 : 1);
