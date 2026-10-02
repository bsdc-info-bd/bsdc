# Supabase (primary database)

Supabase Postgres is the source of truth for BSDC. Identity comes from
Firebase Authentication: the browser sends the Firebase ID token to PostgREST,
so inside the database the caller is `bsdc.current_uid()` — the JWT `sub`
claim — rather than a Supabase Auth user.

## Project setup

1. Create the project, then add Firebase as a third-party auth provider so
   PostgREST accepts tokens issued by `https://securetoken.google.com/bsdc-bd`.
2. Apply the migrations in order:

   ```bash
   export SUPABASE_DB_URL='postgresql://postgres:…@db.…supabase.co:5432/postgres'
   node ../scripts/db-push.mjs --dry-run   # say what would change
   node ../scripts/db-push.mjs             # apply what is missing
   ```

   Or let continuous integration do it: `.github/workflows/database.yml`
   builds the whole schema from nothing on a throwaway Postgres, applies it
   a second time to prove idempotency, asserts that every table has row
   level security and that no `security definer` function has a mutable
   search path, and only then applies the missing files to the project.
   `docs/deploying.md` has the runbook.

3. Copy the project URL and the publishable (anon) key into
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.

The service-role key is never used in the browser. Server-side jobs read it
from Cloudflare Pages encrypted environment variables.

## Migrations

| File                          | Contents                                                                                                                                                                                            |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0001_core_schema.sql`        | extensions, `bsdc` helper functions, enums, `profiles`, `reserved_usernames`, `follows`, `blocks`, `media_assets`, `feature_flags`, `reports`, `audit_log`, counter triggers and `claim_username()` |
| `0002_row_level_security.sql` | RLS enabled on every table, least-privilege policies, column-level update grants so role and counters cannot be written from the client                                                             |
