import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { changeLanguage, type Language } from '@/i18n';
import { cn } from '@/lib/cn';

/** Bangla / English switch, persisted per device. */
export function LanguageToggle({ className }: { className?: string }) {
  const { t, i18n } = useTranslation();
  const current = i18n.language as Language;
  const next: Language = current === 'bn' ? 'en' : 'bn';

  return (
    <button
      type="button"
      onClick={() => void changeLanguage(next)}
      aria-label={t('a11y.toggleLanguage')}
      title={t('a11y.toggleLanguage')}
      className={cn(
        'fab-tap inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-xs font-semibold',
        'text-text transition-colors hover:bg-surface-2',
        className,
      )}
    >
      <Languages size={18} aria-hidden="true" />
      <span>{next === 'bn' ? t('language.bangla') : t('language.english')}</span>
    </button>
  );
}
