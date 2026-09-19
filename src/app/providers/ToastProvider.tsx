/**
 * BSDC — src/app/providers/ToastProvider.tsx
 * Purpose : The single toast host for the product (PART 08.09, PART 16).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Sonner is the canonical toaster (react-hot-toast is banned, PART 05.03). The host is
 *           loaded lazily: a visitor who never triggers a toast never downloads the toast library,
 *           which keeps the initial shell inside the 180 KB gzip budget (PART 25).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { lazy, Suspense, useMemo, type ReactNode } from 'react';
import { useBreakpoint } from '@/shared/hooks';
import { resolveAutoTheme } from '@/shared/stores/appearance';

const Toaster = lazy(async () => ({ default: (await import('sonner')).Toaster }));

/**
 * Mounts the global toaster.
 * @param children application tree
 * @returns children plus the lazily-loaded toast host
 */
export function ToastProvider({ children }: { children: ReactNode }): ReactNode {
  const { navigationModel } = useBreakpoint();

  const offset = useMemo(
    () =>
      navigationModel === 'bottom' ? 'calc(56px + env(safe-area-inset-bottom) + 12px)' : '16px',
    [navigationModel],
  );

  return (
    <>
      {children}
      <Suspense fallback={null}>
        <Toaster
          position={navigationModel === 'bottom' ? 'bottom-center' : 'bottom-right'}
          offset={offset}
          toastOptions={{ className: 'bsdc-toast' }}
          theme={resolveAutoTheme() === 'light' ? 'light' : 'dark'}
          closeButton
          duration={4500}
        />
      </Suspense>
    </>
  );
}
