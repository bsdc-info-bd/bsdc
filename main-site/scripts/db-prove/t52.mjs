/**
 * Issuing a member-site advertiser uses Firebase, not Supabase Auth.
 * The fake server proves ordering, identity, permissions and retry behaviour
 * without sending a credential to a real service.
 */
import { generateKeyPairSync, verify } from 'node:crypto';
import { spawnSync } from 'node:child_process';
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
const {
  IssueError,
  SIGN_IN_URL,
  configurationProblems,
  deriveHandle,
  generatedPassword,
  issueAdvertiser,
  optionProblems,
  parseArgs,
} = module;
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const serviceAccount = {
  type: 'service_account',
  project_id: 'bsdc-bd',
  client_email: 'fixture@bsdc-bd.iam.gserviceaccount.com',
  private_key: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
};

function fakeServer({
  existing = null,
  permissions = ['ads.manage'],
  failure = null,
  race = false,
} = {}) {
  const calls = [];
  let lookups = 0;
  const fetch = async (url, init = {}) => {
    const raw = init.body ?? '';
    const body = typeof raw === 'string' && raw.startsWith('{') ? JSON.parse(raw) : raw;
    const headers = init.headers ?? {};
    calls.push({ url, method: init.method ?? 'GET', body, headers });
    const json = (status, payload) => ({
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(payload),
    });
    if (url.includes('/accounts:signInWithPassword?key=')) {
      if (failure === 'signin')
        return json(400, { error: { message: 'INVALID_LOGIN_CREDENTIALS' } });
      if (failure === 'signin-echo')
        return json(400, { error: { message: `oops ${body.password} corporate-test-key` } });
      return json(200, { idToken: 'staff-firebase-token', localId: 'staff-uid' });
    }
    if (url.endsWith('/rest/v1/rpc/my_permissions')) return json(200, permissions);
    if (url === 'https://oauth2.googleapis.com/token')
      return json(200, { access_token: 'firebase-admin-access' });
    if (url.endsWith('/projects/bsdc-bd/accounts:lookup')) {
      lookups += 1;
      if (race && lookups > 1)
        return json(200, { users: [{ localId: 'race-uid', email: 'ads@example.test' }] });
      if (failure === 'missing-error') return json(400, { error: { message: 'USER_NOT_FOUND' } });
      return json(200, { users: existing ? [existing] : [] });
    }
    if (url.endsWith('/projects/bsdc-bd/accounts')) {
      if (failure === 'create') return json(400, { error: { message: 'INVALID_EMAIL' } });
      if (failure === 'create-echo')
        return json(400, { error: { message: `oops ${body.password} ${headers.authorization}` } });
      if (race) return json(400, { error: { message: 'EMAIL_EXISTS' } });
      return json(200, { localId: 'firebase-new-uid', email: body.email });
    }
    if (url.endsWith('/rest/v1/rpc/issue_advertiser_account')) {
      if (failure === 'profile')
        return json(403, { message: 'Permission ads.manage is required', code: '42501' });
      return json(200, [{ uid: body.p_uid, username: 'winter_intake_co', created: true }]);
    }
    return json(404, { message: `unexpected ${url}` });
  };
  return { fetch, calls };
}

const BASE = {
  databaseUrl: 'https://project.supabase.co',
  publishableKey: 'public-test-key',
  staffApiKey: 'corporate-test-key',
  staffEmail: 'ops@example.test',
  staffPassword: 'staff-fixture',
  serviceAccount,
};
const OPTIONS = {
  name: 'Winter Intake Co',
  email: 'ads@example.test',
  generate: true,
  username: '',
  dryRun: false,
};

const args = parseArgs(['--name', 'Winter Intake Co', '--email', 'ads@example.test', '--generate']);
check(
  args.name === OPTIONS.name && args.email === OPTIONS.email && args.generate,
  'arguments parse',
);
try {
  parseArgs(['--nonsense']);
  check(false, 'unknown option is refused');
} catch (error) {
  check(error instanceof IssueError, 'unknown option is refused');
}
try {
  parseArgs(['--name', '--email']);
  check(false, 'missing option value is refused');
} catch {
  check(true, 'missing option value is refused');
}
check(
  optionProblems({ name: 'x', email: 'nope', generate: false, username: '' }).length === 3,
  'short name, invalid email and no password are three problems',
);
check(optionProblems(OPTIONS).length === 0, 'valid arguments have no problems');
check(
  optionProblems({ ...OPTIONS, password: 'both' }).some((p) => p.includes('not both')),
  'password and generate cannot both be set',
);
check(
  optionProblems({ ...OPTIONS, username: '_bad' }).some((p) => p.includes('--username')),
  'a handle cannot begin with an underscore',
);
check(
  deriveHandle('Winter Intake Co') === 'winter_intake_co',
  'the handle uses the database shape',
);
check(deriveHandle('XY') === 'advertiser', 'a short derived handle falls back to a valid one');
const generated = generatedPassword((length) => Uint8Array.from({ length }, (_, index) => index));
check(
  /^[^01lIO]{5}-[^01lIO]{5}-[^01lIO]{5}-[^01lIO]{5}$/.test(generated),
  'the generated password is readable',
);
check(SIGN_IN_URL.endsWith('/auth/login'), 'the sign-in address is the actual member-site route');
check(configurationProblems(BASE).length === 0, 'the member project configuration is accepted');
check(
  configurationProblems({
    ...BASE,
    serviceAccount: { ...serviceAccount, project_id: 'bsdc-second' },
  }).length > 0,
  'the corporate Firebase project cannot accidentally receive advertiser accounts',
);
check(
  configurationProblems({
    ...BASE,
    serviceAccount: {
      ...serviceAccount,
      project_id: 'bsdc-second',
      client_email: 'fixture@bsdc-second.iam.gserviceaccount.com',
    },
    expectedProject: 'bsdc-second',
  }).length > 0,
  'an override cannot make the corporate project the member project',
);
check(
  optionProblems({ ...OPTIONS, name: 'x'.repeat(61) }).some((p) => p.includes('--name')),
  'an overlong name is refused before an identity can be created',
);

{
  const server = fakeServer();
  const lines = [];
  const result = await issueAdvertiser({
    fetch: server.fetch,
    ...BASE,
    options: OPTIONS,
    password: 'generated-fixture',
    log: (line) => lines.push(line),
  });
  const urls = server.calls.map((call) => call.url);
  check(
    urls[0]?.includes('accounts:signInWithPassword'),
    'the corporate staff member signs in first',
  );
  check(
    urls[1]?.endsWith('/rpc/my_permissions'),
    'database permissions are checked before using the Firebase admin account',
  );
  check(
    urls[2] === 'https://oauth2.googleapis.com/token',
    'only then is a Firebase admin token requested',
  );
  check(
    urls[3]?.endsWith('/projects/bsdc-bd/accounts:lookup'),
    'existing identities are looked up in the member Firebase project',
  );
  check(
    urls[4]?.endsWith('/projects/bsdc-bd/accounts'),
    'a missing identity is created in that same project',
  );
  check(
    urls[5]?.endsWith('/rpc/issue_advertiser_account'),
    'the profile is issued after the Firebase identity',
  );
  const assertion = new URLSearchParams(server.calls[2].body).get('assertion');
  const [header, payload, signature] = assertion.split('.');
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
  check(
    claims.scope === 'https://www.googleapis.com/auth/identitytoolkit' &&
      claims.aud === 'https://oauth2.googleapis.com/token',
    'the assertion is scoped to Identity Toolkit',
  );
  check(
    verify(
      'RSA-SHA256',
      Buffer.from(`${header}.${payload}`),
      publicKey,
      Buffer.from(signature, 'base64url'),
    ),
    'the assertion is signed by the service-account key',
  );
  const create = server.calls[4];
  check(
    create.headers.authorization === 'Bearer firebase-admin-access',
    'Firebase creation uses the short-lived admin token',
  );
  check(create.body.emailVerified === false, 'the new address is not falsely marked verified');
  const profile = server.calls[5];
  check(
    profile.headers.authorization === 'Bearer staff-firebase-token' &&
      profile.headers.apikey === BASE.publishableKey,
    'the database call uses the staff Firebase token, not an admin key',
  );
  check(
    profile.body.p_uid === 'firebase-new-uid',
    'the profile uses the Firebase UID the member site will send',
  );
  check(
    result.createdAuth && result.profileCreated && result.generated === 'generated-fixture',
    'the newly created credential can be handed over once',
  );
  check(
    lines.every(
      (line) =>
        !line.includes('generated-fixture') &&
        !line.includes('staff-fixture') &&
        !line.includes('firebase-admin-access'),
    ),
    'progress logs contain no passwords or tokens',
  );
  check(!urls.some((url) => url.includes('/auth/v1/')), 'Supabase Auth is never used');
}

{
  const server = fakeServer({
    existing: { localId: 'firebase-existing', email: 'Ads@Example.test', emailVerified: false },
  });
  const result = await issueAdvertiser({
    fetch: server.fetch,
    ...BASE,
    options: OPTIONS,
    password: 'unused-password',
  });
  check(
    result.uid === 'firebase-existing' && !result.createdAuth,
    'an existing Firebase identity is reused',
  );
  check(result.generated === null, 'no generated password is reported for an existing user');
  check(
    !server.calls.some((call) => call.url.endsWith('/projects/bsdc-bd/accounts')),
    'no new identity is created',
  );
  check(
    !server.calls.some((call) => call.url.includes('accounts:update')),
    'existing identity settings are never updated',
  );
  check(
    !server.calls.some((call) => JSON.stringify(call.body).includes('unused-password')),
    'the existing user’s password is never sent',
  );
}

{
  const server = fakeServer({ race: true });
  const temporaryFixture = ['temporary', 'fixture'].join('-');
  const result = await issueAdvertiser({
    fetch: server.fetch,
    ...BASE,
    options: OPTIONS,
    password: temporaryFixture,
  });
  check(
    result.uid === 'race-uid' && !result.createdAuth && result.generated === null,
    'an EMAIL_EXISTS race reuses the account and reports no password',
  );
  check(
    !server.calls.some((call) => call.url.includes('accounts:update')),
    'the race does not update the existing user',
  );
}

{
  const server = fakeServer({ permissions: [] });
  let error;
  try {
    await issueAdvertiser({ fetch: server.fetch, ...BASE, options: OPTIONS });
  } catch (caught) {
    error = caught;
  }
  check(
    error instanceof IssueError && error.status === 403,
    'a staff account without ads.manage is refused',
  );
  check(
    server.calls.length === 2 &&
      !server.calls.some((call) => call.url.includes('oauth2.googleapis.com')),
    'denial happens before the privileged Firebase request',
  );
}
{
  const server = fakeServer({ existing: { localId: 'disabled-uid', disabled: true } });
  let error;
  try {
    await issueAdvertiser({ fetch: server.fetch, ...BASE, options: OPTIONS });
  } catch (caught) {
    error = caught;
  }
  check(
    error instanceof IssueError && error.message.includes('disabled'),
    'a disabled existing identity is refused',
  );
  check(
    !server.calls.some((call) => call.url.endsWith('/rpc/issue_advertiser_account')),
    'a disabled identity is not issued a profile',
  );
}
{
  const server = fakeServer({ failure: 'profile' });
  let error;
  try {
    await issueAdvertiser({
      fetch: server.fetch,
      ...BASE,
      options: OPTIONS,
      password: 'generated-fixture',
    });
  } catch (caught) {
    error = caught;
  }
  check(
    error instanceof IssueError && error.message.includes('Firebase sign-in was created'),
    'a partial failure reports that the Firebase identity exists',
  );
  check(
    !error.message.includes('generated-fixture') && error.message.includes('password reset'),
    'recovery is explained without printing the password',
  );
}
{
  const server = fakeServer();
  let error;
  try {
    await issueAdvertiser({ fetch: server.fetch, ...BASE, serviceAccount: null, options: OPTIONS });
  } catch (caught) {
    error = caught;
  }
  check(
    error instanceof IssueError && server.calls.length === 0,
    'missing configuration is refused before network access',
  );
}

{
  const server = fakeServer({ failure: 'missing-error' });
  const result = await issueAdvertiser({
    fetch: server.fetch,
    ...BASE,
    options: OPTIONS,
    password: 'generated-fixture',
  });
  check(
    result.createdAuth && result.uid === 'firebase-new-uid',
    'USER_NOT_FOUND is treated like an empty lookup',
  );
}
{
  const server = fakeServer({ failure: 'signin-echo' });
  let error;
  try {
    await issueAdvertiser({ fetch: server.fetch, ...BASE, options: OPTIONS });
  } catch (caught) {
    error = caught;
  }
  check(
    error instanceof IssueError &&
      !error.message.includes('staff-fixture') &&
      !error.message.includes('corporate-test-key'),
    'sign-in errors redact the password and Firebase API key even when echoed',
  );
  check(
    server.calls.length === 1,
    'a failed staff sign-in cannot reach privileged identity operations',
  );
}
{
  const server = fakeServer({ failure: 'create-echo' });
  let error;
  try {
    await issueAdvertiser({
      fetch: server.fetch,
      ...BASE,
      options: OPTIONS,
      password: 'generated-fixture',
    });
  } catch (caught) {
    error = caught;
  }
  check(
    error instanceof IssueError &&
      !error.message.includes('generated-fixture') &&
      !error.message.includes('firebase-admin-access'),
    'identity errors redact the new password and OAuth token even when echoed',
  );
  check(
    !server.calls.some((call) => call.url.endsWith('/rpc/issue_advertiser_account')),
    'a failed identity creation never issues a profile',
  );
}

{
  const server = fakeServer();
  const result = await issueAdvertiser({ fetch: server.fetch, ...BASE, options: OPTIONS });
  check(
    typeof result.generated === 'string' && /^[^-]{5}(?:-[^-]{5}){3}$/.test(result.generated),
    'real cryptographic generation works on the supported Node runtime',
  );
}
{
  const cli = spawnSync(
    process.execPath,
    [
      resolve(process.cwd(), '..', 'scripts', 'issue-advertiser.mjs'),
      '--name',
      'Winter Intake Co',
      '--email',
      'ads@example.test',
      '--generate',
      '--dry-run',
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        SUPABASE_URL: BASE.databaseUrl,
        SUPABASE_ANON_KEY: BASE.publishableKey,
        VITE_FB2_API_KEY: BASE.staffApiKey,
        BSDC_STAFF_EMAIL: BASE.staffEmail,
        BSDC_STAFF_PASSWORD: BASE.staffPassword,
        FIREBASE_SERVICE_ACCOUNT_BSDC_BD: JSON.stringify(serviceAccount),
      },
    },
  );
  check(
    cli.status === 0 && cli.stdout.includes('nothing changed'),
    'CLI dry-run validates configuration without issuing an account',
  );
  check(
    !cli.stdout.includes(BASE.staffPassword) && !cli.stdout.includes(serviceAccount.private_key),
    'CLI dry-run does not print credentials',
  );
}

{
  const server = fakeServer({ failure: 'create-echo' });
  let error;
  try {
    await issueAdvertiser({
      fetch: server.fetch,
      ...BASE,
      options: OPTIONS,
      password: 'q'.repeat(1200),
    });
  } catch (caught) {
    error = caught;
  }
  check(
    error instanceof IssueError && !error.message.includes('q'.repeat(100)),
    'a long credential is redacted before error text is truncated',
  );
}

console.log(`\nSUMMARY: ${pass} passed, ${bad.length} failed`);
for (const label of bad) console.log('  failed: ' + label);
process.exit(bad.length === 0 ? 0 : 1);
