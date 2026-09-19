/**
 * BSDC — src/widgets/footer/SiteFooter.tsx
 * Purpose : Global footer: RRC network hub, legal line, language and status (PART 03.02).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The footer is a complementary landmark with real anchors to every network property, so
 *           the RRC ecosystem is crawlable from every BSDC page (PART 10.06 internal linking).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Container } from '@/shared/ui/Container';
import { Separator } from '@/shared/ui/Separator';
import { Text } from '@/shared/ui/Typography';
import { BrandLogo } from '@/shared/ui/BrandLogo';
import { CONTACT, NETWORK_SITES, OWNERSHIP } from '@/core/config/app';
import { FOOTER_LINKS } from '@/core/config/navigation';

/** True when a network property lives outside the bsdc.info.bd domain. */
const isExternal = (url: string): boolean => !url.includes('bsdc.info.bd');

/**
 * Renders the site footer.
 * @returns a footer element
 */
export function SiteFooter(): React.ReactElement {
  const { t, i18n } = useTranslation(['footer', 'nav', 'common']);
  const bn = i18n.resolvedLanguage !== 'en';
  const year = new Date().getFullYear();

  return (
    <footer
      className="mt-auto border-t border-line bg-surface-2/60"
      aria-labelledby="footer-heading"
    >
      <Container className="py-8">
        <h2 id="footer-heading" className="bsdc-sr-only">
          {t('title', { ns: 'footer' })}
        </h2>
        <div className="grid gap-8 md:grid-cols-[1.4fr_1fr_1fr]">
          <div className="min-w-0">
            <BrandLogo variant="horizontal" height={34} />
            <Text tone="muted" className="mt-3 max-w-[42ch] text-sm">
              {t('description', { ns: 'footer' })}
            </Text>
            <Text tone="subtle" className="mt-2 text-xs">
              {OWNERSHIP.legalLine}
            </Text>
          </div>

          <nav aria-labelledby="footer-network-heading">
            <h3 id="footer-network-heading" className="mb-2 text-sm font-bold">
              {t('network', { ns: 'footer' })}
            </h3>
            <ul className="grid gap-1 text-sm">
              {NETWORK_SITES.map((site) => (
                <li key={site.key}>
                  <a
                    href={site.url}
                    className="text-ink-2 underline-offset-4 hover:text-ink hover:underline"
                    lang={bn ? 'bn' : 'en'}
                    rel={isExternal(site.url) ? 'noopener noreferrer' : undefined}
                    {...(isExternal(site.url) ? { target: '_blank' } : {})}
                  >
                    {bn ? site.labelBn : site.labelEn}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="footer-platform-heading">
            <h3 id="footer-platform-heading" className="mb-2 text-sm font-bold">
              {t('platform', { ns: 'footer' })}
            </h3>
            <ul className="grid gap-1 text-sm">
              {FOOTER_LINKS.map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className="text-ink-2 underline-offset-4 hover:text-ink hover:underline"
                  >
                    {t(link.labelKey, { ns: 'nav' })}
                  </Link>
                </li>
              ))}
              <li>
                <a
                  href={`mailto:${CONTACT.general}`}
                  className="text-ink-2 underline-offset-4 hover:text-ink hover:underline"
                >
                  {CONTACT.general}
                </a>
              </li>
            </ul>
          </nav>
        </div>

        <Separator className="my-6" />

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-3">
          <Text tone="subtle" className="text-xs">
            {`${year} ${OWNERSHIP.organisation}. ${t('rights', { ns: 'footer' })}`}
          </Text>
          <Text tone="subtle" className="text-xs">
            {OWNERSHIP.roleLine}: {OWNERSHIP.owner}
          </Text>
        </div>
      </Container>
    </footer>
  );
}
