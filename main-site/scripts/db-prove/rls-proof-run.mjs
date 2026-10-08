/** Run the repository's own scripts/rls-proof.sql the way CI does. */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
import { makeDb } from './lib.mjs';

const sql = readFileSync(join(REPO_ROOT, 'scripts', 'rls-proof.sql'), 'utf8')
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('\\'))
  .join('\n');

const db = await makeDb();
try {
  await db.exec('begin;\n' + sql + '\ncommit;');
  console.log('rls-proof.sql: passed');
} catch (e) {
  console.log(
    'rls-proof.sql: FAILED -> [' + (e.code ?? '?') + '] ' + String(e.message).split('\n')[0],
  );
  process.exit(1);
} finally {
  await db.close();
}
