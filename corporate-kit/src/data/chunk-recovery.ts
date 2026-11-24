/**
 * What to do when a console's code chunk will not load.
 *
 * This is the same module that fixed `main-site` in `5967a2e`, moved here so
 * that all thirteen consoles get the fix instead of one. The reasoning is
 * unchanged and worth restating, because it is the difference between a console
 * that recovers and one that looks broken until someone thinks to reload.
 *
 * Every tab is a separate chunk, named with its own content hash, and
 * `/assets/*` is served `immutable` for a year — so a build only ever adds
 * names, never reuses one. That is correct for caching and it has one sharp
 * edge: a console left open across a deploy holds an `index.html` that names
 * chunks the new deployment no longer has. The operator clicks a tab, the
 * import 404s, and without this module the shell shows its error screen. A duty
 * console must not go blank because a deploy landed at 03:00.
 *
 * The recovery is not a retry. Asking for the same name again gets the same
 * 404, which is why "Try again" used to survive its own button. The document
 * has to be reloaded so the page and its chunks come from the same build.
 *
 * Differences from the `main-site` original, all deliberate:
 *
 * - The build is discovered from a meta tag as well as the env var, because a
 *   console is served by more than one host and not every one injects the SHA.
 * - Storage is namespaced per console, so two consoles open in one tab group do
 *   not spend each other's reload budget.
 * - The reported attempt carries the *console* that hit it, so a support report
 *   says which one went blank.
 */

/** The chunk request itself failed — the server does not have that file. */
const NETWORK_FAILURES = [
  'failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'importing a module script failed',
  'unable to preload css',
  'dynamically imported module',
];

/** The chunk arrived but could not be evaluated — a stale-to-new mix. */
const EVALUATION_FAILURES = [
  'is not a function',
  'cannot read properties of undefined',
  'cannot read properties of null',
  'does not provide an export named',
  'cannot access',
  'class extends value',
];

/** How many times one tab may reload itself for one broken deploy. */
export const MAX_AUTOMATIC_RELOADS = 2;

/** Two seconds: longer than any reload, far shorter than a person's patience. */
const RELOAD_SPACING_MS = 2_000;

const STORAGE_PREFIX = 'bsdc:chunk-recovery';

function storageKey(scope: string): string {
  return `${STORAGE_PREFIX}:${scope}`;
}

function messageOf(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  const candidate = (error as { message?: unknown } | null)?.message;
  return typeof candidate === 'string' ? candidate : '';
}

/**
 * True when the failure looks like code that was supposed to load and did not.
 *
 * A genuine bug in a screen is thrown from code that is already running, so it
 * is not matched here and keeps reaching the error screen — which is the point
 * of having one.
 */
export function isChunkLoadFailure(error: unknown): boolean {
  const message = messageOf(error).toLowerCase();
  if (!message) return false;
  const names = /chunk|module|import|asset|\.js\b|\.css\b/.test(message);
  const network = NETWORK_FAILURES.some((fragment) => message.includes(fragment));
  const evaluation = EVALUATION_FAILURES.some((fragment) => message.includes(fragment));
  return network || (evaluation && names);
}

/**
 * The build this document was rendered from.
 *
 * Three sources, in order: the environment variable Vite injects, a meta tag a
 * host may write, and finally "dev" — which is honest, because in development
 * there is no deploy to be stale against.
 */
export function currentBuild(env?: Record<string, unknown>): string {
  const fromEnv = env?.['VITE_BUILD_SHA'];
  if (typeof fromEnv === 'string' && fromEnv.trim().length > 0) return fromEnv.trim();
  if (typeof document !== 'undefined') {
    const meta = document.querySelector('meta[name="bsdc-build"]');
    const content = meta?.getAttribute('content');
    if (typeof content === 'string' && content.trim().length > 0) return content.trim();
  }
  return 'dev';
}

export interface Attempt {
  /** The build that was open, so a third deployment can try again. */
  readonly build: string;
  /** How many automatic reloads this tab has already spent. */
  readonly count: number;
  /** When the last one happened, to stop a reload loop. */
  readonly at: number;
}

/** Reads the stored attempt without trusting its shape. */
export function readAttempt(scope: string, storage?: Storage): Attempt | null {
  const target = storage ?? safeStorage();
  if (!target) return null;
  try {
    const raw = target.getItem(storageKey(scope));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { build, count, at } = parsed as Record<string, unknown>;
    if (typeof build !== 'string' || typeof count !== 'number' || typeof at !== 'number') {
      return null;
    }
    return { build, count, at };
  } catch {
    // Session storage is unavailable in some private and embedded contexts; the
    // console still has to work, so treat it as a first visit.
    return null;
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export type RecoveryOutcome =
  | { readonly recovered: true; readonly reason: 'reloaded' }
  | {
      readonly recovered: false;
      readonly reason: 'offline' | 'budget-spent' | 'too-soon' | 'storage-blocked';
    };

/**
 * Decide whether to reload, and reload if so.
 *
 * Returns the decision rather than a boolean so a caller can tell "we are
 * offline" from "we already tried twice" — those are different sentences to put
 * in front of an operator.
 */
export function attemptStaleBuildRecovery(
  scope: string,
  build: string,
  deps: {
    readonly now?: () => number;
    readonly online?: () => boolean;
    readonly reload?: () => void;
    readonly storage?: Storage | null;
  } = {},
): RecoveryOutcome {
  const now = deps.now ?? (() => Date.now());
  const online = deps.online ?? (() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const reload = deps.reload ?? (() => window.location.reload());
  const storage = deps.storage === undefined ? safeStorage() : deps.storage;

  // Offline, the chunk that failed belongs to the build that is meant to be
  // running and nothing can be fetched to replace it. Reloading would only
  // throw away what is on screen, so the error screen — which keeps it — wins.
  if (!online()) return { recovered: false, reason: 'offline' };
  if (!storage) return { recovered: false, reason: 'storage-blocked' };

  try {
    const moment = now();
    const previous = readAttempt(scope, storage);
    const sameBuild = previous?.build === build;
    // A new build is a new problem and deserves its own budget: the fix that
    // failed to help for build A may be exactly right for build B. For the same
    // reason the spacing guard only applies within one build — a deploy that
    // lands a second after a recovery is exactly the case that must be allowed
    // through, and refusing it would strand the tab on the old build.
    const count = sameBuild ? previous.count : 0;
    const tooSoon = sameBuild && moment - previous.at < RELOAD_SPACING_MS;
    if (count >= MAX_AUTOMATIC_RELOADS) return { recovered: false, reason: 'budget-spent' };
    if (tooSoon) return { recovered: false, reason: 'too-soon' };
    storage.setItem(
      storageKey(scope),
      JSON.stringify({ build, count: count + 1, at: moment } satisfies Attempt),
    );
    reload();
    return { recovered: true, reason: 'reloaded' };
  } catch {
    return { recovered: false, reason: 'storage-blocked' };
  }
}

/** The sentence to show when recovery has been tried and did not help. */
export function recoveryFailureMessage(outcome: RecoveryOutcome): string {
  if (outcome.recovered) return '';
  switch (outcome.reason) {
    case 'offline':
      return 'You are offline. The console will keep what you have typed and reconnect when the network returns.';
    case 'budget-spent':
      return 'This tab has reloaded twice and the page still did not load. The deployment may be incomplete.';
    case 'too-soon':
      return 'The console just reloaded and the page still did not load.';
    case 'storage-blocked':
      return 'This browser is blocking storage, so the console cannot recover itself. Reload the page.';
    /* c8 ignore next */
    default:
      return 'The page did not load.';
  }
}
