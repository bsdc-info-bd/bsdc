import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { initI18n, loadLanguageBundle } from '@/i18n';

/**
 * The bundles are fetched lazily in the browser; in tests they are simply
 * present. A test that renders a page and reads a translated string should not
 * have to await a network-shaped import first, and the copy that ships is the
 * copy under test either way.
 */
await initI18n();
await loadLanguageBundle('bn');

/* jsdom does not implement matchMedia; the theme and layout hooks rely on it. */
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});

afterEach(() => {
  cleanup();
});
