/**
 * Proof for 0074: a staff account can get in without being a member first.
 *
 * The report was precise and the cause was not where it looked. Every corporate
 * console read `public.profiles` to decide who was signed in, and nothing ever
 * created that row for a staff account: the member site creates it on first
 * sign-in, so an operator who had once signed up at bsdc.info.bd worked and an
 * operator created in the Firebase console — which is how a first owner *has* to
 * be created — was told, with the correct password, that they had no profile in
 * the community database.
 *
 * Six claims:
 *
 *   1. An operator with a staff claim and no row gets a row, and their rank
 *      comes back with it in one call.
 *   2. An operator with no staff claim gets a member row, not a staff one. The
 *      function copies the token; it cannot invent authority.
 *   3. A signed-out caller gets nothing.
 *   4. Provisioning is not a way back in past a suspension.
 *   5. An existing member's row is not rewritten: no handle is invented, no
 *      counters move, and a role is reconciled upward only.
 *   6. The bootstrap routine — the first owner — is reachable only with the
 *      secret, refuses a non-staff role, and is idempotent.
 */
import { makeDb } from './lib.mjs';

const owner = 'aaaaaaaa-1111-4111-8111-000000000001';
const member = 'cccccccc-3333-4333-8333-000000000003';
const suspended = 'dddddddd-4444-4444-8444-000000000004';
const communityMember = 'eeeeeeee-5555-4555-8555-000000000005';
const secret = 'flush-secret-0123456789abcdefghijklmnopqrstuvwxyz';

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

const db = await makeDb({ maxExclusive: '0075' });

await db.exec(`
  insert into bsdc.push_settings (name, value) values ('flush_secret', '${secret}')
    on conflict (name) do update set value = excluded.value;

  -- One row that already exists, so "an existing member keeps what they had" has
  -- something to keep.
  insert into public.profiles (uid, username, display_name, role, status, followers_count)
    values ('${communityMember}', 'longtimer', 'Long Time Member', 'member', 'active', 42);

  -- A suspended operator. Provisioning must not be a way back in.
  insert into public.profiles (uid, display_name, role, status)
    values ('${suspended}', 'Suspended Person', 'moderator', 'suspended');
`);

async function asMember(uid, sql, params = [], claimsOverride = null) {
  const claims =
    claimsOverride ??
    JSON.stringify({
      sub: uid,
      role: 'authenticated',
      bsdc_role: 'member',
      email: `${uid.slice(0, 4)}@bsdc.info.bd`,
      email_verified: true,
    });
  await db.exec(
    `set role authenticated; select set_config('request.jwt.claims', $jwt$${claims}$jwt$, false);`,
  );
  try {
    const result = await db.query(sql, params);
    return { rows: result.rows, error: null };
  } catch (error) {
    return { rows: [], error };
  } finally {
    await db.exec('reset role;');
  }
}

function staffClaims(uid, role, email) {
  return JSON.stringify({
    sub: uid,
    role: 'authenticated',
    bsdc_role: role,
    email,
    email_verified: true,
    staff: true,
  });
}

// ------------------------------------------- an operator with no row at all ---

const ownerClaims = staffClaims(owner, 'owner', 'owner@bsdc.info.bd');
const provisioned = await asMember(owner, `select * from public.provision_staff('Owner Person')`, [], ownerClaims);
check(provisioned.error === null, 'an operator with a staff claim and no row gets a row', provisioned.error?.message ?? '');
check(provisioned.rows.length === 1, 'exactly one row comes back');
check(provisioned.rows[0]?.role === 'owner', 'the row carries the role the token already had', provisioned.rows[0]?.role ?? '');
check(provisioned.rows[0]?.display_name === 'Owner Person', 'the row carries the name that was given');
check(provisioned.rows[0]?.username === null, 'no handle is invented, so staff do not appear in @-mention search');
check(provisioned.rows[0]?.status === 'active', 'the new row is active');
check(provisioned.rows[0]?.onboarding_complete === true, 'the console is not sent to an onboarding flow');

const provisionedAgain = await asMember(owner, `select * from public.provision_staff('Another Name')`, [], ownerClaims);
check(provisionedAgain.error === null, 'provisioning twice is not an error');
check(
  provisionedAgain.rows[0]?.display_name === 'Owner Person',
  'provisioning twice does not rename anybody',
  provisionedAgain.rows[0]?.display_name ?? '',
);

const audited = await db.query(
  `select action, metadata from public.audit_log where subject = '${owner}' order by id`,
);
check(audited.rows.length === 1, 'the provisioning is recorded in the audit log once');
check(audited.rows[0]?.action === 'staff.provisioned', 'the audit row says what happened');
check(audited.rows[0]?.metadata?.role === 'owner', 'the audit row records the role');

// ------------------------------------------------- the one call a console makes ---

const identity = await asMember(owner, `select * from public.staff_identity()`, [], ownerClaims);
check(identity.error === null, 'the console reads its own identity in one call', identity.error?.message ?? '');
check(identity.rows.length === 1, 'the identity call returns the caller and nobody else');
check(identity.rows[0]?.role === 'owner', 'the identity call reports the role');
check(identity.rows[0]?.rank === 7, 'the identity call reports the rank', String(identity.rows[0]?.rank));
check(identity.rows[0]?.status === 'active', 'the identity call reports the status');
check(
  identity.rows[0]?.last_seen_at !== null,
  'opening a console records that it was opened',
);

// ---------------------------------------------- an operator without rank ---

const memberClaims = JSON.stringify({
  sub: member,
  role: 'authenticated',
  bsdc_role: 'member',
  email: 'member@bsdc.info.bd',
  email_verified: true,
});
const notStaff = await asMember(member, `select * from public.provision_staff('Just A Member')`, [], memberClaims);
check(notStaff.error === null, 'a caller without a staff claim can still be provisioned');
check(
  notStaff.rows[0]?.role === 'member',
  'their role is member, because that is what their token says',
  notStaff.rows[0]?.role ?? '',
);
const memberIdentity = await asMember(member, `select rank from public.staff_identity()`, [], memberClaims);
check(memberIdentity.rows[0]?.rank === 1, 'a member has rank 1, so every console screen refuses them');

// ------------------------------------------------ a suspended account ---

const trySuspended = await asMember(
  suspended,
  `select * from public.provision_staff('Back Again')`,
  [],
  staffClaims(suspended, 'moderator', 'suspended@bsdc.info.bd'),
);
check(trySuspended.error !== null, 'a suspended account is refused, not quietly reactivated');
const stillSuspended = (
  await db.query(`select status from public.profiles where uid = '${suspended}'`)
).rows[0];
check(stillSuspended?.status === 'suspended', 'the suspension is untouched');

// ------------------------------------- an existing community member joins staff ---

const promoted = await asMember(
  communityMember,
  `select * from public.provision_staff('Their New Name')`,
  [],
  staffClaims(communityMember, 'admin', 'longtime@bsdc.info.bd'),
);
check(promoted.error === null, 'an existing member can be given console access', promoted.error?.message ?? '');
check(promoted.rows[0]?.role === 'admin', 'the role is reconciled upward from the token', promoted.rows[0]?.role ?? '');
check(
  promoted.rows[0]?.username === 'longtimer',
  'their handle is not taken away',
  promoted.rows[0]?.username ?? '',
);
check(
  Number(promoted.rows[0]?.followers_count) === 42,
  'their counters are not reset',
  String(promoted.rows[0]?.followers_count),
);
check(
  promoted.rows[0]?.display_name === 'Long Time Member',
  'their display name is not overwritten by the console',
  promoted.rows[0]?.display_name ?? '',
);

// A token that claims less than the row says is a demotion not yet applied. It
// must not be silently upgraded, and it must not be silently downgraded either.
const demoted = await asMember(
  communityMember,
  `select * from public.provision_staff()`,
  [],
  staffClaims(communityMember, 'moderator', 'longtime@bsdc.info.bd'),
);
check(
  demoted.rows[0]?.role === 'admin',
  'a token that claims less than the row is not a demotion from a console',
  demoted.rows[0]?.role ?? '',
);

// ------------------------------------------------------ a signed-out caller ---

const anonymous = await (async () => {
  await db.exec('set role anon;');
  try {
    await db.query(`select * from public.provision_staff('Nobody')`);
    return { error: null };
  } catch (error) {
    return { error };
  } finally {
    await db.exec('reset role;');
  }
})();
check(anonymous.error !== null, 'a signed-out caller has no identity to provision');

const anonymousIdentity = await (async () => {
  await db.exec('set role anon;');
  try {
    await db.query(`select * from public.staff_identity()`);
    return { error: null };
  } catch (error) {
    return { error };
  } finally {
    await db.exec('reset role;');
  }
})();
check(anonymousIdentity.error !== null, 'a signed-out caller cannot read a staff identity');

// ------------------------------------------------------------- the bootstrap ---

const bootuid = 'ffffffff-6666-4666-8666-000000000006';
const booted = await (async () => {
  await db.exec('set role anon;');
  try {
    const result = await db.query(
      `select * from public.bootstrap_staff_identity($1, $2, $3, $4, $5)`,
      [secret, bootuid, 'Boot Owner', 'owner', 'boot@bsdc.info.bd'],
    );
    return { rows: result.rows, error: null };
  } catch (error) {
    return { rows: [], error };
  } finally {
    await db.exec('reset role;');
  }
})();
check(booted.error === null, 'the first owner is bootstrapped with the secret', booted.error?.message ?? '');
check(booted.rows[0]?.role === 'owner', 'the bootstrapped row is an owner');
check(booted.rows[0]?.username === null, 'the bootstrapped owner has no handle either');

const bootedAgain = await (async () => {
  await db.exec('set role anon;');
  try {
    const result = await db.query(
      `select * from public.bootstrap_staff_identity($1, $2, $3, $4, $5)`,
      [secret, bootuid, 'A Different Name', 'admin', 'boot@bsdc.info.bd'],
    );
    return { rows: result.rows, error: null };
  } catch (error) {
    return { rows: [], error };
  } finally {
    await db.exec('reset role;');
  }
})();
check(bootedAgain.error === null, 'bootstrapping an existing uid is not an error');
check(
  bootedAgain.rows[0]?.role === 'owner',
  'an existing row is never rewritten by the bootstrap',
  bootedAgain.rows[0]?.role ?? '',
);

for (const [label, args] of [
  ['a wrong secret', ['not-the-secret', 'abababab-7777-4777-8777-000000000007', 'X', 'owner', '']],
  ['a member role', [secret, 'abababab-8888-4888-8888-000000000008', 'X', 'member', '']],
  ['a made-up role', [secret, 'abababab-9999-4999-8999-000000000009', 'X', 'superuser', '']],
  ['a uid that is too short', [secret, 'short', 'X', 'owner', '']],
]) {
  const refused = await (async () => {
    await db.exec('set role anon;');
    try {
      await db.query(
        `select * from public.bootstrap_staff_identity($1, $2, $3, $4, $5)`,
        args,
      );
      return { error: null };
    } catch (error) {
      return { error };
    } finally {
      await db.exec('reset role;');
    }
  })();
  check(refused.error !== null, `the bootstrap refuses ${label}`);
}

// --------------------------------------------------------------- the ranking ---

const ranks = (
  await db.query(
    `select bsdc.role_rank('owner') as owner, bsdc.role_rank('admin') as admin,
            bsdc.role_rank('manager') as manager, bsdc.role_rank('moderator') as moderator,
            bsdc.role_rank('member') as member, bsdc.role_rank('nonsense') as nonsense`,
  )
).rows[0];
check(
  Number(ranks.owner) === 7 &&
    Number(ranks.admin) === 6 &&
    Number(ranks.manager) === 5 &&
    Number(ranks.moderator) === 4 &&
    Number(ranks.member) === 1 &&
    Number(ranks.nonsense) === 0,
  'the database ranking matches the browser ranking in corporate-kit',
  JSON.stringify(ranks),
);

// -------------------------------------------------------------- the grants ---

for (const [signature, allowed] of [
  ['public.provision_staff(text)', ['authenticated']],
  ['public.staff_identity()', ['authenticated']],
  ['public.bootstrap_staff_identity(text, text, text, text, text)', ['anon', 'authenticated']],
]) {
  for (const role of ['anon', 'authenticated']) {
    const granted = (
      await db.query(`select has_function_privilege('${role}', '${signature}', 'execute') as ok`)
    ).rows[0];
    check(
      granted.ok === allowed.includes(role),
      `${signature} is ${allowed.includes(role) ? '' : 'not '}executable by ${role}`,
      String(granted.ok),
    );
  }
}

console.log(`\n${pass} passed, ${bad.length} failed`);
if (bad.length > 0) {
  console.log(`failed: ${bad.join(', ')}`);
  process.exit(1);
}
process.exit(0);
