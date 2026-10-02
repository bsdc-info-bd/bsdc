import { useTranslation } from 'react-i18next';

/** First focusable element on every page (WCAG 2.4.1 Bypass Blocks). */
export function SkipLink() {
  const { t } = useTranslation();
  return (
    <a href="#main" className="fab-sr-only text-sm font-semibold">
      {t('a11y.skipToContent')}
    </a>
  );
}
