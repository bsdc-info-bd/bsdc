import { describe, expect, it } from 'vitest';
import {
  STALE_AFTER_MINUTES,
  ageMinutes,
  deltaIsGood,
  formatCount,
  formatDelta,
  freshnessNote,
  groupDeck,
  hiddenCards,
  hiddenCardsNote,
  outstandingWork,
  sectionHeadings,
  toTile,
  toneFor,
  type CardDefinition,
  type DeckCard,
} from './deck';

function card(over: Partial<DeckCard> = {}): DeckCard {
  return {
    card: 'moderation.open_reports',
    label: 'Open reports',
    section: 'moderation',
    kind: 'alert',
    count_now: 4,
    count_prev: 2,
    delta: 2,
    trend: 'up',
    permission: 'moderation.read',
    can_act: true,
    drill: 'reports?status=open',
    computed_at: new Date().toISOString(),
    ...over,
  };
}

const DEFINITIONS: CardDefinition[] = [
  {
    card: 'moderation.open_reports',
    label: 'Open reports',
    label_bn: 'খোলা রিপোর্ট',
    section: 'moderation',
    kind: 'alert',
    permission: 'moderation.read',
    drill: 'reports?status=open',
  },
  {
    card: 'marketplace.shops_pending',
    label: 'Shop applications waiting',
    label_bn: 'অপেক্ষমাণ দোকানের আবেদন',
    section: 'marketplace',
    kind: 'alert',
    permission: 'shop.review',
    drill: 'shops?status=submitted',
  },
  {
    card: 'people.total',
    label: 'Members',
    label_bn: 'সদস্য',
    section: 'people',
    kind: 'count',
    permission: 'people.read',
    drill: 'people',
  },
];

describe('toneFor', () => {
  it('says ok when nothing is waiting', () => {
    expect(toneFor(card({ count_now: 0 }))).toBe('ok');
  });

  it('warns at the per-card warning threshold, not a shared one', () => {
    // Ten reports is a warning; ten shops is already bad, because ten shops is
    // ten people's businesses not starting.
    expect(toneFor(card({ card: 'moderation.open_reports', count_now: 10 }))).toBe('warn');
    expect(toneFor(card({ card: 'marketplace.shops_pending', count_now: 10 }))).toBe('bad');
  });

  it('treats a single unaudited write as bad, never as a warning', () => {
    expect(toneFor(card({ card: 'audit.gaps_today', count_now: 1 }))).toBe('bad');
  });

  it('falls back to the conservative thresholds for a card nobody classified', () => {
    // A new card must not inherit a permissive pair by accident.
    expect(toneFor(card({ card: 'brand.new.card', count_now: 6 }))).toBe('warn');
  });
});

describe('deltaIsGood', () => {
  it('reads a rising queue as bad news', () => {
    expect(deltaIsGood(card({ kind: 'alert', trend: 'up' }))).toBe('bad');
    expect(deltaIsGood(card({ kind: 'alert', trend: 'down' }))).toBe('good');
  });

  it('reads a rising count as good news', () => {
    expect(deltaIsGood(card({ kind: 'count', trend: 'up' }))).toBe('good');
  });

  it('refuses to judge the audit trail, because a quiet day and a broken trail look alike', () => {
    expect(deltaIsGood(card({ card: 'audit.events_today', kind: 'count', trend: 'down' }))).toBe(
      'neutral',
    );
  });
});

describe('formatting', () => {
  it('separates thousands', () => {
    expect(formatCount(1234567)).toBe('1,234,567');
  });

  it('refuses to print a negative or non-finite count', () => {
    expect(formatCount(-3)).toBe('0');
    expect(formatCount(Number.NaN)).toBe('0');
  });

  it('says "nothing to compare" rather than "no change" when there is no window', () => {
    // The two are different facts and the console must not conflate them.
    expect(formatDelta(card({ count_now: 0, count_prev: 0, delta: 0, trend: 'flat' }))).toBe(
      'nothing to compare',
    );
    expect(formatDelta(card({ count_now: 5, count_prev: 5, delta: 0, trend: 'flat' }))).toBe(
      'no change',
    );
  });

  it('states a delta with its direction in words', () => {
    expect(formatDelta(card({ delta: 3, trend: 'up' }))).toBe('up 3');
    expect(formatDelta(card({ delta: -3, trend: 'down' }))).toBe('down 3');
  });

  it('speaks Bangla when asked', () => {
    expect(formatDelta(card({ delta: 3 }), 'bn')).toBe('৩ বৃদ্ধি'.replace('৩', '3'));
    expect(formatDelta(card({ delta: 0, count_now: 4, count_prev: 4 }), 'bn')).toBe('অপরিবর্তিত');
  });
});

describe('ageMinutes', () => {
  const now = new Date('2026-05-01T12:00:00Z');

  it('measures from the stated moment', () => {
    expect(ageMinutes('2026-05-01T11:45:00Z', now)).toBe(15);
  });

  it('clamps a future timestamp to zero rather than reporting a negative age', () => {
    expect(ageMinutes('2026-05-01T12:10:00Z', now)).toBe(0);
  });

  it('treats an unparseable timestamp as no age at all', () => {
    expect(ageMinutes('not a date', now)).toBe(0);
  });
});

describe('freshnessNote', () => {
  it('says just now for anything under a minute', () => {
    expect(freshnessNote(0)).toBe('just now');
  });

  it('counts minutes, then hours', () => {
    expect(freshnessNote(1)).toBe('a minute ago');
    expect(freshnessNote(20)).toBe('20 minutes ago');
    expect(freshnessNote(120)).toBe('2 hours ago');
  });
});

describe('toTile', () => {
  it('mounts the Bangla label when the console is in Bangla', () => {
    const tile = toTile(card(), DEFINITIONS[0]!, new Date(), 'bn');
    expect(tile.label).toBe('খোলা রিপোর্ট');
    expect(tile.labelBn).toBe('খোলা রিপোর্ট');
  });

  it('falls back to the row label when no definition was found', () => {
    const tile = toTile(card(), undefined);
    expect(tile.label).toBe('Open reports');
  });

  it('marks a figure stale once it is old enough to mislead, and says so', () => {
    const old = card({ computed_at: '2026-05-01T11:00:00Z' });
    const tile = toTile(old, DEFINITIONS[0]!, new Date('2026-05-01T12:00:00Z'));
    expect(tile.stale).toBe(true);
    expect(tile.ageMinutes).toBe(60);
    expect(tile.note).toContain('hours ago');
    // Still shown: hiding it would leave the reader with nothing.
    expect(tile.value).toBe('4');
    expect(tile.tone).toBe('warn');
  });

  it('does not mark a fresh figure stale', () => {
    const tile = toTile(
      card({ computed_at: '2026-05-01T11:59:00Z' }),
      DEFINITIONS[0]!,
      new Date('2026-05-01T12:00:00Z'),
    );
    expect(tile.stale).toBe(false);
    expect(tile.ageMinutes).toBeLessThan(STALE_AFTER_MINUTES);
  });

  it('carries the drill-down, so the card is a door and not a picture', () => {
    expect(toTile(card(), DEFINITIONS[0]!).drill).toBe('reports?status=open');
  });
});

describe('groupDeck', () => {
  it('groups by section and omits empty sections entirely', () => {
    const groups = groupDeck([card()], DEFINITIONS);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.section).toBe('moderation');
  });

  it('orders sections by how an operator works, not alphabetically', () => {
    const groups = groupDeck(
      [
        card({ card: 'people.total', section: 'people', kind: 'count', count_now: 900 }),
        card({
          card: 'marketplace.shops_pending',
          section: 'marketplace',
          kind: 'alert',
          count_now: 0,
        }),
      ],
      DEFINITIONS,
    );
    expect(groups.map((group) => group.section)).toEqual(['marketplace', 'people']);
  });

  it('puts the worst thing in a section first', () => {
    const groups = groupDeck(
      [
        card({ card: 'people.total', section: 'moderation', kind: 'count', count_now: 1 }),
        card({
          card: 'moderation.open_reports',
          section: 'moderation',
          kind: 'alert',
          count_now: 50,
        }),
      ],
      DEFINITIONS,
    );
    expect(groups[0]!.tiles[0]!.key).toBe('moderation.open_reports');
  });

  it('gives every group a heading in both languages', () => {
    const groups = groupDeck([card()], DEFINITIONS);
    expect(groups[0]!.heading).toBe('Moderation');
    expect(groups[0]!.headingBn).toBe('মডারেশন');
  });
});

describe('outstandingWork', () => {
  it('adds up the alert cards only', () => {
    const total = outstandingWork([
      card({ kind: 'alert', count_now: 4 }),
      card({ card: 'marketplace.shops_pending', kind: 'alert', count_now: 3 }),
      card({ card: 'people.total', kind: 'count', count_now: 900 }),
    ]);
    expect(total).toBe(7);
  });

  it('never goes negative because one card reported something odd', () => {
    expect(outstandingWork([card({ kind: 'alert', count_now: -5 })])).toBe(0);
  });
});

describe('hiddenCards', () => {
  it('names what the reader expected and did not get', () => {
    const hidden = hiddenCards(DEFINITIONS, [card()]);
    expect(hidden.map((definition) => definition.card)).toEqual([
      'marketplace.shops_pending',
      'people.total',
    ]);
  });

  it('explains a filtered deck in one sentence rather than leaving a gap', () => {
    const hidden = hiddenCards(DEFINITIONS, [card()]);
    expect(hiddenCardsNote(hidden)).toBe(
      '2 cards are hidden because your account cannot act on them.',
    );
  });

  it('says nothing when nothing is hidden', () => {
    expect(hiddenCardsNote([])).toBe('');
  });

  it('says it in the singular when exactly one is hidden', () => {
    // Everything visible except the last card, so exactly one is hidden.
    const visible = DEFINITIONS.slice(0, 2).map((definition) =>
      card({ card: definition.card, section: definition.section, kind: definition.kind }),
    );
    const hidden = hiddenCards(DEFINITIONS, visible);
    expect(hidden).toHaveLength(1);
    expect(hiddenCardsNote(hidden)).toBe('1 card is hidden because your account cannot act on it.');
  });
});

describe('sectionHeadings', () => {
  it('offers the legend in both languages', () => {
    const en = sectionHeadings('en');
    const bn = sectionHeadings('bn');
    expect(en[0]!.key).toBe('moderation');
    expect(bn[0]!.label).toBe('মডারেশন');
    expect(en).toHaveLength(bn.length);
  });
});
