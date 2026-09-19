/**
 * BSDC — tests/emulator/helpers.ts
 * Purpose : Shared harness for the rule suites that run against the Firebase emulator.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Every helper here exists so a test reads as a sentence about a person rather than as
 *   SDK plumbing: `const member = await asUser('u2'); await expect(member).cannotWrite(groupPost)`
 *   is the assertion a reviewer can check against the rule it came from.
 *   These suites are not part of `npm run test`. They need a live emulator, which CI supplies with
 *   `firebase emulators:exec`. Locally: start the emulators in one shell and run `npm run test:rules`
 *   in another. Where neither is possible — as in the container this repository was built in, which
 *   has no Java and no way to install it — the static gates (`check:rules`, `check:rtdb`) are what
 *   stand between a mistake and a release, and PUBLIC_LIMITATIONS.md says exactly that.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

const here = dirname(fileURLToPath(import.meta.url));
export const root = resolve(here, '..', '..');

/** The project id the emulator is started with. Any string works; this one says what it is. */
export const PROJECT_ID = 'bsdc-rules-ci';

/** Claims a test actor carries. Mirrors BsdcClaims in src/core/config/permissions.ts. */
export interface ActorClaims {
  readonly role?: string | undefined;
  readonly root?: boolean | undefined;
  readonly suspended?: boolean | undefined;
  readonly verifiedCreator?: boolean | undefined;
  readonly emailVerified?: boolean | undefined;
}

let environment: RulesTestEnvironment | null = null;

/**
 * Reads the host and port of an emulator from the environment the CLI sets.
 * @param variable the environment variable
 * @param fallbackHost host to use when the variable is absent
 * @param fallbackPort port to use when the variable is absent
 * @returns the host and port
 */
function endpoint(
  variable: string,
  fallbackHost: string,
  fallbackPort: number,
): { readonly host: string; readonly port: number } {
  const value = process.env[variable];
  if (value === undefined || value.length === 0) return { host: fallbackHost, port: fallbackPort };
  const [host, port] = value.split(':');
  return { host: host ?? fallbackHost, port: Number(port ?? fallbackPort) };
}

/**
 * Starts the emulator-backed test environment with this repository's rule files.
 * @returns the shared environment
 */
export async function env(): Promise<RulesTestEnvironment> {
  if (environment !== null) return environment;
  const firestore = endpoint('FIRESTORE_EMULATOR_HOST', '127.0.0.1', 8080);
  const database = endpoint('FIREBASE_DATABASE_EMULATOR_HOST', '127.0.0.1', 9000);
  environment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(root, 'firestore.rules'), 'utf8'),
      host: firestore.host,
      port: firestore.port,
    },
    database: {
      // The Realtime Database emulator takes the rules as an object; the type on EmulatorConfig
      // says string, which is the Firestore shape. The cast is the whole difference.
      rules: (
        JSON.parse(readFileSync(resolve(root, 'database.rules.json'), 'utf8')) as {
          rules: unknown;
        }
      ).rules as string,
      host: database.host,
      port: database.port,
    },
  });
  return environment;
}

/**
 * Closes the environment and clears everything the tests created.
 * @returns void
 */
export async function shutdown(): Promise<void> {
  if (environment === null) return;
  await environment.cleanup();
  environment = null;
}

/**
 * Opens a session as one actor. The rules read custom claims from the token, so a token is all a
 * test needs: there is no Auth emulator and no sign-in round trip.
 * @param uid the account id
 * @param claims the claims the account carries
 * @returns a context bound to that account
 */
export async function asUser(uid: string, claims: ActorClaims = {}): Promise<RulesTestContext> {
  const current = await env();
  // `sub` is deliberately absent: the uid is the first argument, and the type marks `sub` as
  // `never` so a test cannot carry two disagreeing identities into one request.
  return current.authenticatedContext(uid, {
    email_verified: claims.emailVerified ?? true,
    role: claims.role ?? 'member',
    root: claims.root ?? false,
    suspended: claims.suspended ?? false,
    verifiedCreator: claims.verifiedCreator ?? false,
  });
}

/**
 * Opens a session with no account at all.
 * @returns an unauthenticated context
 */
export async function asGuest(): Promise<RulesTestContext> {
  return (await env()).unauthenticatedContext();
}

/**
 * Opens a session as an administrator.
 * @param uid the account id
 * @returns a context bound to an admin account
 */
export function asAdmin(uid = 'admin'): Promise<RulesTestContext> {
  return asUser(uid, { role: 'admin' });
}

/**
 * Opens a session as the root administrator.
 * @param uid the account id
 * @returns a context bound to the root account
 */
export function asRoot(uid = 'root'): Promise<RulesTestContext> {
  return asUser(uid, { role: 'root', root: true });
}

/**
 * Opens a session as a suspended member, who must be able to write nothing at all.
 * @param uid the account id
 * @returns a context bound to a suspended account
 */
export function asSuspended(uid = 'suspended'): Promise<RulesTestContext> {
  return asUser(uid, { role: 'member', suspended: true });
}

/**
 * Seeds a document directly, bypassing the rules, so a test can build the world it then tests
 * access to. This is the one helper that writes without being checked, and it says so.
 * @param path the document path
 * @param data the document
 * @returns void
 */
export async function seed(path: string, data: Record<string, unknown>): Promise<void> {
  const current = await env();
  await current.withSecurityRulesDisabled(async (context) => {
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(context.firestore(), path), data);
  });
}

/**
 * Seeds a Realtime Database node directly, bypassing the rules.
 * @param path the database path
 * @param value the value
 * @returns void
 */
export async function seedRtdb(path: string, value: unknown): Promise<void> {
  const current = await env();
  await current.withSecurityRulesDisabled(async (context) => {
    const { ref, set } = await import('firebase/database');
    await set(ref(context.database(), path), value);
  });
}
