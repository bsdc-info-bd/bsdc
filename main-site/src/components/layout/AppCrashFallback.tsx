import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { FallbackProps } from 'react-error-boundary';
import { Button, EmptyState } from '@/design-system';

/** Top-level crash screen, rendered if a provider or the router itself fails. */
export function AppCrashFallback({ resetErrorBoundary }: FallbackProps) {
  const { t } = useTranslation();
  return (
    <div className="fab-container py-10">
      <EmptyState
        icon={<TriangleAlert size={36} />}
        title={t('errors.boundaryTitle')}
        description={t('errors.boundaryBody')}
        action={<Button onClick={resetErrorBoundary}>{t('common.retry')}</Button>}
      />
    </div>
  );
}
