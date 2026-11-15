// 0107: no live database function deletes without a WHERE clause.
// Production rejects "DELETE requires a WHERE clause" (safe-update). The replay
// does not run that guard, so this harness reads the replayed function bodies
// and checks each `delete from` for a WHERE clause.
import { makeDb } from './lib.mjs';

let failed = 0;
const pass = (label) => console.log(`ok    ${label}`);
const fail = (label) => {
  failed += 1;
  console.log(`FAIL  ${label}`);
};

const db = await makeDb();

// Check the live function bodies, which are what production runs. Historical
// migration text that a later migration replaces is not what runs.
const live = await db.query(
  `select n.nspname || '.' || p.proname as name, p.prosrc as src
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'bsdc')`,
);
const bare = [];
for (const row of live.rows) {
  const src = row.src.replace(/--[^\n]*/g, '');
  for (const m of src.matchAll(/\bdelete\s+from\s+([\w.]+)/gi)) {
    const end = src.indexOf(';', m.index);
    const stmt = src.slice(m.index, end === -1 ? undefined : end);
    if (!/\bwhere\b/i.test(stmt)) bare.push(`${row.name}: ${stmt.trim().slice(0, 60)}`);
  }
}
if (bare.length === 0) pass('no live function deletes without a WHERE clause');
else for (const b of bare) fail(`a live function deletes without a WHERE clause — ${b}`);

const fn = await db.query(
  `select pg_get_functiondef('public.mk_place_order(uuid,jsonb,jsonb)'::regprocedure) as d`,
);
if (/delete from _mk_order_lines where true/.test(fn.rows[0].d))
  pass('mk_place_order clears its scratch table with a WHERE');
else fail('mk_place_order still has a bare delete');

console.log(`\nSUMMARY: ${failed === 0 ? 'all passed' : `${failed} failed`}`);
process.exitCode = failed === 0 ? 0 : 1;
