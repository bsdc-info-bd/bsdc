/**
 * BSDC — src/pages/network/NetworkPage.tsx
 * Purpose : The RRC network hub page: Bangladesh's first unified open digital ecosystem
 *           (PART 03.02).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Plain anchors, never JS navigation, so the network graph is crawlable and usable
 *           without scripts (PART 10.10 rule 3).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useTranslation } from 'react-i18next';
import type { ReactElement } from 'react';
import { Badge } from '@/shared/ui/Badge';
import { Separator } from '@/shared/ui/Separator';
import { Heading, Text } from '@/shared/ui/Typography';
import { Icon } from '@/shared/ui/Icon';
import { NETWORK_SITES } from '@/core/config/app';

/** True when a network property lives outside the bsdc.info.bd domain. */
const isExternal = (url: string): boolean => !url.includes('bsdc.info.bd');

/**
 * Renders the network page.
 * @returns the network page element
 */
export function NetworkPage(): ReactElement {
  const { t, i18n } = useTranslation(['network', 'common']);
  const bn = i18n.resolvedLanguage !== 'en';

  return (
    <article className="min-w-0">
      <Heading level={1} size="3xl" lang={bn ? 'bn' : 'en'}>
        {t('title', { ns: 'network' })}
      </Heading>
      <Text tone="muted" lang={bn ? 'bn' : 'en'} className="mt-3 max-w-[70ch]">
        {t('subtitle', { ns: 'network' })}
      </Text>

      <Separator className="my-8" />

      <ul className="grid gap-4 sm:grid-cols-2">
        {NETWORK_SITES.map((site) => (
          <li key={site.key}>
            <a
              href={site.url}
              className="group flex h-full flex-col gap-2 rounded-[var(--radius-lg)] border border-line bg-surface p-4 transition-colors hover:border-green-400"
              rel={isExternal(site.url) ? 'noopener noreferrer' : undefined}
              {...(isExternal(site.url) ? { target: '_blank' } : {})}
            >
              <span className="flex items-center justify-between gap-3">
                <span
                  className="min-w-0 truncate text-base font-bold text-ink"
                  lang={bn ? 'bn' : 'en'}
                >
                  {bn ? site.labelBn : site.labelEn}
                </span>
                <Icon name={isExternal(site.url) ? 'externalLink' : 'arrowRight'} size={16} />
              </span>
              <span className="text-sm text-ink-2" lang={bn ? 'bn' : 'en'}>
                {bn ? site.descriptionBn : site.descriptionEn}
              </span>
              <Badge
                tone={isExternal(site.url) ? 'info' : 'neutral'}
                className="mt-auto self-start"
              >
                {isExternal(site.url) ? 'External' : 'RRC'}
              </Badge>
            </a>
          </li>
        ))}
      </ul>

      <Separator className="my-8" />

      <Text tone="subtle" size="sm" lang={bn ? 'bn' : 'en'}>
        {t('note', { ns: 'network' })}
      </Text>
    </article>
  );
}
