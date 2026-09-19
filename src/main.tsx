/**
 * BSDC — src/main.tsx
 * Purpose : Browser entry point (ADR-010).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Styles are imported once here and never inside a component, so the cascade order in
 *           src/styles/index.css is the only source of truth (ADR-008).
 *           The service worker registers in production only, and never in the Capacitor WebView,
 *           where the native shell owns caching (PART 16.2, PART 27).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles/index.css';

const container = document.getElementById('root');
if (container === null) throw new Error('BSDC: root container is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // A failed registration must never break the app: the shell keeps working online.
    });
  });
}
