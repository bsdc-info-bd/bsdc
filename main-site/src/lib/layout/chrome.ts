/**
 * Which of the site's chrome a route gets.
 *
 * A conversation is not a page of the site. It is a room the member sits in:
 * the thread has its own header, its own scrolling and its own composer, and
 * the site's footer — links, legal, a language toggle — has no meaning in the
 * middle of it, while the mobile tab bar is a strip of the screen the thread
 * cannot give back. On a phone the difference is the whole complaint: a chat
 * that scrolls inside a page that also scrolls is a chat the composer keeps
 * sliding out of.
 *
 * So the shell asks, per path, and the messenger's thread route answers "none
 * of it". The inbox keeps the app bar and the tab bar, because that is a list a
 * member navigates away from.
 */

export interface RouteChrome {
  appBar: boolean;
  footer: boolean;
  bottomNav: boolean;
  /** Padding that keeps content clear of the mobile tab bar. */
  tabBarPadding: boolean;
}

export const FULL_CHROME: RouteChrome = {
  appBar: true,
  footer: true,
  bottomNav: true,
  tabBarPadding: true,
};

/** The messenger keeps its own furniture everywhere. */
export const NO_FOOTER: RouteChrome = {
  appBar: true,
  footer: false,
  bottomNav: true,
  tabBarPadding: true,
};

/** A thread owns the viewport: no site chrome at all. */
export const IMMERSIVE: RouteChrome = {
  appBar: false,
  footer: false,
  bottomNav: false,
  tabBarPadding: false,
};

/** `/messages/<conversation id>`, and nothing that merely starts with it. */
export function isThreadPath(pathname: string): boolean {
  const clean = trimPath(pathname);
  if (!clean.startsWith('/messages/')) return false;
  const id = clean.slice('/messages/'.length);
  // `/messages/` and `/messages/?q=` are the inbox, not a thread.
  return id.length > 0 && !id.includes('/');
}

/** The messenger's own paths: the inbox and every thread in it. */
export function isMessengerPath(pathname: string): boolean {
  const clean = trimPath(pathname);
  return clean === '/messages' || isThreadPath(clean);
}

export function chromeFor(pathname: string): RouteChrome {
  if (isThreadPath(pathname)) return IMMERSIVE;
  if (isMessengerPath(pathname)) return NO_FOOTER;
  return FULL_CHROME;
}

function trimPath(pathname: string): string {
  const withoutQuery = pathname.split(/[?#]/)[0] ?? '';
  const trimmed = withoutQuery.replace(/\/+$/, '');
  return trimmed.length === 0 ? '/' : trimmed;
}
