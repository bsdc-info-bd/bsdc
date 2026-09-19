/**
 * BSDC — src/pages/freelancer/FreelancerPage.tsx
 * Purpose : The freelancer hub: services people sell, and the orders on both sides.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Selling requires the vendor rank, and the screen says so with the reason rather than
 *   hiding the button: the hub is a marketplace inside a community, and the community needs to know
 *   why somebody can sell and somebody else cannot.
 *   Orders are split into what you are delivering and what you asked for, because those are two
 *   different anxieties and mixing them in one list means neither is answered well.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Container, Heading, Skeleton, Tabs, Text } from '@/shared/ui';
import { can } from '@/core/config/permissions';
import { useSession } from '@/features/auth';
import { ignoreReadFailure } from '@/core/errors/ignore';
import { GigForm, GigList, OrderCard, OrderDialog } from '@/features/freelancer';
import { createGig, listGigs, listIncomingOrders, listPurchases } from '@/entities/gig/repository';
import type { Gig, GigOrder } from '@/entities/gig/model';
import type { GigCategory } from '@/core/config/opportunities';

/**
 * Renders the freelancer hub route.
 * @returns the freelancer page
 */
export function FreelancerPage(): React.ReactElement {
  const { t } = useTranslation('freelancer');
  const { session, profile, locale } = useSession();
  const [gigs, setGigs] = useState<readonly Gig[]>([]);
  const [sales, setSales] = useState<readonly GigOrder[]>([]);
  const [purchases, setPurchases] = useState<readonly GigOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [category, setCategory] = useState<GigCategory | null>(null);
  const [ordering, setOrdering] = useState<Gig | null>(null);

  useEffect(() => {
    void listGigs({ ...(category !== null ? { category } : {}) })
      .then((next) => setGigs(next.items))
      .catch(ignoreReadFailure)
      .finally(() => setLoading(false));
  }, [category]);

  useEffect(() => {
    const uid = session.uid;
    if (uid === null || uid.length === 0) return;
    void listIncomingOrders(uid).then(setSales).catch(ignoreReadFailure);
    void listPurchases(uid).then(setPurchases).catch(ignoreReadFailure);
  }, [session.uid]);

  const lang = locale === 'bn' ? 'bn' : 'en';
  const maySell = profile !== null && can(profile.role, 'gig.create');

  return (
    <Container className="py-6">
      <header className="bsdc-page__head">
        <Heading level={1} size="xl" lang={lang}>
          {t('title')}
        </Heading>
        <Text as="p" tone="muted" lang={lang}>
          {t('subtitle')}
        </Text>
        {maySell ? (
          <Button variant="primary" iconLeft="plus" onClick={() => setComposing(true)}>
            {t('offer')}
          </Button>
        ) : profile !== null ? (
          <Text as="p" size="sm" tone="muted" lang={lang}>
            {t('offerRequiresVendor')}
          </Text>
        ) : null}
      </header>

      {composing && profile !== null ? (
        <GigForm
          freelancerUid={profile.uid}
          freelancerName={profile.displayName}
          freelancerPhotoUrl={profile.photoUrl}
          locale={locale}
          onCancel={() => setComposing(false)}
          onSubmit={async (gig) => {
            await createGig(gig);
            setComposing(false);
          }}
        />
      ) : null}

      {loading ? (
        <Skeleton height={420} />
      ) : (
        <Tabs
          label={t('tabs.label')}
          defaultValue="gigs"
          items={[
            {
              value: 'gigs',
              label: t('tabs.gigs'),
              content: (
                <GigList
                  gigs={gigs}
                  locale={locale}
                  activeCategory={category}
                  onCategoryChange={setCategory}
                  onOpen={setOrdering}
                />
              ),
            },
            {
              value: 'sales',
              label: t('tabs.sales'),
              content:
                sales.length === 0 ? (
                  <Text as="p" tone="muted" lang={lang}>
                    {t('tabs.salesEmpty')}
                  </Text>
                ) : (
                  <ul className="bsdc-freelancer__orders">
                    {sales.map((order) => (
                      <li key={order.id}>
                        <OrderCard
                          order={order}
                          locale={locale}
                          asFreelancer
                          onChange={(next) =>
                            setSales((current) =>
                              current.map((entry) => (entry.id === next.id ? next : entry)),
                            )
                          }
                        />
                      </li>
                    ))}
                  </ul>
                ),
            },
            {
              value: 'purchases',
              label: t('tabs.purchases'),
              content:
                purchases.length === 0 ? (
                  <Text as="p" tone="muted" lang={lang}>
                    {t('tabs.purchasesEmpty')}
                  </Text>
                ) : (
                  <ul className="bsdc-freelancer__orders">
                    {purchases.map((order) => (
                      <li key={order.id}>
                        <OrderCard
                          order={order}
                          locale={locale}
                          asFreelancer={false}
                          onChange={(next) =>
                            setPurchases((current) =>
                              current.map((entry) => (entry.id === next.id ? next : entry)),
                            )
                          }
                        />
                      </li>
                    ))}
                  </ul>
                ),
            },
          ]}
        />
      )}

      {ordering !== null && profile !== null ? (
        <OrderDialog
          open
          onOpenChange={(open) => {
            if (!open) setOrdering(null);
          }}
          gig={ordering}
          buyerUid={profile.uid}
          buyerName={profile.displayName}
          locale={locale}
          onPlaced={(order) => setPurchases((current) => [order, ...current])}
        />
      ) : null}
    </Container>
  );
}
