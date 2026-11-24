import { TriangleAlert } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouteError } from 'react-router-dom';
import { Button, EmptyState, LinkButton } from '@/design-system';
import { isChunkLoadFailure, recoverFromStaleBuild } from '@/lib/site/chunk-recovery';
import { ROUTES } from '@/lib/site';

/** The build this document was rendered from, used to tell one deploy from the next. */
const BUILD = String(import.meta.env['VITE_BUILD_SHA'] ?? 'dev');

/**
 * Branded fallback for any thrown route error. Never a blank screen.
 *
 * It is the last resort, so it is deliberately hard to reach. The one error
 * that used to land here for every visitor, on every link, was not a bug in a
 * page at all: it was a tab left open across a deploy, asking for chunks that
 * build no longer has. Those are recovered in `chunk-recovery.ts` — before a
 * render, and again here — and what is left is a genuine failure, which this
 * screen reports.
 */
export default function RouteErrorBoundary() {
  const { t } = useTranslation();
  const error = useRouteError();
  const stale = isChunkLoadFailure(error);

  // The chunk-recovery listener normally catches this before React sees it.
  // This is the same recovery for anything that slips past it: a first click
  // that fails while that listener was not yet installed, for instance.
  useEffect(() => {
    if (stale) recoverFromStaleBuild(BUILD);
  }, [stale]);

  if (import.meta.env.DEV) {
    // Surfaced only during development so production consoles stay clean.
    // eslint-disable-next-line no-console
    console.warn('[BSDC] route error', error);
  }

  return (
    <div className="fab-container py-10">
      <EmptyState
        icon={<TriangleAlert size={36} />}
        title={stale ? t('errors.staleBuildTitle') : t('errors.boundaryTitle')}
        description={stale ? t('errors.staleBuildBody') : t('errors.boundaryBody')}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => window.location.reload()}>{t('common.retry')}</Button>
            <LinkButton to={ROUTES.home} variant="outline">
              {t('common.backHome')}
            </LinkButton>
          </div>
        }
      />
    </div>
  );
}
