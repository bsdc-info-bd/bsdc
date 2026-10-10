/**
 * Proof for 0055: the first owner has a door, and nobody else walks through it.
 *
 * A fresh deployment used to have an admin panel that could not be opened.
 * `my_permissions()` asks `bsdc.actor_role()`, which read `profiles.role`;
 * every row begins at 'member'; the only writer of that column demands a
 * permission only manager and above hold; and the browser claim path mints an
 * elevated claim only for a uid in a Cloudflare secret that only an owner
 * could have arranged. The migration breaks that loop at the one place it is
 * safe to break it — an address Firebase has already verified — and these
 * checks hold both halves of the promise:
 *
 *  1. the named address arrives as an owner and can use the panel, promote
 *     somebody, and write the rank onto its own row;
 *  2. an address nobody proved, a different address, an anonymous caller and a
 *     member who asks for the rank all get nothing at all.
 *
 * It also checks the two lists agree: the address seeded in the database and
 * the address compiled into the edge function are the same string, read out of
 * the source rather than retyped here.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDb, MIGRATIONS_DIR } from './lib.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const MIGRATION = join(MIGRATIONS_DIR, '0055_the_first_owner_has_nobody_to_ask.sql');
const CLAIMS_CORE = join(HERE, '..', '..', 'functions', 'api', 'auth', 'claims-core.ts');

let pass = 0;
const bad = [];
function check(condition, label, detail = '') {
  if (condition) {
    pass += 1;
    console.log(`ok    ${label}`);
  } else {
    bad.push(label);
    console.log(`FAIL  ${label}${detail ? `  -> ${detail}` : ''}`);
  }
}

const db = await makeDb();

await db.exec(`
  insert into public.profiles (uid, username, display_name) values
    ('rrc-uid',  'rrcadmin',  'RRC Admin'),
    ('mod-uid',  'modadmin',  'Second Administrator'),
    ('member-uid','memberone','Member One'),
    ('stranger-uid','strangerone','Somebody Else');
`);

/** Runs one query as one identity, with the claims a Firebase token carries. */
async function as(sub, claims, sql) {
  const payload = JSON.stringify({ sub, role: 'authenticated', bsdc_role: 'member', ...claims });
  try {
    await db.exec(
      `set role authenticated; select set_config('request.jwt.claims', $jwt$${payload}$jwt$, false);`,
    );
    return { ok: true, rows: (await db.query(sql)).rows };
  } catch (error) {
    return { ok: false, code: error.code, message: String(error.message).split('\n')[0] };
  } finally {
    await db.exec('reset role;');
  }
}

// `member-uid` is the account this proof promotes, so the negative checks run
// as `stranger-uid`: a member who is now a moderator would pass them wrongly.
const VERIFIED = { email: 'rrc@bsdc.info.bd', email_verified: true };
const GOOGLE = {
  email: 'RRC@bsdc.info.bd',
  email_verified: false,
  firebase: { sign_in_provider: 'google.com' },
};
const UNPROVED = {
  email: 'rrc@bsdc.info.bd',
  email_verified: false,
  firebase: { sign_in_provider: 'password' },
};
const SOMEBODY_ELSE = { email: 'member@bsdc.info.bd', email_verified: true };

// ---------------------------------------------------------------- the list ---
const seeded = await db.query(
  `select email::text as email, role::text as role from bsdc.bootstrap_admins order by email`,
);
check(seeded.rows.length === 1, 'the bootstrap list is seeded with exactly one address');
const address = seeded.rows[0]?.email ?? '';
check(address === 'rrc@bsdc.info.bd', 'and it is the main administrator', address);
check(seeded.rows[0]?.role === 'owner', 'ranked owner', seeded.rows[0]?.role ?? '');

const source = readFileSync(CLAIMS_CORE, 'utf8');
const compiled = [...source.matchAll(/'([a-z0-9._+-]+@[a-z0-9.-]+)'/g)].map((m) => m[1]);
check(
  compiled.includes(address),
  'the edge function names the same address the database does',
  compiled.join(',') || 'none found',
);
check(
  /BOOTSTRAP_OWNER_EMAILS/.test(source) && /bootstrapOwnerRole/.test(source),
  'and the claim path really consults that list',
);

// ------------------------------------------------------- nobody can read it ---
for (const [label, role] of [
  ['a member', 'authenticated'],
  ['a visitor', 'anon'],
]) {
  try {
    await db.exec(`set role ${role}; select count(*) from bsdc.bootstrap_admins;`);
    check(false, `${label} cannot read the bootstrap list`);
  } catch (error) {
    check(error.code === '42501', `${label} cannot read the bootstrap list`, error.code);
  } finally {
    await db.exec('reset role;');
  }
}

// ------------------------------------------------- the door opens for one ---
const mine = await as('rrc-uid', VERIFIED, `select * from public.my_role()`);
check(mine.ok, 'my_role() answers the named administrator', mine.message ?? '');
const row = mine.rows?.[0] ?? {};
check(row.role === 'owner', 'and says owner', String(row.role));
check(row.staff === true, 'and says staff', String(row.staff));
check(row.bootstrap === true, 'and says the list is what granted it', String(row.bootstrap));

const perms = await as('rrc-uid', VERIFIED, `select public.my_permissions() as permissions`);
const granted = perms.rows?.[0]?.permissions ?? [];
check(granted.length > 0, `the panel's permissions arrive (${granted.length})`);
for (const needed of ['people.role', 'settings.write', 'audit.read']) {
  check(granted.includes(needed), `including ${needed}`);
}

const overview = await as(
  'rrc-uid',
  VERIFIED,
  `select count(*)::int as n from public.admin_overview()`,
);
check(overview.ok && (overview.rows?.[0]?.n ?? 0) === 1, 'admin_overview() answers them');

const promote = await as(
  'rrc-uid',
  VERIFIED,
  `select public.set_user_role('member-uid', 'moderator')::text as role`,
);
check(promote.ok && promote.rows?.[0]?.role === 'moderator', 'and they can promote a member');

// A federated sign-in proves the address at the provider instead.
const federated = await as('rrc-uid', GOOGLE, `select role from public.my_role()`);
check(federated.ok && federated.rows?.[0]?.role === 'owner', 'a Google sign-in earns the same');

// ------------------------------------------------------- the door stays shut ---
const unproved = await as('stranger-uid', UNPROVED, `select * from public.my_role()`);
check(
  unproved.ok && unproved.rows?.[0]?.role === 'member' && unproved.rows?.[0]?.bootstrap === false,
  'an address nobody proved earns nothing',
  JSON.stringify(unproved.rows?.[0] ?? unproved.message),
);

const stranger = await as('stranger-uid', SOMEBODY_ELSE, `select role from public.my_role()`);
check(
  stranger.ok && stranger.rows?.[0]?.role === 'member',
  'a different verified address earns nothing',
);

let anonStaff = true;
try {
  await db.exec(
    `set role anon; select set_config('request.jwt.claims', '{"sub":"","role":"anon"}', false);`,
  );
  const result = await db.query(`select bsdc.is_staff() as staff`);
  anonStaff = result.rows?.[0]?.staff === true;
} finally {
  await db.exec('reset role;');
}
check(!anonStaff, 'a visitor is not staff');

// No recursion: `profiles`' own read policy calls bsdc.is_staff(), so a
// function that read `profiles` back would loop until Postgres stopped it.
const profilesReadable = await as(
  'stranger-uid',
  SOMEBODY_ELSE,
  `select count(*)::int as n from public.profiles`,
);
check(profilesReadable.ok, 'the profiles policy that calls is_staff() still runs (no recursion)');

const refusedClaim = await as(
  'stranger-uid',
  SOMEBODY_ELSE,
  `select public.claim_bootstrap_role()`,
);
check(
  !refusedClaim.ok && refusedClaim.code === '42501',
  'a member cannot claim the bootstrap rank',
  refusedClaim.code ?? 'unexpectedly allowed',
);

const refusedOverview = await as(
  'stranger-uid',
  SOMEBODY_ELSE,
  `select count(*)::int as n from public.admin_overview()`,
);
check(
  refusedOverview.ok && (refusedOverview.rows?.[0]?.n ?? 1) === 0,
  'and the panel itself stays empty for them',
);

// ------------------------------------------------- writing the row to match ---
const claimed = await as('rrc-uid', VERIFIED, `select public.claim_bootstrap_role() as role`);
check(claimed.ok && claimed.rows?.[0]?.role === 'owner', 'claim_bootstrap_role() writes the row');

const stored = await db.query(
  `select role::text as role from public.profiles where uid = 'rrc-uid'`,
);
check(stored.rows?.[0]?.role === 'owner', 'and the row now says owner');

const after = await as('rrc-uid', VERIFIED, `select * from public.my_role()`);
check(
  after.rows?.[0]?.role === 'owner' && after.rows?.[0]?.bootstrap === false,
  'afterwards the row, not the list, is what grants it',
  JSON.stringify(after.rows?.[0] ?? {}),
);

const twice = await as('rrc-uid', VERIFIED, `select public.claim_bootstrap_role() as role`);
check(twice.ok && twice.rows?.[0]?.role === 'owner', 'claiming twice changes nothing');

const audited = await db.query(
  `select count(*)::int as n from public.audit_log where action = 'people.role.bootstrap'`,
);
check((audited.rows?.[0]?.n ?? 0) === 1, 'and it was audited exactly once');

// --------------------------------------------------- a lower bootstrap rank ---
await db.exec(
  `insert into bsdc.bootstrap_admins (email, role, note)
   values ('second@bsdc.info.bd', 'moderator', 'proof only')`,
);
const lower = await as(
  'mod-uid',
  { email: 'second@bsdc.info.bd', email_verified: true },
  `select * from public.my_role()`,
);
check(
  lower.rows?.[0]?.role === 'moderator' && lower.rows?.[0]?.staff === true,
  'the list can name a rank below owner, and it still counts as staff',
  JSON.stringify(lower.rows?.[0] ?? {}),
);
const lowerPerms = await as(
  'mod-uid',
  { email: 'second@bsdc.info.bd', email_verified: true },
  `select public.my_permissions() as permissions`,
);
check(
  !(lowerPerms.rows?.[0]?.permissions ?? []).includes('settings.write'),
  'without the owner-only permissions',
);
await db.exec(`delete from bsdc.bootstrap_admins where email = 'second@bsdc.info.bd'`);
const revoked = await as(
  'mod-uid',
  { email: 'second@bsdc.info.bd', email_verified: true },
  `select role from public.my_role()`,
);
check(revoked.rows?.[0]?.role === 'member', 'and deleting the row takes the rank away again');

// ------------------------------------------------------------- twice over ---
for (let round = 1; round <= 2; round += 1) {
  try {
    await db.exec(readFileSync(MIGRATION, 'utf8'));
    check(true, `0055 re-applied (round ${round})`);
  } catch (error) {
    check(false, `0055 re-applied (round ${round})`, String(error.message).split('\n')[0]);
  }
}
const stillOne = await db.query(`select count(*)::int as n from bsdc.bootstrap_admins`);
check(stillOne.rows?.[0]?.n === 1, 'the list did not grow');
const stillRefused = await as(
  'stranger-uid',
  SOMEBODY_ELSE,
  `select public.claim_bootstrap_role()`,
);
check(!stillRefused.ok, 'and the refusals held through the re-application');

await db.close();
console.log('');
console.log(`SUMMARY: ${pass} passed, ${bad.length} failed`);
if (bad.length) console.log(`  failed: ${bad.join(', ')}`);
process.exit(bad.length === 0 ? 0 : 1);
