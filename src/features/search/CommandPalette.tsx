/**
 * BSDC — src/features/search/CommandPalette.tsx
 * Purpose : The command palette: one keystroke to anywhere, and one place to search from.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The palette opens with Ctrl/Cmd+K from anywhere and is the fastest route to every
 *   surface on the platform. It shows navigation before it shows results, because most of the time
 *   a person reaching for the keyboard wants to go somewhere, not to search.
 *   Staff-only commands are filtered here for convenience only; the route guard and the rules are
 *   what actually refuse a visitor who types their way to the moderation queue.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import { PALETTE_COMMANDS } from '@/core/config/search';
import type { Locale } from '@/core/config/app';
import { Avatar, Icon, Kbd, Spinner } from '@/shared/ui';
import { useSearch } from './useSearch';
import { readRecentSearches, rememberSearch } from './recentSearches';

/** Props for the command palette. */
export interface CommandPaletteProps {
  readonly locale: Locale;
  /** True when the viewer holds staff claims. Used to show staff-only destinations. */
  readonly isStaff: boolean;
  /** Called after a destination is chosen, so the host can close the dialog. */
  readonly onNavigate: () => void;
}

/**
 * Renders the command palette: navigation commands, recent searches and live results.
 * @param props component props
 * @returns the palette element
 */
export function CommandPalette({
  locale,
  isStaff,
  onNavigate,
}: CommandPaletteProps): React.ReactElement {
  const { t } = useTranslation('search');
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [recents, setRecents] = useState<readonly string[]>(() => readRecentSearches());
  const { result, loading } = useSearch(query, [], { limit: 5 });

  const commands = useMemo(
    () => PALETTE_COMMANDS.filter((command) => command.staffOnly !== true || isStaff),
    [isStaff],
  );

  const go = (path: string, remembered: string): void => {
    if (remembered.trim().length > 0) setRecents(rememberSearch(remembered));
    void navigate(path);
    onNavigate();
  };

  const hasQuery = query.trim().length > 1;

  return (
    <Command label={t('palette.label')} className="bsdc-palette" shouldFilter={false} loop>
      <div className="bsdc-palette__head">
        <Icon name="search" size={18} />
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder={t('palette.hint')}
          className="bsdc-palette__input"
        />
        {loading ? <Spinner size={16} /> : null}
        <span className="bsdc-palette__shortcut">
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
        </span>
      </div>

      <Command.List className="bsdc-palette__list">
        <Command.Empty className="bsdc-palette__empty" lang={locale === 'bn' ? 'bn' : 'en'}>
          {t('noResults.title')}
        </Command.Empty>

        {!hasQuery && recents.length > 0 ? (
          <Command.Group heading={t('palette.recent')} className="bsdc-palette__group">
            {recents.map((entry) => (
              <Command.Item
                key={entry}
                value={`recent-${entry}`}
                onSelect={() => setQuery(entry)}
                className="bsdc-palette__item"
              >
                <Icon name="clock" size={16} />
                <span lang={locale === 'bn' ? 'bn' : 'en'}>{entry}</span>
              </Command.Item>
            ))}
          </Command.Group>
        ) : null}

        {!hasQuery ? (
          <Command.Group heading={t('palette.goTo')} className="bsdc-palette__group">
            {commands.map((command) => (
              <Command.Item
                key={command.id}
                value={`goto-${command.id}`}
                onSelect={() => go(command.path, '')}
                className="bsdc-palette__item"
              >
                <Icon name="arrowRight" size={16} />
                <span lang={locale === 'bn' ? 'bn' : 'en'}>{t(command.labelKey)}</span>
              </Command.Item>
            ))}
          </Command.Group>
        ) : null}

        {hasQuery
          ? result.groups.map((group) => (
              <Command.Group
                key={group.kind}
                heading={t(`kind.${group.kind}`)}
                className="bsdc-palette__group"
              >
                {group.hits.map((hit) => (
                  <Command.Item
                    key={`${hit.doc.kind}:${hit.doc.id}`}
                    value={`hit-${hit.doc.kind}-${hit.doc.id}`}
                    onSelect={() => go(hit.doc.path, query)}
                    className="bsdc-palette__item"
                  >
                    <Avatar name={hit.doc.title} size="sm" decorative />
                    <span lang={locale === 'bn' ? 'bn' : 'en'}>{hit.doc.title}</span>
                    {hit.doc.subtitle.length > 0 ? (
                      <span className="bsdc-palette__itemHint" lang={locale === 'bn' ? 'bn' : 'en'}>
                        {hit.doc.subtitle}
                      </span>
                    ) : null}
                  </Command.Item>
                ))}
              </Command.Group>
            ))
          : null}

        {hasQuery ? (
          <Command.Item
            value="see-all-results"
            onSelect={() => go(`/search?q=${encodeURIComponent(query.trim())}`, query)}
            className="bsdc-palette__item bsdc-palette__item--all"
          >
            <Icon name="search" size={16} />
            <span lang={locale === 'bn' ? 'bn' : 'en'}>{t('palette.seeAll')}</span>
          </Command.Item>
        ) : null}
      </Command.List>
    </Command>
  );
}
