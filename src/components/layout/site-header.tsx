import { Globe, Monitor, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BsdcLogo } from '@/components/brand/bsdc-logo';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { changeLanguage, type Language } from '@/i18n';
import { useTheme, type Theme } from '@/hooks/use-theme';
import { Link, useLocation } from 'react-router-dom';

function ThemeMenu() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const options: { value: Theme; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: t('nav.themeLight'), icon: Sun },
    { value: 'dark', label: t('nav.themeDark'), icon: Moon },
    { value: 'system', label: t('nav.themeSystem'), icon: Monitor },
  ];
  const CurrentIcon = options.find((o) => o.value === theme)?.icon ?? Monitor;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('nav.theme')}>
          <CurrentIcon className="h-5 w-5" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)}>
          {options.map(({ value, label, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <span className="flex items-center gap-2">
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LanguageMenu() {
  const { t, i18n } = useTranslation();
  const current: Language = i18n.resolvedLanguage?.startsWith('bn') ? 'bn' : 'en';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('nav.language')}>
          <Globe className="h-5 w-5" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuRadioGroup
          value={current}
          onValueChange={(v) => changeLanguage(v as Language)}
        >
          <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="bn">বাংলা</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Site header. Built from 250px up: logo mark + compact wordmark fit the
 * narrowest viewport; section links appear from `tablet` (768px).
 */
export function SiteHeader() {
  const { t } = useTranslation();
  const location = useLocation();
  const onLanding = location.pathname === '/';
  const anchor = (id: string) => (onLanding ? `#${id}` : `/#${id}`);
  const links = [
    { id: 'about', label: t('nav.about') },
    { id: 'roadmap', label: t('nav.roadmap') },
    { id: 'contact', label: t('nav.contact') },
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-content items-center gap-2 px-2 sm:px-4">
        <Link
          to="/"
          aria-label={t('nav.homeLink')}
          className="flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <BsdcLogo className="h-8 w-8" />
          <span className="text-sm font-semibold tracking-tight sm:text-base">
            {t('brand.name')}
          </span>
        </Link>
        <nav aria-label={t('nav.siteNav')} className="ml-4 hidden items-center gap-1 tablet:flex">
          {links.map((link) => (
            <a
              key={link.id}
              href={anchor(link.id)}
              className="rounded-md px-2.5 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <LanguageMenu />
          <ThemeMenu />
        </div>
      </div>
    </header>
  );
}
