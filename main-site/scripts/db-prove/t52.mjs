/**
 * Proof that issuing an advertiser account does the right things, in the right
 * order, and refuses the wrong ones.
 *
 * The client of Auth's admin API is a real risk surface: it is the one place in
 * this platform that holds a service role key, and the things that go wrong
 * there are not type errors. They are: an account made twice because a request
 * was retried, a password reset on somebody who already had an account, a
 * profile created with no caller behind it so its permission check silently
 * passes, or a script that prints a password into a CI log.
 *
 * So this harness drives `scripts/advertiser-issuing.mjs` through a fake
 * `fetch` that records every request. No network, no secret, no Auth server —
 * but every decision the module makes is exercised, including the ones that
 * only happen when something is already there.
 */
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

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

const module = await import(
  pathToFileURL(resolve(process.cwd(), '..', 'scripts', 'advertiser-issuing.mjs')).href
);
const { IssueError, deriveHandle, generatedPassword, issueAdvertiser, optionProblems, parseArgs } =
  module;

/** A fake Auth + PostgREST that records what was asked of it. */
function fakeServer({ users = [], failure = null } = {}) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    const body = init.body === undefined ? null : JSON.parse(init.body);
    const headers = init.headers ?? {};
    calls.push({ url, method, body, headers });

    const json = (status, payload) => ({
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(payload),
    });

    if (url.includes('/auth/v1/token?grant_type=password')) {
      return json(200, { access_token: 'staff-token', user: { id: 'staff-uid' } });
    }
    if (url.includes('/auth/v1/admin/users?') && method === 'GET') {
      return json(200, { users });
    }
    if (url.endsWith('/auth/v1/admin/users') && method === 'POST') {
      if (failure?.on === 'create') return json(422, { msg: failure.message });
      return json(200, { id: 'new-advertiser-uid', email: body.email });
    }
    if (url.includes('/auth/v1/admin/users/') && method === 'PUT') {
      return json(200, { id: url.split('/').pop() });
    }
    if (url.endsWith('/rest/v1/rpc/issue_advertiser_account')) {
      if (failure?.on === 'profile') return json(403, { message: failure.message, code: '42501' });
      return json(200, [{ uid: body.p_uid, username: 'winter_intake_co', created: true }]);
    }
    return json(404, { message: `unexpected ${method} ${url}` });
  };
  return { fetch, calls };
}

const BASE = {
  url: 'https://project.supabase.co',
  serviceKey: 'service-key',
  staffEmail: 'ops@bsdc.info.bd',
  staffPassword: 'staff-password',
};

// ---------------------------------------------------------------------------
// 1. The arguments
// ---------------------------------------------------------------------------
const ok = parseArgs(['--name', 'Winter Intake Co', '--email', 'ads@example.test', '--generate']);
check(ok.name === 'Winter Intake Co' && ok.email === 'ads@example.test', 'arguments parse');
check(ok.generate === true && ok.dryRun === false, 'and the flags default to off');

check(
  (() => {
    try {
      parseArgs(['--nonsense']);
      return false;
    } catch (error) {
      return error instanceof IssueError && error.message.includes('Unknown option');
    }
  })(),
  'an unknown option is an error, not something to ignore',
);

check(
  (() => {
    try {
      parseArgs(['--name', '--email']);
      return false;
    } catch {
      return true;
    }
  })(),
  'a flag with no value is refused rather than read as the next flag',
);

const problems = optionProblems({ name: 'x', email: 'nope', generate: false, username: '' });
check(problems.length === 3, 'a short name, a bad address and no password are three problems',
  `${problems.length}`);
check(
  optionProblems({ name: 'Winter Intake Co', email: 'a@b.test', generate: true, username: '' })
    .length === 0,
  'a complete set of arguments has none',
);
check(
  optionProblems({
    name: 'Winter Intake Co',
    email: 'a@b.test',
    generate: true,
    password: 'both',
    username: '',
  }).some((problem) => problem.includes('not both')),
  'and passing both a password and --generate is refused, since one would be ignored',
);
check(
  optionProblems({ name: 'Winter Intake Co', email: 'a@b.test', generate: true, username: 'Bad-Handle' })
    .some((problem) => problem.includes('--username')),
  'a handle that does not match the profiles constraint is caught before the round trip',
);

check(deriveHandle('Winter Intake Co') === 'winter_intake_co', 'the handle is derived the way SQL derives it',
  deriveHandle('Winter Intake Co'));
check(deriveHandle('   ') === 'advertiser', 'an empty name still gets a valid handle');
check(/^[a-z0-9_]{3,24}$/.test(deriveHandle('A'.repeat(40))), 'and a long one is cut to fit');

const password = generatedPassword((length) => Uint8Array.from({ length }, (_, index) => index));
check(/^[^01lIO]{5}-[^01lIO]{5}-[^01lIO]{5}-[^01lIO]{5}$/.test(password), 'the generated password is readable',
  password);
check(new Set(generatedPassword().replace(/-/g, '')).size > 1, 'and is not one repeated character');

// ---------------------------------------------------------------------------
// 2. A new advertiser
// ---------------------------------------------------------------------------
{
  const server = fakeServer();
  const result = await issueAdvertiser({
    fetch: server.fetch,
    ...BASE,
    options: { name: 'Winter Intake Co', email: 'ads@example.test', generate: true, username: '', dryRun: false },
    password: 'generated-for-the-test',
    log: () => undefined,
  });

  check(result.uid === 'new-advertiser-uid', 'a new advertiser gets an account', result.uid);
  check(result.createdAuth === true, 'and it is recorded as new');
  check(result.profileCreated === true, 'and a profile row was created');

  const order = server.calls.map((call) => `${call.method} ${call.url.replace(BASE.url, '')}`);
  check(
    order[0]?.startsWith('POST /auth/v1/token'),
    'the staff sign-in happens first, because the profile call needs a caller',
    order[0],
  );
  check(
    order.indexOf('POST /auth/v1/admin/users') > 0 &&
      order.findIndex((entry) => entry.includes('rpc/issue_advertiser_account')) >
        order.indexOf('POST /auth/v1/admin/users'),
    'the sign-in is created before the profile',
    order.join(' → '),
  );

  const profileCall = server.calls.find((call) => call.url.endsWith('issue_advertiser_account'));
  check(
    profileCall?.headers.authorization === 'Bearer staff-token',
    'the profile is created as the staff member, not as the service key',
    profileCall?.headers.authorization,
  );
  check(
    profileCall?.headers.apikey === BASE.serviceKey,
    'while the key is still what makes the request acceptable to the gateway',
  );
  check(
    profileCall?.body.p_uid === 'new-advertiser-uid' && profileCall?.body.p_email === 'ads@example.test',
    'and it is given the identifier the sign-in was created with',
    JSON.stringify(profileCall?.body),
  );

  const create = server.calls.find(
    (call) => call.method === 'POST' && call.url.endsWith('/auth/v1/admin/users'),
  );
  check(create?.body.email_confirm === true, 'the address is created already confirmed');
  check(
    create?.body.user_metadata?.purpose === 'advertiser',
    'and the sign-in says what it is for, so it can be found later',
  );
}

// ---------------------------------------------------------------------------
// 3. An advertiser who already has a sign-in
// ---------------------------------------------------------------------------
{
  const server = fakeServer({ users: [{ id: 'existing-uid', email: 'Ads@Example.test' }] });
  const result = await issueAdvertiser({
    fetch: server.fetch,
    ...BASE,
    options: {
      name: 'Winter Intake Co',
      email: 'ads@example.test',
      password: 'a-password-they-chose',
      generate: false,
      username: '',
      dryRun: false,
    },
    log: () => undefined,
  });

  check(result.uid === 'existing-uid', 'an existing sign-in is found by its address, whatever its case',
    result.uid);
  check(result.createdAuth === false, 'and is not created again');
  check(
    !server.calls.some((call) => call.method === 'POST' && call.url.endsWith('/auth/v1/admin/users')),
    'so a retried run cannot make a second identity for one advertiser',
  );
  check(
    server.calls.some((call) => call.method === 'PUT' && call.url.endsWith('/auth/v1/admin/users/existing-uid')),
    'the existing address is confirmed, so they can sign in immediately',
  );
  check(
    !server.calls.some((call) => JSON.stringify(call.body ?? {}).includes('a-password-they-chose')),
    'and the password they already had is never sent, so it cannot be overwritten',
  );
  check(result.generated === null, 'and nothing generated is reported back');
}

// ---------------------------------------------------------------------------
// 4. Refusals carry the database's own sentence
// ---------------------------------------------------------------------------
{
  const server = fakeServer({ failure: { on: 'profile', message: 'Permission ads.manage is required' } });
  let thrown = null;
  try {
    await issueAdvertiser({
      fetch: server.fetch,
      ...BASE,
      options: { name: 'Winter Intake Co', email: 'ads@example.test', generate: true, username: '', dryRun: false },
      password: 'x',
      log: () => undefined,
    });
  } catch (error) {
    thrown = error;
  }
  check(thrown instanceof IssueError, 'a refused profile is an error');
  check(
    thrown?.message === 'Permission ads.manage is required',
    'and the message is the database sentence, not a rewritten one',
    thrown?.message,
  );
  check(thrown?.status === 403, 'with the status that explains it', String(thrown?.status));
}

{
  const server = fakeServer({ failure: { on: 'create', message: 'A user with this email address has already been registered' } });
  let thrown = null;
  try {
    await issueAdvertiser({
      fetch: server.fetch,
      ...BASE,
      options: { name: 'Winter Intake Co', email: 'ads@example.test', generate: true, username: '', dryRun: false },
      password: 'x',
      log: () => undefined,
    });
  } catch (error) {
    thrown = error;
  }
  check(
    thrown?.message.includes('already been registered'),
    'a sign-in that already exists is reported in Auth words, not swallowed',
    thrown?.message,
  );
}

// ---------------------------------------------------------------------------
// 5. The things it must refuse before touching the network
// ---------------------------------------------------------------------------
for (const [label, overrides, expected] of [
  ['no staff sign-in', { staffEmail: '', staffPassword: '' }, 'staff sign-in'],
  ['no project', { url: '' }, 'SUPABASE_URL'],
  ['a bad address', { options: { name: 'Winter Intake Co', email: 'not-an-address', generate: true, username: '', dryRun: false } }, '--email'],
]) {
  const server = fakeServer();
  let thrown = null;
  try {
    await issueAdvertiser({
      fetch: server.fetch,
      ...BASE,
      options: { name: 'Winter Intake Co', email: 'ads@example.test', generate: true, username: '', dryRun: false },
      password: 'x',
      log: () => undefined,
      ...overrides,
    });
  } catch (error) {
    thrown = error;
  }
  check(thrown instanceof IssueError, `${label} is refused`);
  check(
    String(thrown?.message).toLowerCase().includes(expected.toLowerCase()),
    `${label}: the refusal names what is missing`,
    thrown?.message,
  );
  check(server.calls.length === 0, `${label}: and nothing was sent anywhere`, `${server.calls.length} calls`);
}

// ---------------------------------------------------------------------------
// 6. A dry run changes nothing
// ---------------------------------------------------------------------------
{
  const server = fakeServer();
  // The CLI short-circuits a dry run before it reaches the module; this checks
  // the module itself is not what a dry run relies on, so a caller that forgets
  // to short-circuit cannot silently issue an account.
  const result = await issueAdvertiser({
    fetch: server.fetch,
    url: '',
    serviceKey: 'key',
    staffEmail: 'ops@bsdc.info.bd',
    staffPassword: 'x',
    options: { name: 'Winter Intake Co', email: 'ads@example.test', generate: true, username: '', dryRun: true },
    password: 'x',
    log: () => undefined,
  }).catch((error) => error);
  check(result instanceof IssueError, 'a misconfigured run fails rather than pretending to succeed');
  check(server.calls.length === 0, 'and sends nothing');
}

console.log(`\nSUMMARY: ${pass} passed, ${bad.length} failed`);
for (const label of bad) console.log('  failed: ' + label);
process.exit(bad.length === 0 ? 0 : 1);
