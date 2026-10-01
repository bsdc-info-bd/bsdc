import { Command } from 'cmdk';
import {
  BookOpen,
  Github,
  Home,
  Info,
  Languages,
  Mail,
  Monitor,
  Moon,
  ScrollText,
  Search,
  Sun,
  User,
  Users,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Kbd } from '@/design-system';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { useSearchSuggestions } from '@/hooks/use-search';
import { changeLanguage } from '@/i18n';
import { coursePath, groupPath, profilePath, ROUTES, SITE } from '@/lib/site';
import type { SearchSuggestion } from '@/lib/search/search-types';
import { useThemeStore } from '@/store/theme-store';
import { useUiStore } from '@/store/ui-store';

interface PaletteAction {
  id: string;
  label: string;
  icon: ReactNode;
  run: () => void;
}

/** Spotlight-style command menu: Ctrl+K, Cmd+K or "/" from anywhere. */
export function CommandPalette() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);
  const [term, setTerm] = useState('');
  const { suggestions } = useSearchSuggestions(term);
  const open = useUiStore((state) => state.commandPaletteOpen);
  const setOpen = useUiStore((state) => state.setCommandPaletteOpen);
  const setPreference = useThemeStore((state) => state.setPreference);
  useFocusTrap(panelRef, open);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, setOpen]);

  if (!open || typeof document === 'undefined') return null;

  const close = () => setOpen(false);
  const go = (path: string) => () => {
    navigate(path);
    close();
  };

  const navigation: PaletteAction[] = [
    {
      id: 'home',
      label: t('palette.actions.goHome'),
      icon: <Home size={16} />,
      run: go(ROUTES.home),
    },
    {
      id: 'about',
      label: t('palette.actions.goAbout'),
      icon: <Info size={16} />,
      run: go(ROUTES.about),
    },
    {
      id: 'guidelines',
      label: t('palette.actions.goGuidelines'),
      icon: <ScrollText size={16} />,
      run: go(ROUTES.guidelines),
    },
    {
      id: 'contact',
      label: t('palette.actions.goContact'),
      icon: <Mail size={16} />,
      run: go(ROUTES.contact),
    },
  ];

  const preferences: PaletteAction[] = [
    {
      id: 'theme-light',
      label: t('palette.actions.themeLight'),
      icon: <Sun size={16} />,
      run: () => {
        setPreference('light');
        close();
      },
    },
    {
      id: 'theme-dark',
      label: t('palette.actions.themeDark'),
      icon: <Moon size={16} />,
      run: () => {
        setPreference('dark');
        close();
      },
    },
    {
      id: 'theme-system',
      label: t('palette.actions.themeSystem'),
      icon: <Monitor size={16} />,
      run: () => {
        setPreference('system');
        close();
      },
    },
    {
      id: 'language-bn',
      label: t('palette.actions.languageBangla'),
      icon: <Languages size={16} />,
      run: () => {
        void changeLanguage('bn');
        close();
      },
    },
    {
      id: 'language-en',
      label: t('palette.actions.languageEnglish'),
      icon: <Languages size={16} />,
      run: () => {
        void changeLanguage('en');
        close();
      },
    },
  ];

  const resources: PaletteAction[] = [
    {
      id: 'repository',
      label: t('palette.actions.openRepository'),
      icon: <Github size={16} />,
      run: () => {
        window.open(SITE.repository, '_blank', 'noopener,noreferrer');
        close();
      },
    },
  ];

  function suggestionPath(suggestion: SearchSuggestion): string {
    if (suggestion.kind === 'person') return profilePath(suggestion.slug);
    if (suggestion.kind === 'group') return groupPath(suggestion.slug);
    return coursePath(suggestion.slug);
  }

  function suggestionIcon(kind: SearchSuggestion['kind']): ReactNode {
    if (kind === 'person') return <User size={16} />;
    if (kind === 'group') return <Users size={16} />;
    return <BookOpen size={16} />;
  }

  // Live suggestions come from the database; the row policies there decide
  // what may be suggested, so nothing private is ever offered.
  const found: PaletteAction[] = suggestions.map((suggestion) => ({
    id: `${suggestion.kind}-${suggestion.slug}`,
    label: suggestion.title,
    icon: suggestionIcon(suggestion.kind),
    run: go(suggestionPath(suggestion)),
  }));

  if (term.trim().length >= 2) {
    found.push({
      id: 'search-all',
      label: t('palette.actions.searchFor', { term: term.trim() }),
      icon: <Search size={16} />,
      run: go(`${ROUTES.search}?q=${encodeURIComponent(term.trim())}`),
    });
  }

  const groups = [
    ...(found.length > 0
      ? [{ key: 'results', heading: t('palette.groups.results'), items: found }]
      : []),
    { key: 'navigation', heading: t('palette.groups.navigation'), items: navigation },
    { key: 'preferences', heading: t('palette.groups.preferences'), items: preferences },
    { key: 'resources', heading: t('palette.groups.resources'), items: resources },
  ];

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-8">
      <button
        type="button"
        aria-label={t('common.close')}
        onClick={close}
        className="absolute inset-0 h-full w-full cursor-default bg-green-900/40"
      />
      <div
        ref={panelRef}
        className="bsdc-cmdk relative z-10 mt-8 w-full max-w-xl animate-fade-up overflow-hidden rounded-card border border-border bg-bg shadow-sheet"
      >
        <Command label={t('palette.placeholder')} loop>
          <div className="border-b border-border px-3">
            <Command.Input
              placeholder={t('palette.placeholder')}
              value={term}
              onValueChange={setTerm}
            />
          </div>
          <Command.List className="fab-scroll max-h-[60dvh] overflow-y-auto p-2">
            <Command.Empty>{t('palette.empty')}</Command.Empty>
            {groups.map((group) => (
              <Command.Group key={group.key} heading={group.heading}>
                {group.items.map((action) => (
                  <Command.Item key={action.id} value={action.label} onSelect={action.run}>
                    <span aria-hidden="true" className="text-muted">
                      {action.icon}
                    </span>
                    <span className="fab-truncate">{action.label}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
          </Command.List>
        </Command>
        <p className="flex items-center gap-1.5 border-t border-border px-3 py-2 text-2xs text-muted">
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
          <span className="fab-truncate">{t('palette.hint')}</span>
        </p>
      </div>
    </div>,
    document.body,
  );
}
