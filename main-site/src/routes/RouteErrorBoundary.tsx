import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useRouteError } from 'react-router-dom';
import { Button, EmptyState, LinkButton } from '@/design-system';
import { ROUTES } from '@/lib/site';

/** Branded fallback for any thrown route error. Never a blank screen. */
export default function RouteErrorBoundary() {
  const { t } = useTranslation();
  const error = useRouteError();

  if (import.meta.env.DEV) {
    // Surfaced only during development so production consoles stay clean.
    // eslint-disable-next-line no-console
    console.warn('[BSDC] route error', error);
  }

  return (
    <div className="fab-container py-10">
      <EmptyState
        icon={<TriangleAlert size={36} />}
        title={t('errors.boundaryTitle')}
        description={t('errors.boundaryBody')}
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
