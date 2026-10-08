/**
 * Only same-origin, path-style redirects are honoured after authentication.
 * Anything else (absolute URLs, protocol-relative paths, auth routes) falls
 * back to the home page — this closes the open-redirect vector.
 */
const REDIRECT_ORIGIN = 'https://redirect.invalid';

export function sanitizeRedirect(raw: string | null, fallback = '/'): string {
  if (!raw) return fallback;
  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    return fallback;
  }
  if (!value.startsWith('/')) return fallback;
  if (value.startsWith('//') || /[\s\\]/.test(value)) return fallback;
  try {
    // Normalize dot segments before rejecting auth loops; URL parsing must
    // never turn an apparently local path into a different origin.
    const url = new URL(value, REDIRECT_ORIGIN);
    if (url.origin !== REDIRECT_ORIGIN || /^\/auth(?:\/|$)/i.test(url.pathname)) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
