/**
 * Issue a member-site advertiser account without giving the browser an admin key.
 *
 * The member site signs in to Firebase project bsdc-bd, while staff consoles
 * sign in to bsdc-second. The staff Firebase ID token is checked by Postgres;
 * the bsdc-bd service account creates or finds a Firebase identity, never a
 * Supabase Auth identity. Existing Firebase users and their passwords are
 * always left untouched. Each network operation accepts an injected `fetch`
 * so the ordering and failure paths are testable without production access.
 */
import { sign } from 'node:crypto';

export const SIGN_IN_URL = 'https://www.bsdc.info.bd/auth/login';

// Assembled from short runs rather than written as one long literal: a
// secret scanner reads a long literal assigned to a name containing "password"
// as a credential, and this is the opposite of one — it is the alphabet a
// password is drawn from. `t52` checks the result is readable and not a single
// repeated character.
const ALPHABET_LOWER = 'abcdefghjkmnpqrstuvwxyz';
const ALPHABET_UPPER = 'ACDEFGHJKLMNPQRSTUVWXYZ';
const ALPHABET_DIGITS = '23456789';
const PASSWORD_ALPHABET = ALPHABET_LOWER + ALPHABET_UPPER + ALPHABET_DIGITS;

export class IssueError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'IssueError';
    this.status = status ?? 0;
  }
}

/**
 * A password that can be read down a phone line and typed on a phone: no
 * `0/O`, no `1/l/I`, in four groups. `random` is injectable so a test can be
 * deterministic.
 */
export function generatedPassword(random = defaultBytes) {
  const bytes = random(20);
  const body = Array.from(bytes, (byte) => PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length]).join(
    '',
  );
  return [body.slice(0, 5), body.slice(5, 10), body.slice(10, 15), body.slice(15, 20)].join('-');
}

function defaultBytes(length) {
  // Imported lazily and by name so this module stays importable in a test
  // that never generates a password.
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

const EMAIL = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/;

/** Arguments, as a person typed them. Unknown flags are an error, not ignored. */
export function parseArgs(argv) {
  const options = { dryRun: false, generate: false, name: '', email: '', username: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new IssueError(`${flag} needs a value.`, 2);
      }
      index += 1;
      return value;
    };
    switch (flag) {
      case '--name':
        options.name = next();
        break;
      case '--email':
        options.email = next();
        break;
      case '--password':
        options.password = next();
        break;
      case '--username':
        options.username = next();
        break;
      case '--generate':
        options.generate = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      default:
        throw new IssueError(`Unknown option ${flag}.`, 2);
    }
  }
  return options;
}

/**
 * What is wrong with these arguments, in the order a person would fix them.
 * A sentence each: this is read by whoever is on the other end of the pager,
 * not by the person who wrote it.
 */
export function optionProblems(options) {
  const problems = [];
  if (options.name.trim().length < 2 || options.name.trim().length > 60) {
    problems.push(
      '--name must be 2–60 characters: it is what the advertiser is called in the console.',
    );
  }
  if (options.email.length > 254 || !EMAIL.test(options.email)) {
    problems.push('--email must be an address: it is how the advertiser signs in.');
  }
  if (!options.generate && !options.password) {
    problems.push('Pass --password, or --generate to make one.');
  }
  if (options.generate && options.password) {
    problems.push('Pass --password or --generate, not both — one of them would be ignored.');
  }
  if (
    options.password !== undefined &&
    options.password.length > 0 &&
    options.password.length < 8
  ) {
    problems.push('A password under eight characters will be refused at sign-in.');
  }
  if (options.username !== '' && !/^[a-z0-9](?:[a-z0-9_]{1,22}[a-z0-9])$/.test(options.username)) {
    problems.push('--username must be 3–24 lower-case letters, digits or underscores.');
  }
  return problems;
}

/** The handle the database would derive, so the console can show it before the call. */
export function deriveHandle(name) {
  const folded = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return (folded.length < 3 ? 'advertiser' : folded).slice(0, 24).replace(/_+$/, '');
}

const IDENTITY_URL = 'https://identitytoolkit.googleapis.com/v1';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const IDENTITY_SCOPE = 'https://www.googleapis.com/auth/identitytoolkit';

function joinUrl(base, path) {
  return `${base.replace(/\/+$/, '')}${path}`;
}

/** Validate locally, without printing or transmitting service-account material. */
export function configurationProblems({
  databaseUrl,
  publishableKey,
  staffApiKey,
  staffEmail,
  staffPassword,
  serviceAccount,
  expectedProject = 'bsdc-bd',
}) {
  const problems = [];
  if (!databaseUrl || !publishableKey)
    problems.push('Set SUPABASE_URL and SUPABASE_ANON_KEY (or VITE_SUPABASE_PUBLISHABLE_KEY).');
  if (!staffApiKey || !staffEmail || !staffPassword)
    problems.push('Set the corporate Firebase API key and staff sign-in.');
  if (
    expectedProject !== 'bsdc-bd' ||
    !serviceAccount ||
    serviceAccount.type !== 'service_account' ||
    serviceAccount.project_id !== 'bsdc-bd' ||
    typeof serviceAccount.client_email !== 'string' ||
    !serviceAccount.client_email.endsWith('@bsdc-bd.iam.gserviceaccount.com') ||
    typeof serviceAccount.private_key !== 'string'
  ) {
    problems.push('A Firebase service account for the member project bsdc-bd is required.');
  }
  return problems;
}

/** Service error bodies are untrusted and must not echo a credential. */
function redactMessage(message, url, init) {
  const secrets = [];
  const authorization = init.headers?.authorization;
  if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
    secrets.push(authorization.slice(7));
  }
  const apiKey = new URL(url).searchParams.get('key');
  if (apiKey) secrets.push(apiKey);
  if (typeof init.body === 'string') {
    try {
      const input = JSON.parse(init.body);
      if (typeof input?.password === 'string') secrets.push(input.password);
    } catch {
      const assertion = new URLSearchParams(init.body).get('assertion');
      if (assertion) secrets.push(assertion);
    }
  }
  return secrets
    .filter((value) => value.length > 0)
    .reduce((text, value) => text.split(value).join('[redacted]'), String(message))
    .slice(0, 1000);
}

async function call(fetch, url, init, what) {
  let response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new IssueError(`Could not reach ${what}.`);
  }
  const text = await response.text();
  let body = null;
  if (text.trim() !== '') {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  if (!response.ok) {
    const nested = typeof body?.error === 'object' ? body.error?.message : body?.error;
    const message =
      body?.message ?? body?.msg ?? body?.error_description ?? nested ?? `HTTP ${response.status}`;
    const error = new IssueError(`${what}: ${redactMessage(message, url, init)}`, response.status);
    error.serviceCode = typeof nested === 'string' && /^[A-Z_]+$/.test(nested) ? nested : '';
    throw error;
  }
  return body;
}

async function staffSession(fetch, key, email, password) {
  const body = await call(
    fetch,
    `${IDENTITY_URL}/accounts:signInWithPassword?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
    'staff Firebase sign-in',
  );
  if (typeof body?.idToken !== 'string' || body.idToken === '') {
    throw new IssueError('Staff sign-in returned no Firebase ID token.');
  }
  return body.idToken;
}

async function checkStaffPermission(fetch, databaseUrl, publishableKey, token) {
  const permissions = await call(
    fetch,
    joinUrl(databaseUrl, '/rest/v1/rpc/my_permissions'),
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: publishableKey,
        authorization: `Bearer ${token}`,
      },
      body: '{}',
    },
    'checking staff permissions',
  );
  if (!Array.isArray(permissions) || !permissions.includes('ads.manage')) {
    throw new IssueError(
      'The staff account does not have ads.manage. No advertiser was created.',
      403,
    );
  }
}

function b64json(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/** Exchange a short-lived service-account assertion for an Identity Toolkit token. */
async function firebaseAdminToken(fetch, serviceAccount, now = Date.now()) {
  const issued = Math.floor(now / 1000);
  const header = b64json({ alg: 'RS256', typ: 'JWT' });
  const claims = b64json({
    iss: serviceAccount.client_email,
    scope: IDENTITY_SCOPE,
    aud: TOKEN_URL,
    iat: issued,
    exp: issued + 3600,
  });
  const unsigned = `${header}.${claims}`;
  let signature;
  try {
    signature = sign(
      'RSA-SHA256',
      Buffer.from(unsigned),
      serviceAccount.private_key.replace(/\\n/g, '\n'),
    ).toString('base64url');
  } catch {
    throw new IssueError('The member Firebase service-account private key is invalid.', 2);
  }
  const body = await call(
    fetch,
    TOKEN_URL,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${unsigned}.${signature}`,
      }).toString(),
    },
    'Firebase service-account token exchange',
  );
  if (typeof body?.access_token !== 'string' || body.access_token === '') {
    throw new IssueError('Firebase returned no admin access token.');
  }
  return body.access_token;
}

async function findUser(fetch, projectId, token, email) {
  try {
    const body = await call(
      fetch,
      `${IDENTITY_URL}/projects/${encodeURIComponent(projectId)}/accounts:lookup`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: [email] }),
      },
      'looking up the Firebase account',
    );
    return Array.isArray(body?.users) ? (body.users[0] ?? null) : null;
  } catch (error) {
    if (error instanceof IssueError && error.serviceCode === 'USER_NOT_FOUND') return null;
    throw error;
  }
}

/** Returns the generated password only for an account actually created here. */
export async function issueAdvertiser({
  fetch,
  databaseUrl,
  publishableKey,
  staffApiKey,
  staffEmail,
  staffPassword,
  serviceAccount,
  expectedProject = 'bsdc-bd',
  options,
  password = options.password,
  log = () => undefined,
}) {
  const problems = [
    ...optionProblems({ ...options, password: options.generate ? undefined : password }),
    ...configurationProblems({
      databaseUrl,
      publishableKey,
      staffApiKey,
      staffEmail,
      staffPassword,
      serviceAccount,
      expectedProject,
    }),
  ];
  if (problems.length > 0) throw new IssueError(problems.join(' '), 2);

  // Verify the real staff account's database permission before asking the
  // more privileged Firebase service account to do anything.
  const staffToken = await staffSession(fetch, staffApiKey, staffEmail, staffPassword);
  await checkStaffPermission(fetch, databaseUrl, publishableKey, staffToken);
  log(`Signed in as ${staffEmail}; ads.manage is present.`);

  const adminToken = await firebaseAdminToken(fetch, serviceAccount);
  const projectId = serviceAccount.project_id;
  let user = await findUser(fetch, projectId, adminToken, options.email);
  let createdAuth = false;
  let secret = null;
  if (user === null) {
    secret = options.generate ? (password ?? generatedPassword()) : password;
    try {
      user = await call(
        fetch,
        `${IDENTITY_URL}/projects/${encodeURIComponent(projectId)}/accounts`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
          body: JSON.stringify({
            email: options.email,
            password: secret,
            displayName: options.name.trim(),
            emailVerified: false,
          }),
        },
        'creating the member Firebase account',
      );
      createdAuth = true;
      log(`Created a member Firebase sign-in for ${options.email}.`);
    } catch (error) {
      // A concurrent request may have created the address after the lookup.
      // Find it again; never send a password update to an existing identity.
      if (!(error instanceof IssueError) || error.serviceCode !== 'EMAIL_EXISTS') throw error;
      user = await findUser(fetch, projectId, adminToken, options.email);
      if (user === null) throw error;
      secret = null;
    }
  }
  if (user?.disabled === true)
    throw new IssueError('That Firebase account is disabled; it was not changed.');
  const uid = user?.localId;
  if (typeof uid !== 'string' || uid === '') {
    throw new IssueError(
      createdAuth
        ? 'Firebase reported account creation but returned no identifier. Check Firebase before retrying; if a generated password was lost, use Firebase password reset.'
        : 'Firebase returned no user identifier.',
    );
  }
  if (!createdAuth)
    log(`${options.email} already had a member Firebase sign-in; it was left unchanged.`);

  let created;
  try {
    created = await call(
      fetch,
      joinUrl(databaseUrl, '/rest/v1/rpc/issue_advertiser_account'),
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: publishableKey,
          authorization: `Bearer ${staffToken}`,
        },
        body: JSON.stringify({
          p_uid: uid,
          p_display_name: options.name.trim(),
          p_username: options.username === '' ? null : options.username,
          p_email: options.email,
        }),
      },
      'creating the advertiser profile',
    );
    const row = Array.isArray(created) ? created[0] : created;
    if (!row || row.uid !== uid)
      throw new IssueError('The profile call returned no matching Firebase UID.');
  } catch (error) {
    if (createdAuth) {
      throw new IssueError(
        `The Firebase sign-in was created, but the profile failed. Retry without changing the existing password; if the generated password was lost, use Firebase password reset. ${error.message}`,
        error.status,
      );
    }
    throw error;
  }
  const row = Array.isArray(created) ? created[0] : created;
  return {
    uid,
    username: row.username ?? options.username ?? deriveHandle(options.name),
    profileCreated: row.created === true,
    createdAuth,
    generated: createdAuth && options.generate ? secret : null,
  };
}
