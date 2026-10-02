import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { readEnv } from './data/env';
import { SessionProvider } from './data/session';
import './ui/styles.css';

/**
 * Every console has the same entry point: read its identity from the
 * environment, wrap the tree in the shared session, and mount. An app that
 * cannot find its root element says so rather than failing silently.
 */
export function mountConsole(appId: string, appName: string, render: () => ReactNode): void {
  const container = document.getElementById('root');
  if (!container) throw new Error('The page is missing its #root element.');
  const env = readEnv(appId, appName);
  document.title = `${appName} — BSDC`;
  createRoot(container).render(
    <StrictMode>
      <SessionProvider env={env}>{render()}</SessionProvider>
    </StrictMode>,
  );
}
