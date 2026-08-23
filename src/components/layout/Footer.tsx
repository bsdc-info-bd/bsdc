/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BsdcLogo, RrcLogo } from '@/components/branding/Logo';
import { Github, Globe, Mail, MapPin, Heart, ArrowUp } from 'lucide-react';
import {
  APP_EMAIL,
  APP_EMAIL_SECONDARY,
  FOUNDER_NAME,
  SISTER_PROJECT_NAME,
  SISTER_PROJECT_URL,
} from '@/config/constants';

export function Footer() {
  const { t } = useTranslation();
  const location = useLocation();
  const year = new Date().getFullYear();

  // 🚫 CRITICAL: Do NOT render footer on messages / chat pages.
  // This prevents the footer from pushing the chat input box off-screen.
  const HIDDEN_PATHS = ['/messages', '/chat', '/dm'];
  const shouldHide = HIDDEN_PATHS.some((path) => location.pathname.startsWith(path));
  if (shouldHide) return null;

  const scrollTop = () => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <footer className="relative mt-auto overflow-hidden border-t border-surface-light-border bg-gradient-to-br from-surface-light-muted via-white to-brand-50/30 dark:border-surface-dark-border dark:from-[#0B0B0B] dark:via-[#0B0B0B] dark:to-brand-950/20">
      {/* Decorative gradient orbs */}
      <div className="pointer-events-none absolute -left-24 top-0 h-64 w-64 rounded-full bg-brand-500/5 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -right-24 bottom-0 h-64 w-64 rounded-full bg-purple-500/5 blur-3xl" aria-hidden />

      <div className="bsdc-container relative grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-5">
        {/* Brand Column */}
        <div className="lg:col-span-2">
          <BsdcLogo height={34} withTagline />
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
            {t('footer.aboutBody')}
          </p>
          <div className="mt-4 space-y-2 text-sm text-neutral-500 dark:text-neutral-400">
            <p className="group flex items-center gap-2 transition-colors hover:text-brand-600">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600 transition-transform group-hover:scale-110 dark:bg-brand-950/50">
                <Mail className="h-3.5 w-3.5" aria-hidden />
              </span>
              <a href={`mailto:${APP_EMAIL}`} className="hover:underline">
                {APP_EMAIL}
              </a>
            </p>
            <p className="group flex items-center gap-2 transition-colors hover:text-brand-600">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600 transition-transform group-hover:scale-110 dark:bg-brand-950/50">
                <MapPin className="h-3.5 w-3.5" aria-hidden />
              </span>
              Bangladesh
            </p>
            <p className="group flex items-center gap-2 transition-colors hover:text-brand-600">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600 transition-transform group-hover:scale-110 dark:bg-brand-950/50">
                <Globe className="h-3.5 w-3.5" aria-hidden />
              </span>
              <a
                href={SISTER_PROJECT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                {SISTER_PROJECT_NAME}
              </a>
            </p>
          </div>
        </div>

        {/* Product */}
        <nav aria-label="Product">
          <p className="mb-3 text-sm font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-200">
            {t('footer.product')}
          </p>
          <ul className="space-y-2 text-sm text-neutral-500 dark:text-neutral-400">
            {[
              { to: '/explore', label: t('nav.explore') },
              { to: '/groups', label: t('nav.groups') },
              { to: '/marketplace', label: t('nav.marketplace') },
              { to: '/jobs', label: t('nav.jobs') },
              { to: '/events', label: t('nav.events') },
            ].map((item) => (
              <li key={item.to}>
                <Link
                  className="inline-block transition-all hover:translate-x-0.5 hover:text-brand-600"
                  to={item.to}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Community */}
        <nav aria-label="Community">
          <p className="mb-3 text-sm font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-200">
            {t('footer.community')}
          </p>
          <ul className="space-y-2 text-sm text-neutral-500 dark:text-neutral-400">
            {[
              { to: '/leaderboard', label: t('nav.leaderboard') },
              { to: '/creator-program', label: t('nav.creatorProgram') },
              { to: '/license', label: t('nav.license') },
              { to: '/directory', label: t('nav.directory') },
              { to: '/branding', label: t('nav.branding') },
            ].map((item) => (
              <li key={item.to}>
                <Link
                  className="inline-block transition-all hover:translate-x-0.5 hover:text-brand-600"
                  to={item.to}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Legal */}
        <nav aria-label="Company and legal">
          <p className="mb-3 text-sm font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-200">
            {t('footer.legal')}
          </p>
          <ul className="space-y-2 text-sm text-neutral-500 dark:text-neutral-400">
            {[
              { to: '/about', label: t('nav.about') },
              { to: '/contact', label: t('nav.contact') },
              { to: '/terms', label: t('nav.terms') },
              { to: '/privacy', label: t('nav.privacy') },
              { to: '/guidelines', label: t('nav.guidelines') },
            ].map((item) => (
              <li key={item.to}>
                <Link
                  className="inline-block transition-all hover:translate-x-0.5 hover:text-brand-600"
                  to={item.to}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex items-center gap-1.5 text-sm text-neutral-500 dark:text-neutral-400">
            <Github className="h-4 w-4 text-brand-600" aria-hidden />
            <a
              href="https://github.com/bsdc-info-bd/bsdc"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-brand-600 hover:underline"
            >
              GitHub
            </a>
          </p>
        </nav>
      </div>

      {/* Bottom bar */}
      <div className="relative border-t border-surface-light-border dark:border-surface-dark-border">
        <div className="bsdc-container flex flex-col items-center justify-between gap-3 py-5 text-xs text-neutral-500 dark:text-neutral-400 sm:flex-row">
          <p className="flex items-center gap-1.5 text-center sm:text-left">
            © {year} BSDC — RRC Development.{' '}
            <span className="hidden sm:inline">{t('footer.rights')}</span>
            <Heart className="h-3 w-3 text-red-500 animate-pulse" aria-hidden />
          </p>
          <RrcLogo height={22} />
          <p className="text-center sm:text-right">
            {t('footer.ceo')}: <span className="font-semibold">{FOUNDER_NAME}</span>
            <span className="block opacity-75">Contact: {APP_EMAIL_SECONDARY}</span>
          </p>
        </div>

        {/* Back to top */}
        <button
          type="button"
          onClick={scrollTop}
          aria-label="Back to top"
          className="absolute -top-5 left-1/2 flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full border border-surface-light-border bg-white text-brand-600 shadow-lg transition-all hover:-translate-y-1 hover:-translate-x-1/2 hover:shadow-xl active:scale-90 dark:border-surface-dark-border dark:bg-surface-dark-raised"
        >
          <ArrowUp className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </footer>
  );
}
