/**
 * BSDC — src/pages/design-system/DesignSystemPage.tsx
 * Purpose : The living design-system lab: tokens, themes, typography, primitives, contrast and the
 *           responsive contract, all rendered from the real source of truth (PART 08.09, 08.10).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Values are read from CSS custom properties at runtime, so this page can never show a
 *           token that does not exist or drift from what components actually use.
 *           The page is dev-facing but public: it is part of the transparency commitment.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReactElement } from 'react';
import { Accordion } from '@/shared/ui/Accordion';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/shared/ui/Card';
import { Checkbox } from '@/shared/ui/Checkbox';
import { Chip, ChipGroup } from '@/shared/ui/Chip';
import { Container, Grid, Stack } from '@/shared/ui/Container';
import { Icon } from '@/shared/ui/Icon';
import { IconButton } from '@/shared/ui/IconButton';
import { Input } from '@/shared/ui/Input';
import { Progress, ProgressRing } from '@/shared/ui/ProgressRing';
import { RadioGroup } from '@/shared/ui/RadioGroup';
import { Select } from '@/shared/ui/Select';
import { Separator } from '@/shared/ui/Separator';
import { Skeleton } from '@/shared/ui/Skeleton';
import { Slider } from '@/shared/ui/Slider';
import { Switch } from '@/shared/ui/Switch';
import { Tabs } from '@/shared/ui/Tabs';
import { Tooltip } from '@/shared/ui/Tooltip';
import { Heading, Text } from '@/shared/ui/Typography';
import { HEX_TOKENS, TOKEN_GROUPS } from './tokenGroups';
import { contrastRatio, wcagLevel } from '@/shared/lib/color';
import { useBreakpoint, usePrefersReducedMotion } from '@/shared/hooks';
import { listFlags } from '@/core/flags/flagClient';
import { THEMES, useAppearance, type ThemeName } from '@/shared/stores/appearance';
import { BREAKPOINTS, RESPONSIVE_TEST_WIDTHS } from '@/core/config/breakpoints';
import { toBanglaNumerals } from '@/shared/lib/number.bn';

/**
 * Reads a CSS custom property from the document root.
 * @param name variable name, e.g. '--bsdc-green-500'
 * @returns the trimmed value, or an empty string when it is not set
 */
function readToken(name: string): string {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * Renders the design-system page.
 * @returns the design-system page element
 */
export function DesignSystemPage(): ReactElement {
  const { t, i18n } = useTranslation(['design-system', 'theme', 'common']);
  const bn = i18n.resolvedLanguage !== 'en';
  const { breakpoint, width, navigationModel } = useBreakpoint();
  const reducedMotion = usePrefersReducedMotion();
  const theme = useAppearance((state) => state.theme);
  const setTheme = useAppearance((state) => state.setTheme);

  const [foreground, setForeground] = useState('#0B1220');
  const [background, setBackground] = useState('#FFFFFF');
  const [slider, setSlider] = useState(40);
  const [radio, setRadio] = useState<'a' | 'b'>('a');
  const [checked, setChecked] = useState<boolean | 'indeterminate'>('indeterminate');
  const [switchOn, setSwitchOn] = useState(true);
  const [selectValue, setSelectValue] = useState<'one' | 'two'>('one');
  const [tokens, setTokens] = useState<Record<string, string>>({});

  // Token values are read once per theme so the table reflects the painted theme exactly.
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const group of TOKEN_GROUPS) {
      for (const token of group.tokens) next[token.name] = readToken(token.name);
    }
    setTokens(next);
  }, [theme]);

  const ratio = useMemo(() => contrastRatio(foreground, background), [foreground, background]);
  const level = useMemo(() => wcagLevel(foreground, background), [foreground, background]);

  return (
    <Container className="py-6 md:py-10">
      <Heading level={1} size="3xl" lang={bn ? 'bn' : 'en'}>
        {t('title', { ns: 'design-system' })}
      </Heading>
      <Text tone="muted" lang={bn ? 'bn' : 'en'} className="mt-2 max-w-[70ch]">
        {t('subtitle', { ns: 'design-system' })}
      </Text>
      <Text tone="subtle" size="sm" lang={bn ? 'bn' : 'en'} className="mt-1">
        {t('primitiveHint', { ns: 'design-system' })}
      </Text>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-10" aria-labelledby="themes">
        <Heading level={2} id="themes" size="xl" lang={bn ? 'bn' : 'en'}>
          {t('themesTitle', { ns: 'design-system' })}
        </Heading>
        <ChipGroup className="mt-3" label={t('themesTitle', { ns: 'design-system' })}>
          {THEMES.map((name: ThemeName) => (
            <Chip
              key={name}
              selected={theme === name}
              onToggle={(): void => setTheme(name)}
              icon={theme === name ? 'check' : undefined}
            >
              {t(`themes.${name}`, { ns: 'theme' })}
            </Chip>
          ))}
        </ChipGroup>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-10" aria-labelledby="tokens">
        <Heading level={2} id="tokens" size="xl" lang={bn ? 'bn' : 'en'}>
          {t('tokensTitle', { ns: 'design-system' })}
        </Heading>
        <Grid min={280} className="mt-4">
          {TOKEN_GROUPS.map((group) => (
            <Card key={group.id} variant="outlined">
              <CardHeader>
                <CardTitle>{t(group.titleKey, { ns: 'design-system' })}</CardTitle>
              </CardHeader>
              <CardBody>
                <ul className="grid gap-2">
                  {group.tokens.map((token) => {
                    const value = tokens[token.name] ?? '';
                    const isColour = value.startsWith('#') || value.startsWith('rgb');
                    return (
                      <li key={token.name} className="flex items-center gap-3 text-xs">
                        {isColour && (
                          <span
                            className="h-6 w-6 shrink-0 rounded-[var(--radius-xs)] border border-line"
                            style={{ backgroundColor: value }}
                            aria-hidden="true"
                          />
                        )}
                        <code className="min-w-0 flex-1 truncate font-mono">{token.name}</code>
                        <span className="shrink-0 font-mono text-ink-3">
                          {bn && /^[0-9.,]+$/.test(value) ? toBanglaNumerals(value) : value}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </CardBody>
            </Card>
          ))}
        </Grid>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-10" aria-labelledby="typography">
        <Heading level={2} id="typography" size="xl" lang={bn ? 'bn' : 'en'}>
          {t('typographyTitle', { ns: 'design-system' })}
        </Heading>
        <Card variant="outlined" className="mt-4">
          <CardBody>
            <ul className="grid gap-3">
              {(
                [
                  ['2xs', 'text-2xs'],
                  ['xs', 'text-xs'],
                  ['sm', 'text-sm'],
                  ['base', 'text-base'],
                  ['md', 'text-md'],
                  ['lg', 'text-lg'],
                  ['xl', 'text-xl'],
                  ['2xl', 'text-2xl'],
                  ['3xl', 'text-3xl'],
                  ['4xl', 'text-4xl'],
                  ['hero', 'text-hero'],
                ] as const
              ).map(([step, className]) => (
                <li key={step} className="flex flex-wrap items-baseline gap-3">
                  <code className="w-14 shrink-0 font-mono text-2xs text-ink-3">{step}</code>
                  <span className={`${className} min-w-0 flex-1`} lang="en">
                    {t('scaleSampleEn', { ns: 'design-system' })}
                  </span>
                  <span className={`${className} min-w-0 flex-1`} lang="bn">
                    {t('scaleSampleBn', { ns: 'design-system' })}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-10" aria-labelledby="contrast">
        <Heading level={2} id="contrast" size="xl" lang={bn ? 'bn' : 'en'}>
          {t('contrastTitle', { ns: 'design-system' })}
        </Heading>
        <Card variant="outlined" className="mt-4">
          <CardBody>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label={t('contrast.foreground', { ns: 'design-system' })}
                value={foreground}
                onChange={(event): void => setForeground(event.target.value)}
                className="font-mono"
              />
              <Input
                label={t('contrast.background', { ns: 'design-system' })}
                value={background}
                onChange={(event): void => setBackground(event.target.value)}
                className="font-mono"
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-ink-3">Presets</span>
              {HEX_TOKENS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  className="h-7 w-7 rounded-[var(--radius-xs)] border border-line"
                  style={{ backgroundColor: hex }}
                  aria-label={hex}
                  onClick={(): void => setForeground(hex)}
                  onContextMenu={(event): void => {
                    event.preventDefault();
                    setBackground(hex);
                  }}
                />
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <span
                className="rounded-[var(--radius-md)] px-4 py-3 text-sm font-semibold"
                style={{
                  backgroundColor: background,
                  color: foreground,
                  border: '1px solid var(--bsdc-border)',
                }}
              >
                {bn ? 'নমুনা পাঠ্য' : 'Sample text'}
              </span>
              <Badge tone={level === 'fail' ? 'danger' : level === 'aa' ? 'warning' : 'success'}>
                {`${t('contrast.ratio', { ns: 'design-system' })} ${ratio.toFixed(2)}:1`}
              </Badge>
              <Badge tone="neutral">
                {`${t('contrast.level', { ns: 'design-system' })} ${level.toUpperCase()}`}
              </Badge>
            </div>
          </CardBody>
        </Card>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-10" aria-labelledby="breakpoints">
        <Heading level={2} id="breakpoints" size="xl" lang={bn ? 'bn' : 'en'}>
          {t('breakpointsTitle', { ns: 'design-system' })}
        </Heading>
        <Card variant="outlined" className="mt-4">
          <CardBody>
            <dl className="grid gap-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-ink-3">{t('viewportWidth', { ns: 'design-system' })}</dt>
                <dd className="font-mono text-ink">
                  {bn ? toBanglaNumerals(`${width}px`) : `${width}px`}
                </dd>
              </div>
              <div>
                <dt className="text-ink-3">{t('currentBreakpoint', { ns: 'design-system' })}</dt>
                <dd className="font-mono text-ink">
                  {breakpoint} (
                  {bn
                    ? toBanglaNumerals(String(BREAKPOINTS[breakpoint]))
                    : `${BREAKPOINTS[breakpoint]}`}
                  px)
                </dd>
              </div>
              <div>
                <dt className="text-ink-3">{t('navigationModel', { ns: 'design-system' })}</dt>
                <dd className="font-mono text-ink">{navigationModel}</dd>
              </div>
            </dl>
            <Separator className="my-4" />
            <ChipGroup label={bn ? 'পরীক্ষিত প্রস্থ' : 'Verified widths'}>
              {RESPONSIVE_TEST_WIDTHS.map((entry) => (
                <Chip key={entry} size="sm" selected={false}>
                  {bn ? toBanglaNumerals(`${entry}px`) : `${entry}px`}
                </Chip>
              ))}
            </ChipGroup>
          </CardBody>
        </Card>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-10" aria-labelledby="primitives">
        <Heading level={2} id="primitives" size="xl" lang={bn ? 'bn' : 'en'}>
          {t('primitivesTitle', { ns: 'design-system' })}
        </Heading>

        <Tabs
          className="mt-4"
          label={t('primitivesTitle', { ns: 'design-system' })}
          items={[
            {
              value: 'actions',
              label: bn ? 'অ্যাকশন' : 'Actions',
              content: (
                <Stack direction="row" gap={3} wrap>
                  {(
                    [
                      'primary',
                      'secondary',
                      'outline',
                      'ghost',
                      'link',
                      'danger',
                      'success',
                      'brand-blue',
                      'subtle',
                      'glass',
                      'inverse',
                    ] as const
                  ).map((variant) => (
                    <Button key={variant} variant={variant}>
                      {variant}
                    </Button>
                  ))}
                  <Button loading>Loading</Button>
                  <Button disabled>Disabled</Button>
                  <IconButton icon="settings" label="Settings" />
                  <Tooltip content={bn ? 'সেটিংস' : 'Settings'}>
                    <IconButton icon="palette" label="Appearance" variant="secondary" />
                  </Tooltip>
                </Stack>
              ),
            },
            {
              value: 'forms',
              label: bn ? 'ফর্ম' : 'Forms',
              content: (
                <Grid min={260}>
                  <Input
                    label={bn ? 'নাম' : 'Name'}
                    placeholder={bn ? 'আপনার নাম' : 'Your name'}
                    required
                  />
                  <Input
                    label={bn ? 'ইমেইল' : 'Email'}
                    type="email"
                    error={bn ? 'ইমেইল সঠিক নয়' : 'That email is not valid'}
                  />
                  <Input
                    label={bn ? 'বায়ো' : 'Bio'}
                    hint={bn ? 'সর্বোচ্চ ১৬০ অক্ষর' : 'Up to 160 characters'}
                    counter={{ value: 24, max: 160 }}
                  />
                  <Select
                    label={bn ? 'ভূমিকা' : 'Role'}
                    value={selectValue}
                    onValueChange={setSelectValue}
                    options={[
                      { value: 'one', label: bn ? 'সদস্য' : 'Member' },
                      { value: 'two', label: bn ? 'মডারেটর' : 'Moderator' },
                    ]}
                  />
                  <RadioGroup
                    label={bn ? 'পছন্দ' : 'Choice'}
                    value={radio}
                    onValueChange={setRadio}
                    variant="card"
                    options={[
                      {
                        value: 'a',
                        label: bn ? 'প্রথম' : 'First',
                        description: bn ? 'প্রথম বিকল্প' : 'The first option',
                      },
                      {
                        value: 'b',
                        label: bn ? 'দ্বিতীয়' : 'Second',
                        description: bn ? 'দ্বিতীয় বিকল্প' : 'The second option',
                      },
                    ]}
                  />
                  <Slider
                    label={bn ? 'দূরত্ব (কিমি)' : 'Distance (km)'}
                    value={slider}
                    onValueChange={setSlider}
                    min={0}
                    max={100}
                  />
                  <Stack gap={2}>
                    <Checkbox
                      checked={checked}
                      onCheckedChange={setChecked}
                      label={bn ? 'আংশিক নির্বাচিত' : 'Partially selected'}
                    />
                    <Switch
                      checked={switchOn}
                      onCheckedChange={setSwitchOn}
                      label={bn ? 'বিজ্ঞপ্তি' : 'Notifications'}
                      description={bn ? 'নতুন উত্তরে' : 'On new answers'}
                    />
                  </Stack>
                </Grid>
              ),
            },
            {
              value: 'feedback',
              label: bn ? 'ফিডব্যাক' : 'Feedback',
              content: (
                <Stack gap={4}>
                  <Stack direction="row" gap={2} wrap>
                    {(
                      [
                        'neutral',
                        'success',
                        'warning',
                        'danger',
                        'info',
                        'brand',
                        'verified',
                        'admin',
                        'moderator',
                        'vendor',
                        'money',
                      ] as const
                    ).map((tone) => (
                      <Badge key={tone} tone={tone}>
                        {tone}
                      </Badge>
                    ))}
                    <Badge variant="count" tone="danger" count={128} banglaNumerals={bn} />
                  </Stack>
                  <Stack direction="row" gap={3} align="center" wrap>
                    <ProgressRing
                      value={0.68}
                      showValue
                      banglaNumerals={bn}
                      label="Level progress"
                    />
                    <Progress value={0.45} label="Upload progress" />
                    <Progress label="Indeterminate" />
                    <Progress value={0.9} tone="danger" label="Quota" />
                  </Stack>
                  <Skeleton variant="text" lines={3} />
                  <Skeleton height={72} />
                </Stack>
              ),
            },
            {
              value: 'content',
              label: bn ? 'কনটেন্ট' : 'Content',
              content: (
                <Stack gap={4}>
                  <Accordion
                    items={[
                      {
                        value: 'one',
                        title: bn ? 'কমিউনিটি নিয়ম' : 'Community rules',
                        content: (
                          <Text size="sm" tone="muted" lang={bn ? 'bn' : 'en'}>
                            {bn
                              ? 'নিয়ম প্রকাশ্যে রাখা হয় যাতে কেউ অজান্তে ভুল না করেন।'
                              : 'Rules are published so nobody breaks them by accident.'}
                          </Text>
                        ),
                      },
                      {
                        value: 'two',
                        title: bn ? 'মডারেশন আপিল' : 'Moderation appeals',
                        content: (
                          <Text size="sm" tone="muted" lang={bn ? 'bn' : 'en'}>
                            {bn
                              ? 'প্রতিটি সিদ্ধান্তের বিরুদ্ধে আপিল করা যায় এবং উত্তর দেওয়া বাধ্যতামূলক।'
                              : 'Every decision can be appealed, and every appeal must be answered.'}
                          </Text>
                        ),
                      },
                    ]}
                  />
                  <Stack direction="row" gap={2} wrap>
                    <Icon name="verified" size={20} label="Verified" />
                    <Icon name="shieldCheck" size={20} label="Protected" />
                    <Icon name="badgeCheck" size={20} label="Trusted" />
                    <Icon name="rocket" size={20} label="Launch" />
                  </Stack>
                </Stack>
              ),
            },
          ]}
        />
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-10" aria-labelledby="flags">
        <Heading level={2} id="flags" size="xl" lang={bn ? 'bn' : 'en'}>
          {t('flagsTitle', { ns: 'design-system' })}
        </Heading>
        <Card variant="outlined" className="mt-4">
          <CardBody>
            <ul className="grid gap-2 text-sm sm:grid-cols-2">
              {listFlags().map((flag) => (
                <li
                  key={flag.key}
                  className="flex items-center justify-between gap-3 border-b border-line pb-2"
                >
                  <span className="min-w-0 truncate font-mono text-xs">{flag.key}</span>
                  <Badge tone={flag.enabled ? 'success' : 'neutral'} variant="dot">
                    {flag.enabled ? (bn ? 'চালু' : 'on') : bn ? 'বন্ধ' : 'off'}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </section>

      <Separator className="my-10" />
      <Text tone="subtle" size="xs" lang={bn ? 'bn' : 'en'}>
        {reducedMotion
          ? bn
            ? 'কম মোশন মোড চালু আছে: অ্যানিমেশন সীমিত।'
            : 'Reduced motion is on: animations are limited.'
          : bn
            ? 'পূর্ণ মোশন মোড চালু আছে।'
            : 'Full motion mode is active.'}
      </Text>
    </Container>
  );
}
