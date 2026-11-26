/**
 * 0150: internal-only catalogs stay explicitly deny-all under row-level security.
 */
import { makeDb, summary, check } from './lib.mjs';

const tables = ['audit_origin_keys', 'bulk_plans', 'verification_attempts', 'verification_fields'];
const db = await makeDb();

const { rows: policies } = await db.query(
  `select c.relname as table_name,
          p.polcmd,
          pg_get_expr(p.polqual, p.polrelid) as using_expr,
          pg_get_expr(p.polwithcheck, p.polrelid) as check_expr
     from pg_policy p
     join pg_class c on c.oid = p.polrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = any($1::text[])
      and p.polname = c.relname || '_internal_deny'
    order by c.relname`,
  [tables],
);

check(
  policies.length === tables.length,
  '0150 installs an explicit internal deny policy on each protected table',
  `expected ${tables.length}, found ${policies.length}`,
);
check(
  policies.every(
    (policy) =>
      policy.polcmd === '*' && policy.using_expr === 'false' && policy.check_expr === 'false',
  ),
  'each internal policy denies every command and row',
  JSON.stringify(policies),
);

for (const role of ['anon', 'authenticated']) {
  const { rows } = await db.query(
    `select table_name
       from information_schema.role_table_grants
      where grantee = $1
        and table_schema = 'public'
        and table_name = any($2::text[])
        and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')`,
    [role, tables],
  );
  check(
    rows.length === 0,
    `${role} has no direct DML grants on internal catalogs`,
    JSON.stringify(rows),
  );
}

await db.close();
process.exit(summary() === 0 ? 0 : 1);
