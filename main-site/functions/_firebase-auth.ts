// Fixed upstream: never accept a URL/host from query parameters or the caller.
const AUTH_ORIGIN = 'https://bsdc-bd.firebaseapp.com';

/** Optional same-origin Firebase auth helper for browsers blocking third-party storage. */
export async function proxyFirebaseAuth(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/__/auth/')) return new Response('Not found', { status: 404 });
  if (!['GET', 'POST', 'HEAD'].includes(request.method)) {
    return new Response('Method not allowed', {
      status: 405,
      headers: { allow: 'GET, POST, HEAD' },
    });
  }
  const upstream = new URL(`${url.pathname}${url.search}`, AUTH_ORIGIN);
  const headers = new Headers(request.headers);
  // Application credentials/cookies are unrelated to the Firebase helper.
  headers.delete('authorization');
  headers.delete('cookie');
  headers.delete('host');
  try {
    const response = await fetch(
      new Request(upstream, {
        method: request.method,
        headers,
        body: request.method === 'POST' ? await request.arrayBuffer() : null,
        redirect: 'manual',
      }),
    );
    const result = new Response(response.body, response);
    result.headers.set('cache-control', 'no-store');
    const location = result.headers.get('location');
    if (location) {
      const destination = new URL(location, upstream);
      if (destination.origin === AUTH_ORIGIN) {
        result.headers.set(
          'location',
          `${url.origin}${destination.pathname}${destination.search}${destination.hash}`,
        );
      }
    }
    return result;
  } catch {
    return new Response('Authentication service temporarily unavailable', {
      status: 502,
      headers: { 'cache-control': 'no-store' },
    });
  }
}
