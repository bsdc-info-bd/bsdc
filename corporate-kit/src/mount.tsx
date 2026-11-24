import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { readEnv } from './data/env';
import { startCorporatePerformance } from './data/performance';
import { SessionProvider } from './data/session';
import { ToastProvider, ToastViewport } from './ui/toast';
import { RecoveryBoundary } from './ui/RecoveryBoundary';
import './ui/styles.css';

/**
 * Every console has the same entry point: read its identity from the
 * environment, wrap the tree in the shared session and the shared toast region,
 * and mount. An app that cannot find its root element says so rather than
 * failing silently.
 *
 * The toast provider lives here, above the session, for two reasons. Every
 * console gets feedback for free — a screen cannot forget to install it — and a
 * failure raised by the *session* (a suspended account, an expired sign-in) can
 * announce itself the same way a screen's failure does.
 */
export function mountConsole(
  appId: string,
  appName: string,
  render: () => ReactNode,
  options: { keepTitle?: boolean } = {},
): void {
  const container = document.getElementById('root');
  if (!container) throw new Error('The page is missing its #root element.');
  const env = readEnv(appId, appName);
  startCorporatePerformance(env);
  // Public pages write their own title in the HTML, where a crawler that does
  // not run scripts can still read it; staff consoles get a generated one.
  if (!options.keepTitle) document.title = `${appName} — BSDC`;
  createRoot(container).render(
    <StrictMode>
      <ToastProvider>
        {/* Above the shell, so a console cannot be written without it. */}
        <RecoveryBoundary appId={env.appId}>
          <SessionProvider env={env}>{render()}</SessionProvider>
        </RecoveryBoundary>
        <ToastViewport />
      </ToastProvider>
    </StrictMode>,
  );
}
