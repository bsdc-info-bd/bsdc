/**
 * BSDC — src/features/saved/SavedList.tsx
 * Purpose : The bookmark list: filter by kind, search by title, open it, or let it go.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The list is virtualised past 100 rows (PART 04 LAW-20) because a saved list is exactly
 *   the kind of thing that quietly grows to five hundred rows and then janks on a low-end Android.
 *   Every row shows what the thing is, who made it and when it was saved, and every row is a real
 *   link — a bookmark you can only look at is not a bookmark.
 *   The stored title is shown in the language its author wrote it in (`titleLang`), so a Bangla
 *   post never appears under English typography rules.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Badge,
  Button,
  Chip,
  EmptyState,
  FeedSkeleton,
  IconButton,
  Input,
  VirtualList,
} from '@/shared/ui';
import { fromNow } from '@/shared/lib/date';
import type { Locale } from '@/core/config/app';
import { SAVED_KINDS, type SavedItem, type SavedKind } from '@/entities/saved/model';
import type { UseSavedItemsResult } from './useSavedItems';

/** Row height of the virtualised list, in CSS pixels. */
const ROW_HEIGHT = 92;

/** Above this many rows the list is windowed rather than painted whole. */
const VIRTUALISE_ABOVE = 100;

/** Props for the saved list. */
export interface SavedListProps {
  readonly uid: string | null;
  readonly locale: Locale;
  readonly saved: UseSavedItemsResult;
}

/**
 * Renders the bookmark list with its filters.
 * @param props component props
 * @returns the list element
 */
export function SavedList({ locale, saved }: SavedListProps): React.ReactElement {
  const { t } = useTranslation('saved');
  const [kind, setKind] = useState<SavedKind | 'all'>('all');
  const [query, setQuery] = useState('');
  const lang = locale === 'bn' ? 'bn' : 'en';

  const counts = useMemo(() => {
    const map = new Map<SavedKind, number>();
    for (const row of saved.items) map.set(row.kind, (map.get(row.kind) ?? 0) + 1);
    return map;
  }, [saved.items]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(locale === 'bn' ? 'bn-BD' : 'en-GB');
    return saved.items.filter((row) => {
      if (kind !== 'all' && row.kind !== kind) return false;
      if (needle.length === 0) return true;
      return (
        row.title.toLocaleLowerCase(locale === 'bn' ? 'bn-BD' : 'en-GB').includes(needle) ||
        row.subtitle.toLocaleLowerCase(locale === 'bn' ? 'bn-BD' : 'en-GB').includes(needle)
      );
    });
  }, [saved.items, kind, query, locale]);

  if (saved.loading) {
    return (
      <div className="bsdc-saved__loading" aria-busy="true">
        <FeedSkeleton count={3} />
      </div>
    );
  }

  if (saved.items.length === 0) {
    return (
      <EmptyState
        illustration="empty-state"
        title={t('emptyTitle')}
        description={t('emptyBody')}
        action={
          <Button type="button" variant="secondary" size="sm" href="/feed">
            {t('emptyAction')}
          </Button>
        }
      />
    );
  }

  return (
    <div className="bsdc-saved">
      <div className="bsdc-saved__filters">
        <div className="bsdc-saved__chips" role="group" aria-label={t('filterLabel')}>
          <Chip selected={kind === 'all'} onToggle={() => setKind('all')}>
            {t('kind.all')}
            <span className="bsdc-saved__count">{saved.items.length}</span>
          </Chip>
          {SAVED_KINDS.map((option) => (
            <Chip
              key={option}
              selected={kind === option}
              onToggle={() => setKind(option)}
              disabled={(counts.get(option) ?? 0) === 0}
            >
              {t(`kind.${option}`)}
              <span className="bsdc-saved__count">{counts.get(option) ?? 0}</span>
            </Chip>
          ))}
        </div>
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          label={t('searchLabel')}
          placeholder={t('searchPlaceholder')}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          illustration="empty-state"
          title={t('noMatchTitle')}
          description={t('noMatchBody')}
          action={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setKind('all');
                setQuery('');
              }}
            >
              {t('clearFilters')}
            </Button>
          }
        />
      ) : filtered.length > VIRTUALISE_ABOVE ? (
        <VirtualList
          className="bsdc-saved__list"
          items={filtered}
          itemHeight={ROW_HEIGHT}
          height={Math.min(filtered.length * ROW_HEIGHT, 640)}
          label={t('listLabel')}
          renderItem={(row) => <SavedRow key={row.id} row={row} locale={locale} saved={saved} />}
        />
      ) : (
        <ul className="bsdc-saved__list" aria-label={t('listLabel')}>
          {filtered.map((row) => (
            <li key={row.id}>
              <SavedRow row={row} locale={locale} saved={saved} />
            </li>
          ))}
        </ul>
      )}

      <p className="bsdc-saved__note" lang={lang}>
        {t('sourceNote', {
          source: saved.source === 'remote' ? t('sourceServer') : t('sourceDevice'),
        })}
      </p>
    </div>
  );
}

/** Props for one row. */
interface SavedRowProps {
  readonly row: SavedItem;
  readonly locale: Locale;
  readonly saved: UseSavedItemsResult;
}

/**
 * Renders one bookmark.
 * @param props component props
 * @returns the row element
 */
function SavedRow({ row, locale, saved }: SavedRowProps): React.ReactElement {
  const { t } = useTranslation('saved');
  const lang = row.titleLang === 'bn' ? 'bn' : 'en';

  return (
    <div className="bsdc-saved__row">
      <Badge tone="neutral" variant="outline" className="bsdc-saved__kind">
        {t(`kind.${row.kind}`)}
      </Badge>
      <div className="bsdc-saved__body">
        <a className="bsdc-saved__title" href={row.href} lang={lang}>
          {row.title}
        </a>
        <span className="bsdc-saved__meta" lang={locale === 'bn' ? 'bn' : 'en'}>
          {row.subtitle.length > 0 ? `${row.subtitle} · ` : ''}
          {fromNow(row.savedAt, locale)}
        </span>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        href={row.href}
        className="bsdc-saved__open"
        iconRight="externalLink"
      >
        {t('open')}
      </Button>
      <IconButton
        icon="close"
        label={t('remove')}
        variant="ghost"
        size="sm"
        onClick={() =>
          void saved.toggle({
            kind: row.kind,
            entityId: row.entityId,
            title: row.title,
            titleLang: row.titleLang,
            subtitle: row.subtitle,
            href: row.href,
          })
        }
      />
    </div>
  );
}
