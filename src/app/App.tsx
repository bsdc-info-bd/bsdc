/**
 * BSDC — src/app/App.tsx
 * Purpose : Composition root: providers, then the router (ADR-006).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Provider order is deliberate:
 *             I18n        -> every string below it is translatable
 *             Theme       -> tokens are painted before anything renders
 *             Flags       -> gated surfaces can read flags on first render
 *             Session     -> identity and claims exist before any route asks for them
 *             (TanStack Query is introduced with the first query-backed feature, so the shell
 *              never ships a cache the platform does not use yet — PART 25)
 *             Offline     -> connectivity for banners and queues
 *             Toast       -> the single toast host sits above the tree
 *           The global error boundary wraps everything so a provider failure still renders a
 *           recovery screen instead of a blank page.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import type { ReactElement } from 'react';
import { I18nProvider } from './providers/I18nProvider';
import { ThemeProvider } from './providers/ThemeProvider';
import { FeatureFlagProvider } from './providers/FeatureFlagProvider';
import { SessionProvider } from '@/features/auth';
import { OfflineProvider } from './providers/OfflineProvider';
import { ToastProvider } from './providers/ToastProvider';
import { GlobalErrorBoundary } from './boundaries/GlobalErrorBoundary';
import { AppRouter } from './router/routes';

/**
 * Renders the BSDC application.
 * @returns the application element
 */
export function App(): ReactElement {
  return (
    <GlobalErrorBoundary>
      <I18nProvider>
        <ThemeProvider>
          <FeatureFlagProvider>
            <SessionProvider>
              <OfflineProvider>
                <ToastProvider>
                  <AppRouter />
                </ToastProvider>
              </OfflineProvider>
            </SessionProvider>
          </FeatureFlagProvider>
        </ThemeProvider>
      </I18nProvider>
    </GlobalErrorBoundary>
  );
}
