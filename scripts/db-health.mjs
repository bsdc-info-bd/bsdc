/**
 * Is this database's storage actually set up?
 *
 * `storage` is the one schema in this project that this platform does not own —
 * it belongs to `supabase_storage_admin`, and the role that applies migrations
 * has no CREATE on it. Migration 0056 therefore attempts its storage work rather
 * than asserting it, and writes down whatever it was refused. This module is the
 * other half of that: it reads the catalog and says, out loud, whether the media
 * bucket and its five policies are really there.
 *
 * It takes a `q(sql) -> string` callback rather than a connection so that the
 * exact same questions can be asked of a live database by `scripts/db-push.mjs
 * --check` and of a pglite database by `main-site/scripts/db-prove/t34.mjs`.
 * Every query is read-only.
 */

/** The five policies migration 0056 puts on `storage.objects`. */
export const STORAGE_POLICIES = [
  'bsdc media is readable by anybody',
  'bsdc media is written in your own folder',
  'bsdc media is moved in your own folder',
  'bsdc media is deleted by its owner',
  'bsdc media is reachable by staff',
];

/**
 * `q` may be synchronous — `db-push.mjs` shells out to psql — or a promise, which
 * is what pglite needs; every answer is awaited either way.
 *
 * @param {(sql: string) => string | Promise<string>} q one row, one column, as text
 * @returns {Promise<{ lines: { ok: boolean, label: string, detail: string }[], problems: string[] }>}
 */
export async function storageHealth(q) {
  const lines = [];
  const problems = [];
  /** Postgres renders `boolean::text` as 'true'; psql a bare boolean as 't'. */
  const yes = (value) => value === 't' || value === 'true';
  const ask = (ok, label, detail = '') => {
    lines.push({ ok, label, detail });
    if (!ok) problems.push(label);
  };

  const hasSchema = yes(
    await q(`select exists (select 1 from pg_namespace where nspname = 'storage')::text`),
  );
  ask(hasSchema, 'the storage schema exists');
  if (!hasSchema) return { lines, problems };

  const tables = (
    await q(
      `select (to_regclass('storage.buckets') is not null)::text
            || ',' || (to_regclass('storage.objects') is not null)::text`,
    )
  ).split(',');
  const [hasBuckets, hasObjects] = tables;
  ask(yes(hasBuckets), 'storage.buckets exists');
  ask(yes(hasObjects), 'storage.objects exists');

  if (yes(hasBuckets)) {
    const bucket = (
      await q(
        `select count(*)::text || ',' ||
                coalesce(max(case when b."public" then 'true' else 'false' end), 'false')
           from storage.buckets b where b.id = 'media'`,
      )
    ).split(',');
    ask(bucket[0] === '1', 'the bucket named media exists');
    if (bucket[0] === '1') {
      ask(yes(bucket[1]), 'and it is public, so a media URL serves');
      const limits = await q(
        `select coalesce(b.file_size_limit::text, 'none')
           from storage.buckets b where b.id = 'media'`,
      );
      ask(
        limits === 'none' || Number(limits) >= 1024 * 1024,
        'and it allows an upload worth sending',
        limits,
      );
    }
  }

  if (yes(hasObjects)) {
    const present = (
      await q(
        `select coalesce(string_agg(p.policyname, ',' order by p.policyname), '')
           from pg_policies p where p.schemaname = 'storage' and p.tablename = 'objects'`,
      )
    )
      .split(',')
      .filter(Boolean);
    const missing = STORAGE_POLICIES.filter((name) => !present.includes(name));
    ask(
      missing.length === 0,
      'all five media policies are on storage.objects',
      missing.length === 0
        ? `${present.length} policies in total`
        : `missing: ${missing.join('; ')}`,
    );

    const rls = await q(
      `select coalesce(
          (select c.relrowsecurity::text from pg_class c
             join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'storage' and c.relname = 'objects'), 'missing')`,
    );
    ask(yes(rls), 'row level security is on for storage.objects', yes(rls) ? '' : rls);
  }

  return { lines, problems };
}

/** The SQL that lists what migrations could not do, newest debt first. */
export const DEPLOYMENT_NOTES_SQL = `
select topic || ' :: ' || replace(detail, E'\\n', ' ')
  from bsdc.deployment_notes
 where resolved_at is null
 order by topic`;
