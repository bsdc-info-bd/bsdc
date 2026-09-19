/**
 * BSDC — src/tests/helpers/mount.ts
 * Purpose : One way to mount the application at a path inside a component test.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Every route is lazy, which means a route test is really a race between the assertion and
 *   a chunk. Three test files each solved that race slightly differently, and one of them lost it
 *   often enough to fail a build for no product reason at all.
 *   The fix is to drain the lazy resolution inside a single act block: a dynamic import needs one
 *   microtask to resolve and one macrotask to render, so the loop below gives it three of each
 *   before any assertion runs. Any update that lands after that is a genuine act violation rather
 *   than a chunk that was still in flight.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { act, render } from '@testing-library/react';
import { Suspense } from 'react';

/**
 * Mounts the application at the path currently in the address bar.
 * @returns nothing; the rendered tree is in the document
 */
export async function mountApp(): Promise<void> {
  const { App } = await import('@/app/App');
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <App />
      </Suspense>,
    );
    // A lazy route resolves a chunk, which needs a microtask to settle and a macrotask to paint.
    for (let tick = 0; tick < 3; tick += 1) {
      await Promise.resolve();
      await new Promise((done) => {
        setTimeout(done, 0);
      });
    }
  });
}
