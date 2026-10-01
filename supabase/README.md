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
   supabase db push                      # or
   psql "$DATABASE_URL" -f migrations/0001_core_schema.sql
   psql "$DATABASE_URL" -f migrations/0002_row_level_security.sql
   ```

3. Copy the project URL and the publishable (anon) key into
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.

The service-role key is never used in the browser. Server-side jobs read it
from Cloudflare Pages encrypted environment variables.

## Migrations

| File | Contents |
|---|---|
| `0001_core_schema.sql` | extensions, `bsdc` helper functions, enums, `profiles`, `reserved_usernames`, `follows`, `blocks`, `media_assets`, `feature_flags`, `reports`, `audit_log`, counter triggers and `claim_username()` |
| `0002_row_level_security.sql` | RLS enabled on every table, least-privilege policies, column-level update grants so role and counters cannot be written from the client |
