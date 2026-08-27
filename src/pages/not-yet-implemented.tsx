import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useDocumentMeta } from '@/hooks/use-document-meta';

interface NotYetImplementedPageProps {
  area: string;
  phase: number;
}

/**
 * Honest placeholder (brief §2.1/§2.3): routes that are part of the stable
 * §5 URL scheme but whose features have not shipped yet render this screen
 * — explicitly labeled, marked noindex, with zero faked UI. Never silently
 * stubbed and reported as done.
 */
export function NotYetImplementedPage({ area, phase }: NotYetImplementedPageProps) {
  const { t } = useTranslation();
  useDocumentMeta({ title: t('app.notYetTitle'), noindex: true });
  return (
    <div className="mx-auto flex w-full max-w-content flex-1 flex-col items-center justify-center px-4 py-20 text-center">
      <span className="rounded-full bg-muted px-3 py-1 font-mono text-xs text-muted-foreground">
        {t('notYet.plannedFor', { phase })}
      </span>
      <h1 className="mt-4 text-2xl font-bold tracking-tight">{t('notYet.title')}</h1>
      <p className="mt-2 max-w-md text-muted-foreground">
        {t('notYet.body', { area: t(`areas.${area}`) })}
      </p>
      <div className="mt-6">
        <Button asChild>
          <Link to="/">{t('notYet.backHome')}</Link>
        </Button>
      </div>
    </div>
  );
}
