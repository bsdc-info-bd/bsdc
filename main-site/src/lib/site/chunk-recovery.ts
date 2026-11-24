/**
 * What to do when a page's code chunk will not load.
 *
 * Every route is a separate chunk, fetched when the visitor first opens it. A
 * chunk name contains its own content hash, and `/assets/*` is served
 * `immutable` for a year, so a build only ever adds names — it never reuses
 * one. That is right for caching and it has one sharp edge: a tab that is
 * already open when a new build deploys holds an `index.html` that names
 * chunks the new deployment no longer has. The visitor clicks a link, the
 * import 404s, and without this module React Router shows the error screen —
 * the whole site appears broken until they think to reload, which they have no
 * reason to do. Reported from production exactly that way: *every* link from
 * the home page "did not open".
 *
 * The recovery is not a retry. Asking for the same name again gets the same
 * 404, and that is why the error screen used to survive its own "Try again"
 * button. The page has to be reloaded so the document and the chunks come from
 * the same build; everything the visitor has typed is either already in
 * `localStorage`/IndexedDB or is a draft they would lose, so the guard below is
 * deliberately small and silent.
 *
 * Kept apart from React and from the router so it can be reasoned about, and
 * tested, on its own.
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

/** How many times a tab may reload itself for one broken deploy. */
const MAX_AUTOMATIC_RELOADS = 2;

const STORAGE_KEY = 'bsdc:chunk-recovery';

function messageOf(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  const candidate = (error as { message?: unknown } | null)?.message;
  return typeof candidate === 'string' ? candidate : '';
}

/**
 * True when the failure looks like code that was supposed to load and did not.
 *
 * A genuine bug in a page is thrown from code that is already running, so it is
 * not matched here and keeps reaching the error screen, which is the point of
 * having one.
 */
export function isChunkLoadFailure(error: unknown): boolean {
  const message = messageOf(error).toLowerCase();
  if (!message) return false;
  const names = /chunk|module|import|asset|\.js\b|\.css\b/i.test(message);
  const network = NETWORK_FAILURES.some((fragment) => message.includes(fragment));
  const evaluation = EVALUATION_FAILURES.some((fragment) => message.includes(fragment));
  return network || (evaluation && names);
}

interface Attempt {
  /** The build that was open, so a third deployment can try again. */
  build: string;
  /** How many automatic reloads this tab has already spent. */
  count: number;
  /** When the last one happened, to stop a reload loop. */
  at: number;
}

function readAttempt(): Attempt | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { build, count, at } = parsed as Record<string, unknown>;
    if (typeof build !== 'string' || typeof count !== 'number' || typeof at !== 'number')
      return null;
    return { build, count, at };
  } catch {
    // Session storage is unavailable in some private and embedded contexts; the
    // page still has to work, so treat it as a first visit.
    return null;
  }
}

/**
 * Reload the page so its document and its chunks come from the same build.
 *
 * Returns `false` when this tab has already reloaded for this build, or has
 * reloaded very recently: at that point the visitor is looking at a real
 * failure and the error screen — with its own button — is the honest answer.
 */
export function recoverFromStaleBuild(build: string): boolean {
  // Offline, the chunk that failed belongs to the build that is *supposed* to
  // be running and nothing can be fetched to replace it. Reloading would only
  // throw away whatever is on screen — a half-written post, for instance — so
  // the error screen, which keeps it, is the better answer.
  if (navigator.onLine === false) return false;
  try {
    const now = Date.now();
    const previous = readAttempt();
    const sameBuild = previous?.build === build;
    const count = sameBuild ? previous.count : 0;
    // Two seconds is longer than any reload takes and far shorter than a person
    // would spend wondering what happened.
    const tooSoon = previous !== null && now - previous.at < 2_000;
    if (count >= MAX_AUTOMATIC_RELOADS || tooSoon) return false;
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ build, count: count + 1, at: now } satisfies Attempt),
    );
    // `location.reload()` would serve the document from the browser's cache in
    // some back/forward states; asking for the current URL again always takes
    // the network path and so always gets the new deployment.
    window.location.reload();
    return true;
  } catch {
    return false;
  }
}
