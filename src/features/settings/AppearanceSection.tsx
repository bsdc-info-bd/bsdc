/**
 * BSDC — src/features/settings/AppearanceSection.tsx
 * Purpose : Theme, density, text size, numerals, motion and touch targets.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : These nine settings live on the device, not in the account, and that is deliberate: the
 *   inline pre-paint script in index.html reads this very store so the right theme is painted
 *   before the first frame, which a server round-trip cannot do. A person who wants dark mode on
 *   their phone and light mode on their laptop gets exactly that, and neither device is wrong.
 *   Font scale goes to 200 percent because the accessibility contract promises it (PART 09.03).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useTranslation } from 'react-i18next';
import { Card, CardBody, CardHeader, CardTitle, RadioGroup, Switch } from '@/shared/ui';
import {
  DENSITIES,
  FONT_SCALES,
  THEMES,
  useAppearance,
  type Density,
  type FontScale,
  type ThemeName,
} from '@/shared/stores/appearance';

/**
 * Renders the appearance settings. Labels come from i18next, so the section needs no locale of
 * its own: it speaks whichever language the app is already speaking.
 * @returns the section element
 */
export function AppearanceSection(): React.ReactElement {
  const { t } = useTranslation('settings');
  const appearance = useAppearance();

  return (
    <Card as="section" padding="md">
      <CardHeader>
        <CardTitle>{t('appearance.title')}</CardTitle>
      </CardHeader>
      <CardBody className="bsdc-settings__body">
        <RadioGroup<ThemeName>
          label={t('appearance.theme')}
          value={appearance.theme}
          onValueChange={appearance.setTheme}
          options={THEMES.map((theme) => ({
            value: theme,
            label: t(`appearance.themes.${theme}`),
          }))}
        />
        <RadioGroup<Density>
          label={t('appearance.density')}
          value={appearance.density}
          onValueChange={appearance.setDensity}
          options={DENSITIES.map((density) => ({
            value: density,
            label: t(`appearance.densities.${density}`),
          }))}
        />
        <RadioGroup<FontScale>
          label={t('appearance.fontScale')}
          value={appearance.fontScale}
          onValueChange={appearance.setFontScale}
          options={FONT_SCALES.map((scale) => ({
            value: scale,
            label: t(`appearance.scales.${scale}`),
          }))}
        />
        <Switch
          checked={appearance.numerals === 'bn'}
          onCheckedChange={(checked) => appearance.setNumerals(checked ? 'bn' : 'en')}
          label={t('appearance.banglaNumerals')}
          description={t('appearance.banglaNumeralsNote')}
        />
        <Switch
          checked={appearance.motion === 'reduced'}
          onCheckedChange={(checked) => appearance.setMotion(checked ? 'reduced' : 'full')}
          label={t('appearance.reduceMotion')}
          description={t('appearance.reduceMotionNote')}
        />
        <Switch
          checked={appearance.reduceTransparency}
          onCheckedChange={appearance.setReduceTransparency}
          label={t('appearance.reduceTransparency')}
          description={t('appearance.reduceTransparencyNote')}
        />
        <Switch
          checked={appearance.largeTargets}
          onCheckedChange={appearance.setLargeTargets}
          label={t('appearance.largeTargets')}
          description={t('appearance.largeTargetsNote')}
        />
      </CardBody>
    </Card>
  );
}
