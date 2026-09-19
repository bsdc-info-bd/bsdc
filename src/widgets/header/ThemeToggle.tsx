/**
 * BSDC — src/widgets/header/ThemeToggle.tsx
 * Purpose : Theme switcher for the nine themes plus density and font scale (PART 08.01, 08.08).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The control is a menu, not a cycling button, because nine states cannot be reached by
 *           cycling without a legend. The current theme is always shown as text, never colour-only.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useTranslation } from 'react-i18next';
import { LazyDropdownMenu } from '@/shared/ui/LazyDropdownMenu';
import { Icon } from '@/shared/ui/Icon';
import {
  DENSITIES,
  FONT_SCALES,
  THEMES,
  useAppearance,
  type ThemeName,
} from '@/shared/stores/appearance';

/**
 * Renders the theme and appearance menu.
 * @returns a dropdown trigger
 */
export function ThemeToggle(): React.ReactElement {
  const { t } = useTranslation(['theme', 'common']);
  const theme = useAppearance((state) => state.theme);
  const density = useAppearance((state) => state.density);
  const fontScale = useAppearance((state) => state.fontScale);
  const setTheme = useAppearance((state) => state.setTheme);
  const setDensity = useAppearance((state) => state.setDensity);
  const setFontScale = useAppearance((state) => state.setFontScale);

  return (
    <LazyDropdownMenu
      label={t('appearance', { ns: 'theme' })}
      align="end"
      groupLabel={t('theme', { ns: 'theme' })}
      trigger={
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2">
          <Icon name={theme === 'light' || theme === 'sepia' ? 'sun' : 'moon'} size={18} />
        </span>
      }
      items={[
        ...THEMES.map((name: ThemeName) => ({
          id: `theme-${name}`,
          label: t(`themes.${name}`, { ns: 'theme' }),
          icon: name === theme ? ('check' as const) : undefined,
          onSelect: (): void => setTheme(name),
        })),
        { separator: true },
        ...DENSITIES.map((value) => ({
          id: `density-${value}`,
          label: t(`density.${value}`, { ns: 'theme' }),
          icon: value === density ? ('check' as const) : undefined,
          onSelect: (): void => setDensity(value),
        })),
        { separator: true },
        ...FONT_SCALES.map((value) => ({
          id: `font-${value}`,
          label: `${t('fontScale', { ns: 'theme' })} ${value}x`,
          icon: value === fontScale ? ('check' as const) : undefined,
          onSelect: (): void => setFontScale(value),
        })),
      ]}
    />
  );
}
