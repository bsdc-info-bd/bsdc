/**
 * BSDC — src/pages/market/MarketPage.tsx
 * Purpose : The public marketplace route: hire a BSDC member, or be hired.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Public and indexable — this is one of the few pages whose whole job is to be found by
 *   somebody who has never heard of us, so it carries a canonical, an hreflang pair, a share card
 *   and JSON-LD (PART 10). The listing itself is sold by a person, not by BSDC, and the page says
 *   so: a platform that pretends to employ everybody it lists will end up answering for them.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Container, Heading, Text, toastSuccess } from '@/shared/ui';

import { useSession } from '@/features/auth';
import { GigDetailSheet, MarketGrid, useMarket } from '@/features/market';
import { OfflineBoundary } from '@/features/pwa';
import type { Gig, GigOrder } from '@/entities/gig/model';

/**
 * Renders the marketplace route.
 * @returns the page
 */
export function MarketPage(): React.ReactElement {
  const { t } = useTranslation('market');
  const { session, locale } = useSession();
  const market = useMarket(locale);
  const [open, setOpen] = useState<Gig | null>(null);
  const lang = locale === 'bn' ? 'bn' : 'en';

  return (
    <Container className="py-6">
      <header className="bsdc-page__head">
        <Heading level={1} size="xl" lang={lang}>
          {t('title')}
        </Heading>
        <Text as="p" tone="muted" lang={lang}>
          {t('subtitle')}
        </Text>
      </header>

      {/* Offline with nothing cached is not an empty marketplace, and the two must not look
          alike: one is a fact about the network, the other is a fact about the community. */}
      <OfflineBoundary
        locale={locale}
        hasCache={market.source === 'local' || market.gigs.length > 0}
      >
        <MarketGrid
          locale={locale}
          market={market}
          onOpen={(gig) => {
            setOpen(gig);
          }}
        />
      </OfflineBoundary>

      <GigDetailSheet
        open={open !== null}
        onOpenChange={(next) => {
          if (!next) setOpen(null);
        }}
        gig={open}
        locale={locale}
        uid={session.uid}
        buyerName={session.displayName ?? ''}
        onOrdered={(order: GigOrder) => {
          toastSuccess(locale, t('orderedTitle'), t('orderedBody', { id: order.readableId }));
          setOpen(null);
        }}
      />
    </Container>
  );
}
