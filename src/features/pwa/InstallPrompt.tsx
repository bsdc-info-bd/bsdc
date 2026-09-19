/**
 * BSDC — src/features/pwa/InstallPrompt.tsx
 * Purpose : The branded install offer, made after a person has actually used the platform.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The offer appears once the browser says the app is installable and the person has
 *   visited three times, which is a proxy for "they came back". It never appears over what they are
 *   doing: it sits at the bottom of the shell, above the navigation, and it leaves for sixty days
 *   when dismissed.
 *   Both flags are honoured. Turning `pwa.installPrompt` off is the supported way to stop asking,
 *   which is what an administrator needs when their community is mostly desktop.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useTranslation } from 'react-i18next';
import { Button, Card, Icon, IconButton, Text } from '@/shared/ui';
import type { Locale } from '@/core/config/app';
import { FLAG_KEYS } from '@/core/config/features';
import { useFlag } from '@/shared/hooks';
import { readJson, writeJson } from '@/shared/lib/storage';
import { useInstallPrompt } from './useInstallPrompt';

/** How many visits before the offer is made. */
const VISITS_BEFORE_OFFER = 3;

/** Storage key holding the visit count. */
const VISITS_KEY = 'pwa:visits';

/** Props for the install prompt. */
export interface InstallPromptProps {
  readonly locale: Locale;
}

/**
 * Renders the install offer when the browser has made one and the person has come back.
 * @param props component props
 * @returns the prompt, or nothing at all
 */
export function InstallPrompt({ locale }: InstallPromptProps): React.ReactElement | null {
  const { t } = useTranslation('pwa');
  const pwaEnabled = useFlag(FLAG_KEYS.pwa);
  const promptEnabled = useFlag(FLAG_KEYS.pwaInstallPrompt);
  const { canInstall, install, dismiss } = useInstallPrompt();
  const lang = locale === 'bn' ? 'bn' : 'en';

  if (!pwaEnabled || !promptEnabled || !canInstall) return null;
  if (visitCount() < VISITS_BEFORE_OFFER) return null;

  return (
    <Card as="aside" className="bsdc-pwa__prompt" padding="md">
      <Icon name="externalLink" size={20} />
      <div className="bsdc-pwa__copy">
        <Text as="p" size="sm" weight={600} lang={lang}>
          {t('install.title')}
        </Text>
        <Text as="p" size="sm" tone="muted" lang={lang}>
          {t('install.body')}
        </Text>
      </div>
      <Button
        type="button"
        variant="primary"
        size="sm"
        onClick={() => {
          void install();
        }}
      >
        {t('install.action')}
      </Button>
      <IconButton
        icon="close"
        label={t('install.dismiss')}
        variant="ghost"
        size="sm"
        onClick={dismiss}
      />
    </Card>
  );
}

/**
 * Counts this visit and returns the running total.
 * @returns how many times the app has been opened on this device
 */
function visitCount(): number {
  const current = readJson<number>(VISITS_KEY, 0) + 1;
  writeJson(VISITS_KEY, current);
  return current;
}
