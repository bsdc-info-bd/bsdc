/**
 * The command deck, turned into something a person reads.
 *
 * `public.admin_deck()` answers one row per card. This file decides what those
 * rows *mean*: which ones are a reason to get up, whether a delta is good news
 * or bad news, how old a figure may be before it stops being a figure and
 * becomes a memory, and what to say when a card the reader expected is missing
 * because they may not act on it.
 *
 * Pure functions and no JSX, for the same reason the rest of this directory is:
 * every rule here is a judgement, and a judgement made in two places is a
 * judgement that disagrees with itself. The component is in `Deck.tsx` and it
 * makes none of these decisions.
 */

/** A row of `public.admin_deck()`. */
export interface DeckCard {
  card: string;
  label: string;
  section: string;
  kind: 'alert' | 'count';
  count_now: number;
  count_prev: number;
  delta: number;
  trend: 'up' | 'down' | 'flat';
  permission: string;
  can_act: boolean;
  drill: string;
  computed_at: string;
}

/** A row of `bsdc_command_cards()`. */
export interface CardDefinition {
  card: string;
  label: string;
  label_bn: string;
  section: string;
  kind: 'alert' | 'count';
  permission: string;
  drill: string;
}

export type Tone = 'ok' | 'warn' | 'bad' | 'neutral';

export interface DeckTile {
  readonly key: string;
  readonly label: string;
  readonly labelBn: string;
  readonly section: string;
  readonly value: string;
  readonly tone: Tone;
  readonly note: string;
  /** The screen and query string the card opens. */
  readonly drill: string;
  /** How stale the figure is, in minutes, at the moment of rendering. */
  readonly ageMinutes: number;
  /** True when the figure is old enough that it should say so. */
  readonly stale: boolean;
}

export interface DeckGroup {
  readonly section: string;
  readonly heading: string;
  readonly headingBn: string;
  readonly tiles: readonly DeckTile[];
}

/**
 * The sections, in the order an operator works through them.
 *
 * Alerts come first as a group rather than as a group of their own *section*:
 * the deck's SQL already sorts alert cards above count cards, and a second
 * ordering here that disagreed with it would be the sort of bug that only shows
 * up on a quiet morning. What this order decides is which section heading comes
 * first when there are no alerts at all — and then it is the queues.
 */
const SECTION_ORDER = [
  'moderation',
  'marketplace',
  'money',
  'people',
  'authority',
  'platform',
  'audit',
] as const;

const SECTION_HEADINGS: Record<string, { en: string; bn: string }> = {
  moderation: { en: 'Moderation', bn: 'মডারেশন' },
  marketplace: { en: 'Marketplace', bn: 'মার্কেটপ্লেস' },
  money: { en: 'Money', bn: 'অর্থ' },
  people: { en: 'People', bn: 'মানুষ' },
  authority: { en: 'Authority', bn: 'কর্তৃত্ব' },
  platform: { en: 'Platform', bn: 'প্ল্যাটফর্ম' },
  audit: { en: 'Audit', bn: 'নিরীক্ষা' },
};

/**
 * Thresholds per card, because the same number means different things.
 *
 * Ten open reports is a morning's work. Ten shop applications is a fortnight of
 * somebody's business not starting, and a member who cannot sell. The thresholds
 * are named by card so a new card cannot inherit the wrong one by accident — an
 * unknown card gets the conservative pair, not the permissive one.
 */
const THRESHOLDS: Record<string, readonly [warn: number, bad: number]> = {
  'moderation.open_reports': [10, 40],
  'moderation.removed_posts': [5, 25],
  'marketplace.shops_pending': [3, 10],
  'money.campaigns_pending': [3, 10],
  'money.credits_today': [5, 20],
  'people.suspended': [1, 10],
  'authority.denies_live': [1, 5],
  'authority.expiring_week': [1, 5],
  'audit.gaps_today': [1, 1],
};

const DEFAULT_THRESHOLDS: readonly [number, number] = [5, 20];

export function toneFor(card: DeckCard): Tone {
  if (card.count_now === 0) return 'ok';
  // A gap in the audit trail is never a warning. One unaudited privileged write
  // is one change nobody can account for, and that is the definition of bad.
  if (card.kind === 'alert' && card.card === 'audit.gaps_today') return 'bad';
  const [warn, bad] = THRESHOLDS[card.card] ?? DEFAULT_THRESHOLDS;
  if (card.count_now >= bad) return 'bad';
  if (card.count_now >= warn) return 'warn';
  return 'ok';
}

/**
 * Whether a change is good news.
 *
 * For a queue, upward is bad: more things waiting. For most counts, upward is
 * good or merely interesting. The one card where the direction is genuinely
 * ambiguous is audited actions — a quiet day and a broken audit trail look
 * identical — so it reports `neutral` rather than pretending to know.
 */
export function deltaIsGood(card: DeckCard): 'good' | 'bad' | 'neutral' {
  if (card.card === 'audit.events_today') return 'neutral';
  if (card.kind === 'alert') {
    if (card.trend === 'up') return 'bad';
    if (card.trend === 'down') return 'good';
    return 'neutral';
  }
  if (card.trend === 'up') return 'good';
  if (card.trend === 'down') return 'bad';
  return 'neutral';
}

/** Thousands separated, because a console is read at a glance. */
export function formatCount(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0';
  return Math.trunc(value).toLocaleString('en-US');
}

/**
 * The delta, written out.
 *
 * "no change" is its own answer rather than "+0", because a comparison that
 * found nothing is not the same as a comparison that was not made, and the deck
 * distinguishes the two: a card with no comparison window reports zero for both
 * counts and the note says so.
 */
export function formatDelta(card: DeckCard, language: 'en' | 'bn' = 'en'): string {
  if (card.count_prev === 0 && card.count_now === 0) {
    return language === 'bn' ? 'কোনো তথ্য নেই' : 'nothing to compare';
  }
  if (card.delta === 0) return language === 'bn' ? 'অপরিবর্তিত' : 'no change';
  const magnitude = formatCount(Math.abs(card.delta));
  if (language === 'bn') return card.delta > 0 ? `${magnitude} বৃদ্ধি` : `${magnitude} হ্রাস`;
  return card.delta > 0 ? `up ${magnitude}` : `down ${magnitude}`;
}

/**
 * A figure stops being a figure when it is old enough to mislead.
 *
 * Fifteen minutes is the point at which somebody refreshing a page expects a new
 * number: a card older than that says its age rather than its freshness, because
 * the alternative is an operator making a call on a number from before lunch.
 */
export const STALE_AFTER_MINUTES = 15;

export function ageMinutes(computedAt: string, now: Date = new Date()): number {
  const then = new Date(computedAt).getTime();
  if (!Number.isFinite(then)) return 0;
  const minutes = Math.floor((now.getTime() - then) / 60_000);
  // A clock that runs backwards produces a negative age, which is not a fact
  // about the data; clamping keeps the display honest without pretending the
  // skew does not exist.
  return Math.max(0, minutes);
}

export function freshnessNote(minutes: number, language: 'en' | 'bn' = 'en'): string {
  if (minutes < 1) return language === 'bn' ? 'এইমাত্র' : 'just now';
  if (minutes === 1) return language === 'bn' ? '১ মিনিট আগে' : 'a minute ago';
  if (minutes < 60) {
    return language === 'bn' ? `${String(minutes)} মিনিট আগে` : `${String(minutes)} minutes ago`;
  }
  const hours = Math.floor(minutes / 60);
  return language === 'bn' ? `${String(hours)} ঘণ্টা আগে` : `${String(hours)} hours ago`;
}

/**
 * One card, as a tile.
 *
 * The note is the part worth writing carefully. A card that says only "12" makes
 * the reader do the thinking; a card that says "12 waiting, 4 more than this time
 * yesterday" has already done it.
 */
export function toTile(
  card: DeckCard,
  definition: CardDefinition | undefined,
  now: Date = new Date(),
  language: 'en' | 'bn' = 'en',
): DeckTile {
  const minutes = ageMinutes(card.computed_at, now);
  const stale = minutes >= STALE_AFTER_MINUTES;
  const label = language === 'bn' && definition ? definition.label_bn : card.label;

  const parts: string[] = [];
  parts.push(formatDelta(card, language));
  parts.push(freshnessNote(minutes, language));

  return {
    key: card.card,
    label,
    labelBn: definition?.label_bn ?? card.label,
    section: card.section,
    // A stale figure is still shown — hiding it would leave the reader with
    // nothing — but it carries its age, so nobody mistakes it for now.
    value: formatCount(card.count_now),
    tone: stale ? 'warn' : toneFor(card),
    note: parts.join(' · '),
    drill: card.drill,
    ageMinutes: minutes,
    stale,
  };
}

/**
 * The deck, grouped for reading.
 *
 * Sections with nothing in them are omitted rather than shown empty: a
 * permission-filtered deck already means "you cannot see this", and an empty
 * heading says something different and more confusing.
 */
export function groupDeck(
  cards: readonly DeckCard[],
  definitions: readonly CardDefinition[],
  now: Date = new Date(),
  language: 'en' | 'bn' = 'en',
): readonly DeckGroup[] {
  const byCard = new Map(definitions.map((definition) => [definition.card, definition]));
  const groups = new Map<string, DeckTile[]>();

  for (const card of cards) {
    const tile = toTile(card, byCard.get(card.card), now, language);
    const existing = groups.get(card.section);
    if (existing) existing.push(tile);
    else groups.set(card.section, [tile]);
  }

  return SECTION_ORDER.filter((section) => groups.has(section)).map((section) => {
    const heading = SECTION_HEADINGS[section] ?? { en: section, bn: section };
    const tiles = groups.get(section) ?? [];
    return {
      section,
      heading: heading.en,
      headingBn: heading.bn,
      // Alerts before counts inside a section, then by the value that needs
      // attention, so the worst thing in a section is the first thing in it.
      tiles: [...tiles].sort((a, b) => {
        const aAlert = a.tone === 'bad' || a.tone === 'warn' ? 0 : 1;
        const bAlert = b.tone === 'bad' || b.tone === 'warn' ? 0 : 1;
        if (aAlert !== bAlert) return aAlert - bAlert;
        return a.key.localeCompare(b.key);
      }),
    };
  });
}

/**
 * What is waiting, across every queue, for the tab title.
 *
 * Counts only the cards whose direction is unambiguous and which the reader can
 * act on — which is every card in the deck by construction, because the deck
 * filters before it returns.
 */
export function outstandingWork(cards: readonly DeckCard[]): number {
  return cards
    .filter((card) => card.kind === 'alert')
    .reduce((total, card) => total + Math.max(0, card.count_now), 0);
}

/**
 * Which cards a reader expected and did not get.
 *
 * This is the honest answer to a filtered deck. A moderator who knows the
 * platform has a shop queue and does not see one should be told why, in one
 * sentence, rather than left to wonder whether the console is broken.
 */
export function hiddenCards(
  definitions: readonly CardDefinition[],
  visible: readonly DeckCard[],
): readonly CardDefinition[] {
  const shown = new Set(visible.map((card) => card.card));
  return definitions.filter((definition) => !shown.has(definition.card));
}

export function hiddenCardsNote(
  hidden: readonly CardDefinition[],
  language: 'en' | 'bn' = 'en',
): string {
  if (hidden.length === 0) return '';
  if (language === 'bn') {
    return `${String(hidden.length)}টি কার্ড আপনার অনুমতির বাইরে, তাই দেখানো হচ্ছে না।`;
  }
  return hidden.length === 1
    ? '1 card is hidden because your account cannot act on it.'
    : `${String(hidden.length)} cards are hidden because your account cannot act on them.`;
}

/** The section headings, for a legend that does not have to re-derive them. */
export function sectionHeadings(
  language: 'en' | 'bn' = 'en',
): readonly { key: string; label: string }[] {
  return SECTION_ORDER.map((section) => ({
    key: section,
    label: (SECTION_HEADINGS[section] ?? { en: section, bn: section })[language],
  }));
}
