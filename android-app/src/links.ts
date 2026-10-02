/**
 * Deep links, and the one rule that matters: a link opens inside the app
 * only if it belongs to BSDC.
 *
 * Everything else — an advertiser's site, a member's portfolio, a link
 * somebody pasted into a message — opens in the system browser, where the
 * address bar is visible and the user can see whose site they are on. A
 * shell that renders arbitrary origins inside its own chrome is a phishing
 * toolkit with a launcher icon.
 */

export const SITE_ORIGIN = 'https://www.bsdc.info.bd';
export const APP_SCHEME = 'bsdc';

/** Hosts the shell is allowed to render itself. Nothing else, ever. */
export const TRUSTED_HOSTS = ['www.bsdc.info.bd', 'bsdc.info.bd', 'vf.main.bsdc.info.bd'] as const;

export type Opening =
  | { readonly kind: 'in-app'; readonly path: string }
  | { readonly kind: 'browser'; readonly url: string }
  | { readonly kind: 'ignore'; readonly reason: string };

function normalisePath(pathname: string, search: string, hash: string): string {
  const path = pathname === '' ? '/' : pathname;
  const trimmed = path.length > 1 ? path.replace(/\/+$/, '') : path;
  return `${trimmed}${search}${hash}`;
}

/**
 * Decides what to do with a URL the system handed to the app: an app link,
 * a `bsdc://` link from a push notification, or a tap inside the web view.
 */
export function resolveLink(raw: string): Opening {
  const value = (raw ?? '').trim();
  if (value === '') return { kind: 'ignore', reason: 'There was no address in the intent.' };

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    // A bare path can only have come from inside the app.
    if (value.startsWith('/')) return { kind: 'in-app', path: value };
    return { kind: 'ignore', reason: 'That is not an address the app can open.' };
  }

  if (url.protocol === `${APP_SCHEME}:`) {
    // bsdc://post/why-rust and bsdc:///p/why-rust both mean the same page:
    // Android gives the first segment as the host, so it is put back.
    const host = url.hostname === '' ? '' : `/${url.hostname}`;
    const rest = url.pathname === '/' ? '' : url.pathname;
    const path = `${host}${rest}` === '' ? '/' : `${host}${rest}`;
    const mapped = path.startsWith('/post/') ? path.replace('/post/', '/p/') : path;
    return { kind: 'in-app', path: normalisePath(mapped, url.search, url.hash) };
  }

  if (url.protocol !== 'https:') {
    return { kind: 'ignore', reason: 'Only secure addresses are opened.' };
  }

  if ((TRUSTED_HOSTS as readonly string[]).includes(url.hostname)) {
    return { kind: 'in-app', path: normalisePath(url.pathname, url.search, url.hash) };
  }

  return { kind: 'browser', url: url.toString() };
}

/** The address the web view should load for an in-app path. */
export function inAppUrl(path: string, origin: string = SITE_ORIGIN): string {
  const base = origin.replace(/\/+$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export interface PushMessage {
  readonly title?: string | undefined;
  readonly body?: string | undefined;
  readonly data?: Readonly<Record<string, unknown>> | undefined;
}

/**
 * Where a notification should take somebody when they tap it. A
 * notification that opens the home page has wasted the tap, so an
 * unroutable payload is reported rather than silently defaulting.
 */
export function pushDestination(message: PushMessage): Opening {
  const data = message.data ?? {};
  const candidate = data['path'] ?? data['url'] ?? data['link'];
  if (typeof candidate === 'string' && candidate.trim() !== '') return resolveLink(candidate);

  const kind = typeof data['kind'] === 'string' ? data['kind'] : '';
  const id = typeof data['id'] === 'string' ? data['id'] : '';
  if (id !== '') {
    switch (kind) {
      case 'message':
        return { kind: 'in-app', path: `/messages/${id}` };
      case 'post':
        return { kind: 'in-app', path: `/p/${id}` };
      case 'follow':
        return { kind: 'in-app', path: `/@${id}` };
      case 'order':
        return { kind: 'in-app', path: '/orders' };
      default:
        break;
    }
  }
  return { kind: 'ignore', reason: 'The notification carried no destination.' };
}

/** A notification with no title says nothing in the tray; give it words. */
export function notificationText(message: PushMessage): {
  readonly title: string;
  readonly body: string;
} {
  const title = (message.title ?? '').trim();
  const body = (message.body ?? '').trim();
  if (title !== '') return { title, body };
  return { title: 'BSDC', body: body === '' ? 'You have a new notification.' : body };
}

/**
 * Whether the shell should keep its own back behaviour or let Android close
 * the app. Being one page deep and pressing back must leave the app, and
 * being ten pages deep must not.
 */
export function backBehaviour(canGoBack: boolean, path: string): 'back' | 'exit' {
  return canGoBack && path !== '/' ? 'back' : 'exit';
}
