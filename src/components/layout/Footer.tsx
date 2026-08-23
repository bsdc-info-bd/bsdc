/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BsdcLogo, RrcLogo } from '@/components/branding/Logo';
import { Github, Globe, Mail, MapPin } from 'lucide-react';
import { APP_EMAIL, APP_EMAIL_SECONDARY, FOUNDER_NAME, SISTER_PROJECT_NAME, SISTER_PROJECT_URL } from '@/config/constants';

export function Footer() {
  const { t } = useTranslation();
  const year = new Date().getFullYear();
  return (
    <footer className="mt-auto border-t border-surface-light-border bg-surface-light-muted dark:border-surface-dark-border dark:bg-[#0B0B0B]">
      <div className="bsdc-container grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <BsdcLogo height={34} withTagline />
          <p className="mt-3 max-w-sm text-sm text-neutral-500 dark:text-neutral-400">{t('footer.aboutBody')}</p>
          <div className="mt-4 space-y-1.5 text-sm text-neutral-500 dark:text-neutral-400">
            <p className="flex items-center gap-2">
              <Mail className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
              <a href={`mailto:${APP_EMAIL}`} className="hover:text-brand-600">{APP_EMAIL}</a>
            </p>
            <p className="flex items-center gap-2">
              <MapPin className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
              Bangladesh
            </p>
            <p className="flex items-center gap-2">
              <Globe className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
              <a href={SISTER_PROJECT_URL} target="_blank" rel="noopener noreferrer" className="hover:text-brand-600">
                {SISTER_PROJECT_NAME}
              </a>
            </p>
          </div>
        </div>

        <nav aria-label="Product">
          <p className="mb-3 text-sm font-bold">{t('footer.product')}</p>
          <ul className="space-y-2 text-sm text-neutral-500 dark:text-neutral-400">
            <li><Link className="hover:text-brand-600" to="/explore">{t('nav.explore')}</Link></li>
            <li><Link className="hover:text-brand-600" to="/groups">{t('nav.groups')}</Link></li>
            <li><Link className="hover:text-brand-600" to="/marketplace">{t('nav.marketplace')}</Link></li>
            <li><Link className="hover:text-brand-600" to="/jobs">{t('nav.jobs')}</Link></li>
            <li><Link className="hover:text-brand-600" to="/events">{t('nav.events')}</Link></li>
          </ul>
        </nav>

        <nav aria-label="Community">
          <p className="mb-3 text-sm font-bold">{t('footer.community')}</p>
          <ul className="space-y-2 text-sm text-neutral-500 dark:text-neutral-400">
            <li><Link className="hover:text-brand-600" to="/leaderboard">{t('nav.leaderboard')}</Link></li>
            <li><Link className="hover:text-brand-600" to="/creator-program">{t('nav.creatorProgram')}</Link></li>
            <li><Link className="hover:text-brand-600" to="/license">{t('nav.license')}</Link></li>
            <li><Link className="hover:text-brand-600" to="/directory">{t('nav.directory')}</Link></li>
            <li><Link className="hover:text-brand-600" to="/branding">{t('nav.branding')}</Link></li>
          </ul>
        </nav>

        <nav aria-label="Company and legal">
          <p className="mb-3 text-sm font-bold">{t('footer.legal')}</p>
          <ul className="space-y-2 text-sm text-neutral-500 dark:text-neutral-400">
            <li><Link className="hover:text-brand-600" to="/about">{t('nav.about')}</Link></li>
            <li><Link className="hover:text-brand-600" to="/contact">{t('nav.contact')}</Link></li>
            <li><Link className="hover:text-brand-600" to="/terms">{t('nav.terms')}</Link></li>
            <li><Link className="hover:text-brand-600" to="/privacy">{t('nav.privacy')}</Link></li>
            <li><Link className="hover:text-brand-600" to="/guidelines">{t('nav.guidelines')}</Link></li>
          </ul>
          <p className="mt-3 flex items-center gap-1.5 text-sm text-neutral-500 dark:text-neutral-400">
            <Github className="h-4 w-4 text-brand-600" aria-hidden />
            <a href="https://github.com/bsdc-info-bd/bsdc" target="_blank" rel="noopener noreferrer" className="hover:text-brand-600">
              GitHub
            </a>
          </p>
        </nav>
      </div>

      <div className="border-t border-surface-light-border dark:border-surface-dark-border">
        <div className="bsdc-container flex flex-col items-center justify-between gap-3 py-5 text-xs text-neutral-500 dark:text-neutral-400 sm:flex-row">
          <p>
            © {year} BSDC — RRC Development. {t('footer.rights')}
          </p>
          <RrcLogo height={22} />
          <p className="text-center sm:text-right">
            {t('footer.ceo')}: {FOUNDER_NAME}
            <span className="block opacity-75">Contact: {APP_EMAIL_SECONDARY}</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
