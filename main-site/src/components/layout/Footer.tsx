import { Github } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ExternalLink, Logo } from '@/design-system';
import { ECOSYSTEM_LINKS, ROUTES, SITE } from '@/lib/site';

const PLATFORM_LINKS = [
  { to: ROUTES.about, labelKey: 'nav.about' },
  { to: ROUTES.guidelines, labelKey: 'nav.guidelines' },
  { to: ROUTES.contact, labelKey: 'nav.contact' },
] as const;

export function Footer() {
  const { t } = useTranslation();
  const year = new Date().getFullYear();

  return (
    <footer className="mt-10 border-t border-border bg-surface">
      <div className="fab-container grid gap-6 py-8 sm:grid-cols-2 lg:grid-cols-4">
        <div className="min-w-0">
          <Logo variant="full" className="h-9" title={t('common.brandFull')} />
          <p className="mt-3 text-sm text-muted">{t('footer.builtBy')}</p>
          <p className="mt-1 text-sm text-muted">{SITE.emails.primary}</p>
        </div>

        <nav aria-label={t('footer.sections.platform')} className="min-w-0">
          <h2 className="text-sm font-semibold">{t('footer.sections.platform')}</h2>
          <ul className="mt-2 space-y-1.5">
            {PLATFORM_LINKS.map((link) => (
              <li key={link.to}>
                <Link to={link.to} className="text-sm text-muted hover:text-text">
                  {t(link.labelKey)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label={t('footer.sections.community')} className="min-w-0">
          <h2 className="text-sm font-semibold">{t('footer.sections.community')}</h2>
          <ul className="mt-2 space-y-1.5">
            <li>
              <ExternalLink href={SITE.repository} className="text-sm">
                <span className="inline-flex items-center gap-1">
                  <Github size={14} aria-hidden="true" /> GitHub
                </span>
              </ExternalLink>
            </li>
            <li>
              <ExternalLink href={SITE.owner.site} className="text-sm">
                {SITE.owner.name}
              </ExternalLink>
            </li>
          </ul>
        </nav>

        <nav aria-label={t('footer.sections.ecosystem')} className="min-w-0">
          <h2 className="text-sm font-semibold">{t('footer.sections.ecosystem')}</h2>
          <ul className="mt-2 space-y-1.5">
            {ECOSYSTEM_LINKS.map((link) => (
              <li key={link.href}>
                <ExternalLink href={link.href} className="text-sm" showIcon={false}>
                  {t(link.labelKey)}
                </ExternalLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="border-t border-border">
        <div className="fab-container flex flex-col gap-1 py-4 text-xs text-muted">
          <p>
            &copy; {year} {SITE.parentOrganization}. {t('footer.rights')}
          </p>
          <p>{t('footer.proprietary')}</p>
        </div>
      </div>
    </footer>
  );
}
