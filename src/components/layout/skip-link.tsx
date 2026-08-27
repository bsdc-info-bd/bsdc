import { useTranslation } from 'react-i18next';

/** Keyboard-reachable skip link — first focusable element on every page (§14.3). */
export function SkipLink() {
  const { t } = useTranslation();
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-primary-600 focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
    >
      {t('nav.skipToContent')}
    </a>
  );
}
