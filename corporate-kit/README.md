# BSDC Corporate Kit

- **Folder**: `corporate-kit/`
- **Deployed**: never. This is the shared source the corporate consoles compile.
- **Consumed by**: `config-site`, `customize-site`, `connect-site`, `ip-site`,
  `status-site`, `users-admin-site`, `users-moderator-site`
- **Delivered in**: Response 16 of the 20-response build plan

Seven staff consoles need the same session gate, the same error wording, the
same table and the same arithmetic. Repeating that seven times guarantees
seven subtly different answers to the same question, so it lives here once.

## How it is consumed

Each console maps `@kit` to `../corporate-kit/src` in both `tsconfig.json`
and `vite.config.ts`. Nothing is published or built into a package: the
sources are compiled by whichever console imports them, so a change here is
type-checked, linted and bundled by every console in the same commit. The kit
still carries its own `package.json` so continuous integration runs the same
quality gates over it as over an application.

## What is in it

| Area | Contents |
| --- | --- |
| `src/data` | Environment reading, the Firebase (`bsdc-second`) and Supabase clients, the session provider and role gate, error translation, realtime chat transport |
| `src/domain` | Pure logic: configuration validation, page section ordering, staff card check digits and role ranks, IPv4 rule matching, uptime arithmetic, chat grouping |
| `src/ui` | One hand-written stylesheet, the small set of controls, the application shell with its sign-in form and role gate, and the async loading hook |

## The rules it keeps

- **The browser never decides what it may do.** The gate reads the role from
  Postgres rather than from a token claim, so removing a role takes effect on
  the next load instead of whenever a token happens to refresh.
- **Shared logic mirrors the database exactly.** Configuration validation,
  card check digits and IP decisions are reimplemented here only so a screen
  can answer immediately; where the two could disagree, the database wins and
  its message is shown.
- **Errors are translated once.** `toDataError` turns a PostgREST failure
  into a sentence an operator can act on, so no console invents its own
  wording for a permission error.

## Tests

The kit's own tests cover its infrastructure. Its domain modules are tested
by the console that owns them, so a test failure names the console whose
behaviour changed.
