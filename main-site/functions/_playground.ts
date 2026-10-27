/** A Function response, not overlapping static _headers CSP rules. */
export function playgroundRunner(): Response {
  return new Response(
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isolated code output</title><script src="/playground/runner.js" defer></script></head><body><pre id="output" role="log" aria-live="polite"></pre></body></html>',
    {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
        'content-security-policy':
          "default-src 'none'; script-src 'self' 'unsafe-eval'; style-src 'unsafe-inline'; worker-src blob:; frame-src 'self' about:; connect-src 'none'; img-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox allow-scripts",
      },
    },
  );
}
