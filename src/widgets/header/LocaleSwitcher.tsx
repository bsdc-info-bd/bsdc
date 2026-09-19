/**
 * BSDC — src/widgets/header/LocaleSwitcher.tsx
 * Purpose : Bangla and English switcher, both first-class (PART 09.01).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Switching updates the URL prefix, <html lang>, the i18next instance and the persisted
 *           preference — and it preserves the current path, so a shared link keeps working.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { LazyDropdownMenu } from '@/shared/ui/LazyDropdownMenu';
import { LOCALES } from '@/core/config/app';
import { stripLocale } from '@/shared/lib/url';
import { emit } from '@/core/events/bus';

/** Display names in each language's own script. */
const NAMES: Readonly<Record<string, string>> = { bn: 'বাংলা', en: 'English' };

/**
 * Renders the language switcher.
 * @returns a dropdown trigger
 */
export function LocaleSwitcher(): React.ReactElement {
  const { i18n, t } = useTranslation(['common']);
  const navigate = useNavigate();
  const location = useLocation();
  const current = i18n.resolvedLanguage === 'en' ? 'en' : 'bn';

  const switchTo = (locale: 'bn' | 'en'): void => {
    void i18n
      .changeLanguage(locale)
      .then((): void => undefined)
      .catch((): void => undefined);
    const stripped = stripLocale(location.pathname);
    void navigate(`/${locale}${stripped === '/' ? '' : stripped}`, { replace: false });
    emit('locale:changed', { locale });
  };

  return (
    <LazyDropdownMenu
      label={t('language', { ns: 'common' })}
      align="end"
      trigger={
        <span className="inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-full px-2 text-xs font-bold text-ink-2 hover:bg-surface-2">
          {NAMES[current]}
        </span>
      }
      items={LOCALES.map((locale) => ({
        id: `locale-${locale}`,
        label: NAMES[locale] ?? locale,
        icon: locale === current ? ('check' as const) : undefined,
        onSelect: (): void => switchTo(locale),
      }))}
    />
  );
}
