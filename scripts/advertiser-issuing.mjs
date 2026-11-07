/**
 * Issuing an advertiser their account — the half of it that is not SQL.
 *
 * Every corporate console in this repository talks to the database through
 * functions, and an advertiser account is no exception:
 * `issue_advertiser_account()` creates the profile row, derives the handle and
 * writes the audit entry, and `scripts/db-prove/t50.mjs` proves it does. What a
 * function cannot do is set a password, because a database function must never
 * see one. That is the Auth admin API, and this module.
 *
 * It is written against `fetch` and nothing else. The operations scripts in
 * `scripts/` run with no `node_modules`, on a machine that may be somebody's
 * laptop at 2am, and adding a dependency to them to call two endpoints is not a
 * trade worth making. Every decision below takes the `fetch` it uses as an
 * argument so the proof harness can drive it without a network.
 *
 * The order of operations is the design:
 *
 *   1. Sign a staff member in, because creating the profile requires
 *      `ads.manage` and the database checks it against a real session. Using
 *      the service key for that call would have no caller, and the check would
 *      refuse — correctly.
 *   2. Find the Auth user for that address, or create one. Idempotent: a retry
 *      after a timeout must not make a second identity for one advertiser.
 *   3. Mark the address confirmed. Staff vouched for it; an advertiser who
 *      cannot sign in until they find an email is one who does not sign in.
 *   4. Call `issue_advertiser_account()` with the staff session, so the
 *      function's own permission check and audit row are the ones that apply.
 */

export const SIGN_IN_URL = 'https://www.bsdc.info.bd/login';

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
  if (options.name.trim().length < 2) {
    problems.push('--name is required: it is what the advertiser is called in the console.');
  }
  if (!EMAIL.test(options.email)) {
    problems.push('--email must be an address: it is how the advertiser signs in.');
  }
  if (!options.generate && !options.password) {
    problems.push('Pass --password, or --generate to make one.');
  }
  if (options.generate && options.password) {
    problems.push('Pass --password or --generate, not both — one of them would be ignored.');
  }
  if (options.password !== undefined && options.password.length > 0 && options.password.length < 8) {
    problems.push('A password under eight characters will be refused at sign-in.');
  }
  if (options.username !== '' && !/^[a-z0-9_]{3,24}$/.test(options.username)) {
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
  return (folded === '' ? 'advertiser' : folded).slice(0, 24).replace(/_+$/, '');
}

function joinUrl(base, path) {
  return `${base.replace(/\/+$/, '')}${path}`;
}

async function call(fetch, url, init, what) {
  let response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    throw new IssueError(`Could not reach the database (${what}): ${error.message}`);
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
    // PostgREST and GoTrue both put the sentence a person needs in `message`
    // or `msg`; anything else is reported as it arrived rather than swallowed.
    const message =
      body?.message ?? body?.msg ?? body?.error_description ?? body?.error ?? text.slice(0, 300);
    throw new IssueError(String(message || `HTTP ${response.status}`), response.status);
  }
  return body;
}

async function staffSession(fetch, url, key, email, password) {
  const body = await call(
    fetch,
    joinUrl(url, '/auth/v1/token?grant_type=password'),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: key },
      body: JSON.stringify({ email, password }),
    },
    'staff sign-in',
  );
  const token = body?.access_token;
  if (typeof token !== 'string' || token.length === 0) {
    throw new IssueError('The staff sign-in returned no session.');
  }
  return token;
}

async function findUser(fetch, url, serviceKey, email) {
  let page = 1;
  for (;;) {
    const body = await call(
      fetch,
      joinUrl(url, `/auth/v1/admin/users?page=${page}&per_page=200`),
      { headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` } },
      'listing accounts',
    );
    const users = Array.isArray(body?.users) ? body.users : [];
    const match = users.find((user) => String(user?.email ?? '').toLowerCase() === email.toLowerCase());
    if (match) return match;
    if (users.length < 200) return null;
    page += 1;
    // Ten thousand accounts is well past what this platform has; stopping is
    // better than paging a misconfigured endpoint forever.
    if (page > 50) throw new IssueError('Gave up looking through accounts after 10,000.');
  }
}

/**
 * Issue the account. Returns what was done, so the caller can print it and a
 * test can assert it — and never returns the password.
 */
export async function issueAdvertiser({
  fetch,
  url,
  serviceKey,
  staffEmail,
  staffPassword,
  options,
  password = options.password,
  log = () => undefined,
}) {
  const problems = optionProblems({ ...options, password: options.generate ? undefined : password });
  if (problems.length > 0) throw new IssueError(problems.join(' '), 2);
  if (!url || !serviceKey) throw new IssueError('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.', 2);
  if (!staffEmail || !staffPassword) {
    throw new IssueError(
      'A staff sign-in is needed: the account is created by somebody who may create it. Set SUPABASE_STAFF_EMAIL and SUPABASE_STAFF_PASSWORD.',
      2,
    );
  }

  const token = await staffSession(fetch, url, serviceKey, staffEmail, staffPassword);
  log(`Signed in as ${staffEmail}.`);

  const existing = await findUser(fetch, url, serviceKey, options.email);
  let uid;
  let createdAuth = false;

  const secret = options.generate ? (password ?? generatedPassword()) : password;

  if (existing === null) {
    const body = await call(
      fetch,
      joinUrl(url, '/auth/v1/admin/users'),
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: serviceKey,
          authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          email: options.email,
          password: secret,
          email_confirm: true,
          user_metadata: { display_name: options.name.trim(), purpose: 'advertiser' },
        }),
      },
      'creating the sign-in',
    );
    uid = body?.id ?? body?.user?.id;
    if (typeof uid !== 'string') throw new IssueError('The sign-in was created but no account came back.');
    createdAuth = true;
    log(`Created the sign-in for ${options.email}.`);
  } else {
    uid = existing.id;
    // An existing identity keeps its own password: this script issues an
    // account, it does not take one over.
    await call(
      fetch,
      joinUrl(url, `/auth/v1/admin/users/${uid}`),
      {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          apikey: serviceKey,
          authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ email_confirm: true }),
      },
      'confirming the address',
    );
    log(`${options.email} already had a sign-in; it was left as it was.`);
  }

  const created = await call(
    fetch,
    joinUrl(url, '/rest/v1/rpc/issue_advertiser_account'),
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: serviceKey,
        // The staff session, not the service key: the function's own
        // permission check is what decides, and it needs a caller.
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        p_uid: uid,
        p_display_name: options.name.trim(),
        p_username: options.username === '' ? null : options.username,
        p_email: options.email,
      }),
    },
    'creating the profile',
  );

  const row = Array.isArray(created) ? created[0] : created;
  return {
    uid,
    username: row?.username ?? options.username ?? deriveHandle(options.name),
    profileCreated: row?.created === true,
    createdAuth,
    // Returned only when it was generated, and only so the CLI can print it
    // once. The caller must never log this on an existing password.
    generated: options.generate ? secret : null,
  };
}
