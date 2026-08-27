import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useDocumentMeta } from '@/hooks/use-document-meta';

export function NotFoundPage() {
  const { t } = useTranslation();
  useDocumentMeta({ title: t('app.notFoundTitle'), noindex: true });
  return (
    <div className="mx-auto flex w-full max-w-content flex-1 flex-col items-center justify-center px-4 py-20 text-center">
      <p className="font-mono text-5xl font-bold text-primary-600 dark:text-primary-400">404</p>
      <h1 className="mt-4 text-2xl font-bold tracking-tight">{t('notFound.title')}</h1>
      <p className="mt-2 max-w-md text-muted-foreground">{t('notFound.body')}</p>
      <div className="mt-6">
        <Button asChild>
          <Link to="/">{t('notFound.backHome')}</Link>
        </Button>
      </div>
    </div>
  );
}
