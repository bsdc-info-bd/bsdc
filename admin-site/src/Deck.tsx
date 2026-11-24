import { useCallback, useMemo, useState, type ReactElement } from 'react';
import {
  Banner,
  Button,
  Card,
  DataTable,
  Empty,
  Loading,
  listRpc,
  useAsync,
  useCorporateEnv,
  useToast,
  type Column,
} from '@kit';
import {
  STALE_AFTER_MINUTES,
  formatCount,
  groupDeck,
  hiddenCards,
  hiddenCardsNote,
  outstandingWork,
  toTile,
  type CardDefinition,
  type DeckCard,
  type DeckTile,
} from './deck';

/**
 * The command deck.
 *
 * A card is a door. Every tile here opens the screen that returns the rows it
 * counts, which is what makes a number on this page a claim somebody can check
 * rather than a figure somebody typed into a dashboard once.
 *
 * Four things this component deliberately does not decide, because `deck.ts`
 * decides them and is tested: what a tone means, whether a delta is good news,
 * when a figure is too old to trust, and what is hidden from this reader. The
 * component lays out; it does not judge.
 */
export function Deck(): ReactElement {
  const env = useCorporateEnv();
  const { note, error: toastError } = useToast();
  const [language, setLanguage] = useState<'en' | 'bn'>('en');

  const load = useCallback(async () => {
    // Two reads, one round trip of the browser: the deck is the numbers and the
    // catalogue is the labels, and a deck without labels is a column of dotted
    // identifiers. The catalogue is allowed to fail on its own — a console with
    // English labels is better than a console with no numbers.
    const [cards, definitions] = await Promise.all([
      listRpc<DeckCard>(env, 'admin_deck'),
      listRpc<CardDefinition>(env, 'bsdc_command_cards').catch(() => [] as CardDefinition[]),
    ]);
    return { cards, definitions };
  }, [env]);

  const { state, reload } = useAsync(load, [env]);

  const now = useMemo(() => new Date(), [state]);

  if (state.status === 'loading') return <Loading label="Reading the platform's state." />;
  if (state.status === 'error') {
    return (
      <Banner tone="bad" title="The command deck did not load">
        <p className="kit-small">{state.message}</p>
        <Button size="small" variant="quiet" onClick={reload}>
          Try again
        </Button>
      </Banner>
    );
  }

  const { cards, definitions } = state.data;
  const groups = groupDeck(cards, definitions, now, language);
  const hidden = hiddenCards(definitions, cards);
  const waiting = outstandingWork(cards);

  if (cards.length === 0) {
    return (
      <Empty>
        <strong>Nothing here is yours to act on.</strong> Your account holds no permission that any
        card on this deck needs. That is a deliberate state, not a fault: ask an owner for a grant if
        you expected a queue.
      </Empty>
    );
  }

  return (
    <div className="kit-stack">
      <Banner
        tone={waiting === 0 ? 'ok' : waiting > 20 ? 'bad' : 'warn'}
        title={
          waiting === 0
            ? 'Every queue you can see is clear'
            : `${formatCount(waiting)} waiting on a decision`
        }
      >
        <p className="kit-small">
          {waiting === 0
            ? 'Nothing in your queues needs a person right now. The figures below still state their own age.'
            : 'Each row opens the records behind it. A card only appears here if your account could act on what it counts.'}
        </p>
        <div className="kit-row">
          <Button size="small" variant="quiet" onClick={reload}>
            Read again
          </Button>
          <Button
            size="small"
            variant="quiet"
            onClick={() => {
              const next = language === 'en' ? 'bn' : 'en';
              setLanguage(next);
              note(next === 'bn' ? 'ভাষা বদলানো হয়েছে: বাংলা' : 'Language changed: English');
            }}
          >
            {language === 'en' ? 'বাংলায় দেখুন' : 'View in English'}
          </Button>
        </div>
      </Banner>

      {hidden.length > 0 && (
        <Banner tone="neutral" title="Some cards are not shown">
          <p className="kit-small">{hiddenCardsNote(hidden, language)}</p>
        </Banner>
      )}

      {groups.map((group) => (
        <Card
          key={group.section}
          title={language === 'bn' ? group.headingBn : group.heading}
          description={
            language === 'bn'
              ? `${String(group.tiles.length)}টি সূচক — প্রতিটি তার নিজের বয়স বলে`
              : `${String(group.tiles.length)} measure${group.tiles.length === 1 ? '' : 's'}, each stating its own age`
          }
        >
          <DataTable<DeckTile>
            caption={
              language === 'bn' ? `${group.headingBn} সূচক` : `${group.heading} measures`
            }
            columns={columnsFor(language)}
            rows={group.tiles}
            rowKey={(tile) => tile.key}
            state={{ status: 'ready' }}
            initialSort={{ key: 'value', descending: true }}
            onRowClick={(tile) => {
              if (!tile.drill) {
                toastError(
                  language === 'bn'
                    ? 'এই সূচকের পিছনে কোনো পর্দা নেই।'
                    : 'This card has no screen behind it yet.',
                );
                return;
              }
              const screen = tile.drill.split('?')[0] ?? '';
              window.location.hash = `#/${tile.drill}`;
              note(language === 'bn' ? `${screen} খোলা হচ্ছে…` : `Opening ${screen}…`);
            }}
          />
        </Card>
      ))}
    </div>
  );
}

/**
 * The columns, which are the same in both languages except for their headings.
 *
 * Tone is a column rather than a colour alone, so the reading survives a
 * monochrome screen and does not depend on a palette.
 */
function columnsFor(language: 'en' | 'bn'): readonly Column<DeckTile>[] {
  const bn = language === 'bn';
  return [
    {
      key: 'label',
      header: bn ? 'সূচক' : 'Measure',
      render: (tile) => tile.label,
      sortValue: (tile) => tile.label,
    },
    {
      key: 'value',
      header: bn ? 'সংখ্যা' : 'Count',
      render: (tile) => tile.value,
      sortValue: (tile) => Number(tile.value.replace(/,/g, '')),
      align: 'end',
    },
    {
      key: 'note',
      header: bn ? 'গতিমুখ ও বয়স' : 'Direction and age',
      render: (tile) => tile.note,
    },
    {
      key: 'tone',
      header: bn ? 'অবস্থা' : 'State',
      render: (tile) =>
        tile.stale
          ? bn
            ? 'পুরোনো'
            : `Stale (>${String(STALE_AFTER_MINUTES)}m)`
          : toneWord(tile.tone, bn),
      sortValue: (tile) => toneRank(tile.tone),
    },
  ];
}

function toneRank(tone: DeckTile['tone']): number {
  return { bad: 0, warn: 1, neutral: 2, ok: 3 }[tone];
}

function toneWord(tone: DeckTile['tone'], bn: boolean): string {
  if (bn) {
    return { ok: 'ঠিক আছে', warn: 'লক্ষ্য করুন', bad: 'জরুরি', neutral: 'তথ্য' }[tone];
  }
  return { ok: 'clear', warn: 'watch', bad: 'urgent', neutral: 'context' }[tone];
}

/**
 * The deck's own summary, for a shell that wants the count without the cards.
 *
 * Deliberately the same call and the same arithmetic as the deck body: a tab
 * title that counts differently from the page it names is a bug that is only
 * visible at 3 a.m.
 */
export function useDeckSummary(): {
  waiting: number;
  cards: readonly DeckCard[];
  reload: () => void;
} {
  const env = useCorporateEnv();
  const load = useCallback(() => listRpc<DeckCard>(env, 'admin_deck'), [env]);
  const { state, reload } = useAsync(load, [env]);
  const cards = state.status === 'ready' ? state.data : [];
  const waiting = useMemo(() => outstandingWork(cards), [cards]);
  return { waiting, cards, reload };
}

/** A single card rendered on its own, for a screen that wants one figure. */
export function DeckTileCard({
  card,
  definition,
  language = 'en',
}: {
  card: DeckCard;
  definition?: CardDefinition | undefined;
  language?: 'en' | 'bn';
}): ReactElement {
  const { note } = useToast();
  const tile = toTile(card, definition, new Date(), language);
  return (
    <Card
      title={tile.label}
      description={tile.note}
      actions={
        <Button
          size="small"
          variant="quiet"
          onClick={() => {
            if (!tile.drill) {
              note(language === 'bn' ? 'কোনো পর্দা নেই।' : 'No screen behind this card yet.');
              return;
            }
            window.location.hash = `#/${tile.drill}`;
          }}
        >
          {language === 'bn' ? 'দেখুন' : 'Open'}
        </Button>
      }
    >
      <p className={`kit-kpi kit-kpi-${tile.tone}`}>{tile.value}</p>
    </Card>
  );
}
