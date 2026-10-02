/**
 * Only same-origin, path-style redirects are honoured after authentication.
 * Anything else (absolute URLs, protocol-relative paths, auth routes) falls
 * back to the home page — this closes the open-redirect vector.
 */
const BLOCKED_PREFIXES = ['/auth/', '//', 'http:', 'https:'];

export function sanitizeRedirect(raw: string | null, fallback = '/'): string {
  if (!raw) return fallback;
  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    return fallback;
  }
  if (!value.startsWith('/')) return fallback;
  if (BLOCKED_PREFIXES.some((prefix) => value.startsWith(prefix))) return fallback;
  if (value.includes('\\') || value.includes('\n')) return fallback;
  return value;
}
