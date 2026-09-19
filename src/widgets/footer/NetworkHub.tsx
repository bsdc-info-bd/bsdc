/**
 * BSDC — src/widgets/footer/NetworkHub.tsx
 * Purpose : The RRC network hub card: Bangladesh's first unified open digital ecosystem
 *           (PART 03.02, PART 07.03).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Rendered in the right rail on wide screens and near the footer on narrow ones. Every
 *           destination is a plain anchor so the whole network is reachable without JavaScript.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useTranslation } from 'react-i18next';
import { Card, CardBody, CardHeader, CardTitle } from '@/shared/ui/Card';
import { Icon } from '@/shared/ui/Icon';
import { NETWORK_SITES } from '@/core/config/app';

/** True when a network property lives outside the bsdc.info.bd domain. */
const isExternal = (url: string): boolean => !url.includes('bsdc.info.bd');

/**
 * Renders the network hub card.
 * @returns a card element
 */
export function NetworkHub(): React.ReactElement {
  const { t, i18n } = useTranslation(['footer', 'common']);
  const bn = i18n.resolvedLanguage !== 'en';
  return (
    <Card variant="default">
      <CardHeader>
        <CardTitle description={t('networkTagline', { ns: 'footer' })}>
          {t('network', { ns: 'footer' })}
        </CardTitle>
      </CardHeader>
      <CardBody>
        <ul className="grid gap-2">
          {NETWORK_SITES.map((site) => (
            <li key={site.key}>
              <a
                href={site.url}
                className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-line px-3 py-2 text-sm text-ink-2 transition-colors hover:border-green-300 hover:text-ink"
                rel={isExternal(site.url) ? 'noopener noreferrer' : undefined}
                {...(isExternal(site.url) ? { target: '_blank' } : {})}
              >
                <span className="min-w-0 truncate font-semibold" lang={bn ? 'bn' : 'en'}>
                  {bn ? site.labelBn : site.labelEn}
                </span>
                <span className="flex items-center gap-1 text-xs text-ink-3">
                  {bn ? site.descriptionBn : site.descriptionEn}
                  <Icon name={isExternal(site.url) ? 'externalLink' : 'arrowRight'} size={14} />
                </span>
              </a>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
