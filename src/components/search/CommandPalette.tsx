/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Command } from 'cmdk';
import {
  Home, Compass, Flame, MessageSquare, Bell, Users, ShoppingBag, Briefcase, CalendarDays,
  Trophy, Zap, FileBadge, Star, Settings, FileText, Library, BookOpen, FolderGit2, Plus,
  Search as SearchIcon, CornerDownLeft, Clock, X,
} from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { useSearch } from '@/hooks/useSearch';
import { Avatar } from '@/components/ui/Avatar';

const PAGES = [
  { to: '/', labelKey: 'nav.home', icon: Home },
  { to: '/explore', labelKey: 'nav.explore', icon: Compass },
  { to: '/trending', labelKey: 'nav.trending', icon: Flame },
  { to: '/messages', labelKey: 'nav.messages', icon: MessageSquare, auth: true },
  { to: '/notifications', labelKey: 'nav.notifications', icon: Bell, auth: true },
  { to: '/groups', labelKey: 'nav.groups', icon: Users },
  { to: '/marketplace', labelKey: 'nav.marketplace', icon: ShoppingBag },
  { to: '/jobs', labelKey: 'nav.jobs', icon: Briefcase },
  { to: '/events', labelKey: 'nav.events', icon: CalendarDays },
  { to: '/leaderboard', labelKey: 'nav.leaderboard', icon: Trophy },
  { to: '/points', labelKey: 'nav.pointsWallet', icon: Zap, auth: true },
  { to: '/license', labelKey: 'nav.license', icon: FileBadge },
  { to: '/creator-program', labelKey: 'nav.creatorProgram', icon: Star },
  { to: '/blog', labelKey: 'nav.blog', icon: FileText },
  { to: '/snippets', labelKey: 'nav.snippets', icon: Library },
  { to: '/docs', labelKey: 'nav.docs', icon: BookOpen },
  { to: '/projects', labelKey: 'nav.projects', icon: FolderGit2 },
  { to: '/settings', labelKey: 'nav.settings', icon: Settings, auth: true },
];

export function CommandPalette() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const open = useUIStore((s) => s.commandPaletteOpen);
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const profile = useAuthStore((s) => s.profile);
  const [query, setQuery] = useState('');
  const { hits, recent, clearRecent } = useSearch(query);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setOpen]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center p-4 pt-[10vh]" role="dialog" aria-modal="true" aria-label={t('common.search')}>
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
      <div className="bsdc-animate-slide-up relative w-full max-w-xl overflow-hidden rounded-2xl border border-surface-light-border bg-white shadow-raised dark:border-surface-dark-border dark:bg-surface-dark-raised">
        <Command loop shouldFilter={false} className="flex flex-col">
          <div className="flex items-center gap-3 border-b border-surface-light-border px-4 dark:border-surface-dark-border">
            <SearchIcon className="h-5 w-5 shrink-0 text-neutral-400" aria-hidden />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder={t('common.searchPlaceholder')}
              className="h-14 w-full bg-transparent text-sm outline-none placeholder:text-neutral-400"
              autoFocus
            />
            <button type="button" onClick={() => setOpen(false)} aria-label={t('common.close')} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-surface-dark">
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <Command.List className="max-h-[55vh] overflow-y-auto p-2">
            <Command.Empty className="px-3 py-8 text-center text-sm text-neutral-400">
              {query ? `${t('common.noResults')} — ${t('common.tryDifferent')}` : t('common.searchPlaceholder')}
            </Command.Empty>

            {!query && recent.length > 0 ? (
              <Command.Group heading={t('common.search')} className="[&>[cmdk-group-heading]]:px-2 [&>[cmdk-group-heading]]:py-1.5 [&>[cmdk-group-heading]]:text-[11px] [&>[cmdk-group-heading]]:font-bold [&>[cmdk-group-heading]]:uppercase [&>[cmdk-group-heading]]:tracking-wider [&>[cmdk-group-heading]]:text-neutral-400">
                {recent.map((r) => (
                  <Command.Item
                    key={r}
                    value={`recent-${r}`}
                    onSelect={() => navigate(`/search?q=${encodeURIComponent(r)}`)}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm data-[selected=true]:bg-neutral-100 dark:data-[selected=true]:bg-surface-dark"
                  >
                    <Clock className="h-4 w-4 text-neutral-400" aria-hidden />
                    {r}
                  </Command.Item>
                ))}
                <Command.Item
                  value="clear-recent"
                  onSelect={() => clearRecent()}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-xs text-neutral-400 data-[selected=true]:bg-neutral-100 dark:data-[selected=true]:bg-surface-dark"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                  Clear recent searches
                </Command.Item>
              </Command.Group>
            ) : null}

            {profile ? (
              <Command.Group heading={t('common.create')} className="[&>[cmdk-group-heading]]:px-2 [&>[cmdk-group-heading]]:py-1.5 [&>[cmdk-group-heading]]:text-[11px] [&>[cmdk-group-heading]]:font-bold [&>[cmdk-group-heading]]:uppercase [&>[cmdk-group-heading]]:tracking-wider [&>[cmdk-group-heading]]:text-neutral-400">
                <Command.Item
                  value="new-post"
                  onSelect={() => navigate('/create')}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm font-semibold text-brand-700 data-[selected=true]:bg-neutral-100 dark:text-brand-300 dark:data-[selected=true]:bg-surface-dark"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  {t('post.newPost')}
                </Command.Item>
              </Command.Group>
            ) : null}

            <Command.Group heading={t('common.all')} className="[&>[cmdk-group-heading]]:px-2 [&>[cmdk-group-heading]]:py-1.5 [&>[cmdk-group-heading]]:text-[11px] [&>[cmdk-group-heading]]:font-bold [&>[cmdk-group-heading]]:uppercase [&>[cmdk-group-heading]]:tracking-wider [&>[cmdk-group-heading]]:text-neutral-400">
              {PAGES.filter((p) => !p.auth || profile).map((page) => (
                <Command.Item
                  key={page.to}
                  value={page.to}
                  onSelect={() => navigate(page.to)}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm data-[selected=true]:bg-neutral-100 dark:data-[selected=true]:bg-surface-dark"
                >
                  <page.icon className="h-4 w-4 text-neutral-400" aria-hidden />
                  {t(page.labelKey)}
                </Command.Item>
              ))}
            </Command.Group>

            {query && hits.length > 0 ? (
              <Command.Group heading={t('common.search')} className="[&>[cmdk-group-heading]]:px-2 [&>[cmdk-group-heading]]:py-1.5 [&>[cmdk-group-heading]]:text-[11px] [&>[cmdk-group-heading]]:font-bold [&>[cmdk-group-heading]]:uppercase [&>[cmdk-group-heading]]:tracking-wider [&>[cmdk-group-heading]]:text-neutral-400">
                {hits.slice(0, 8).map((hit) => (
                  <Command.Item
                    key={`${hit.kind}-${hit.id}`}
                    value={`${hit.kind}-${hit.id}-${hit.title}`}
                    onSelect={() => navigate(hit.url)}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm data-[selected=true]:bg-neutral-100 dark:data-[selected=true]:bg-surface-dark"
                  >
                    {hit.kind === 'user' ? (
                      <Avatar src={hit.image} name={hit.title} size={26} />
                    ) : (
                      <SearchIcon className="h-4 w-4 text-neutral-400" aria-hidden />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{hit.title}</span>
                      <span className="block truncate text-xs text-neutral-400">{hit.subtitle}</span>
                    </span>
                    <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-neutral-300" aria-hidden />
                  </Command.Item>
                ))}
                <Command.Item
                  value="see-all-results"
                  onSelect={() => navigate(`/search?q=${encodeURIComponent(query)}`)}
                  className="flex cursor-pointer items-center justify-center rounded-lg px-2.5 py-2.5 text-sm font-semibold text-brand-600 data-[selected=true]:bg-neutral-100 dark:text-brand-400 dark:data-[selected=true]:bg-surface-dark"
                >
                  {t('common.viewAll')} — {query}
                </Command.Item>
              </Command.Group>
            ) : null}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}

export function ShortcutsDialog() {
  const { t } = useTranslation();
  const open = useUIStore((s) => s.shortcutsOpen);
  const setOpen = useUIStore((s) => s.setShortcutsOpen);
  if (!open) return null;
  const rows = [
    { keys: ['Ctrl', 'K'], label: t('shortcuts.palette') },
    { keys: ['N'], label: t('shortcuts.newPost') },
    { keys: ['G', 'H'], label: t('shortcuts.goHome') },
    { keys: ['G', 'P'], label: t('shortcuts.goProfile') },
    { keys: ['G', 'M'], label: t('shortcuts.goMessages') },
    { keys: ['G', 'N'], label: t('shortcuts.goNotifications') },
    { keys: ['G', 'S'], label: t('shortcuts.goSettings') },
    { keys: ['J', 'K'], label: t('shortcuts.navigate') },
    { keys: ['?'], label: t('shortcuts.help') },
    { keys: ['Esc'], label: t('shortcuts.escape') },
  ];
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={t('shortcuts.title')}>
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
      <div className="bsdc-animate-slide-up relative w-full max-w-md rounded-2xl border border-surface-light-border bg-white p-5 shadow-raised dark:border-surface-dark-border dark:bg-surface-dark-raised">
        <h2 className="mb-4 text-lg font-bold">{t('shortcuts.title')}</h2>
        <ul className="space-y-2.5">
          {rows.map((row) => (
            <li key={row.label} className="flex items-center justify-between gap-4 text-sm">
              <span className="text-neutral-600 dark:text-neutral-300">{row.label}</span>
              <span className="flex gap-1.5">
                {row.keys.map((k) => (
                  <kbd key={k} className="rounded-md border border-neutral-300 bg-neutral-50 px-2 py-1 text-xs font-bold text-neutral-600 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
