/**
 * BSDC — src/tests/setup.ts
 * Purpose : jsdom environment setup for the component suite (PART 23.4).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : jsdom lacks matchMedia, ResizeObserver and IntersectionObserver, all of which the
 *           responsive layer uses. They are polyfilled here — never in product code — so a
 *           component test can assert real breakpoint behaviour.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

/** Minimal MediaQueryList used by the polyfilled matchMedia. */
class FakeMediaQueryList implements MediaQueryList {
  public readonly media: string;
  public readonly matches: boolean;
  private readonly listeners = new Set<(event: MediaQueryListEvent) => void>();

  public constructor(media: string, matches: boolean) {
    this.media = media;
    this.matches = matches;
  }

  public readonly onchange = null;

  public addEventListener(_type: string, listener: EventListenerOrEventListenerObject): void {
    this.listeners.add(listener as (event: MediaQueryListEvent) => void);
  }

  public removeEventListener(_type: string, listener: EventListenerOrEventListenerObject): void {
    this.listeners.delete(listener as (event: MediaQueryListEvent) => void);
  }

  public addListener(listener: (event: MediaQueryListEvent) => void): void {
    this.listeners.add(listener);
  }

  public removeListener(listener: (event: MediaQueryListEvent) => void): void {
    this.listeners.delete(listener);
  }

  public dispatchEvent(event: Event): boolean {
    for (const listener of this.listeners) listener(event as MediaQueryListEvent);
    return true;
  }
}

if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string): MediaQueryList =>
      new FakeMediaQueryList(query, query.includes('min-width: 0px')),
  });
}

if (!('ResizeObserver' in globalThis)) {
  Object.defineProperty(globalThis, 'ResizeObserver', {
    writable: true,
    value: class {
      public observe(): void {
        /* jsdom never resizes; observing is a no-op. */
      }
      public unobserve(): void {
        /* no-op */
      }
      public disconnect(): void {
        /* no-op */
      }
    },
  });
}

if (!('IntersectionObserver' in globalThis)) {
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    writable: true,
    value: class {
      public observe(): void {
        /* no-op */
      }
      public unobserve(): void {
        /* no-op */
      }
      public disconnect(): void {
        /* no-op */
      }
      public takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
    },
  });
}

// jsdom implements window.scrollTo but throws "Not implemented" when called; the shell scrolls to
// the top on every route change, so it must be a no-op in tests.
Object.defineProperty(window, 'scrollTo', { writable: true, value: (): void => undefined });

afterEach(() => {
  cleanup();
});
