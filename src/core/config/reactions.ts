/**
 * BSDC — src/core/config/reactions.ts
 * Purpose : The ten BSDC reactions, their order, labels and sprite ids (PART 12.04).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Reactions are SVG glyphs (assets/icons/reactions), never emoji (LAW-01). The sprite
 *           id matches the generated assets/icons/sprite.svg symbol id, so the markup can render
 *           a reaction without shipping ten separate network requests.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */

/** The ten reaction identifiers. */
export const REACTIONS = [
  'like',
  'love',
  'care',
  'haha',
  'wow',
  'sad',
  'angry',
  'clap',
  'fire',
  'mindblown',
] as const;

export type ReactionType = (typeof REACTIONS)[number];

/** Presentation and copy for one reaction. */
export interface ReactionDefinition {
  readonly type: ReactionType;
  readonly labelBn: string;
  readonly labelEn: string;
  readonly spriteId: string;
  /** CSS custom-property suffix used by the reaction tint. */
  readonly tint: string;
  /** Weight used when summarising a post's reaction mix. */
  readonly weight: number;
}

/** The reaction registry. */
export const REACTION_DEFINITIONS: readonly ReactionDefinition[] = [
  {
    type: 'like',
    labelBn: 'পছন্দ',
    labelEn: 'Like',
    spriteId: 'reaction-like',
    tint: 'blue',
    weight: 1,
  },
  {
    type: 'love',
    labelBn: 'ভালোবাসা',
    labelEn: 'Love',
    spriteId: 'reaction-love',
    tint: 'rose',
    weight: 2,
  },
  {
    type: 'care',
    labelBn: 'সহমর্মিতা',
    labelEn: 'Care',
    spriteId: 'reaction-care',
    tint: 'amber',
    weight: 2,
  },
  {
    type: 'haha',
    labelBn: 'হাসি',
    labelEn: 'Haha',
    spriteId: 'reaction-haha',
    tint: 'yellow',
    weight: 1,
  },
  {
    type: 'wow',
    labelBn: 'অবাক',
    labelEn: 'Wow',
    spriteId: 'reaction-wow',
    tint: 'violet',
    weight: 1,
  },
  {
    type: 'sad',
    labelBn: 'দুঃখ',
    labelEn: 'Sad',
    spriteId: 'reaction-sad',
    tint: 'slate',
    weight: 1,
  },
  {
    type: 'angry',
    labelBn: 'রাগ',
    labelEn: 'Angry',
    spriteId: 'reaction-angry',
    tint: 'red',
    weight: 1,
  },
  {
    type: 'clap',
    labelBn: 'করতালি',
    labelEn: 'Clap',
    spriteId: 'reaction-clap',
    tint: 'green',
    weight: 2,
  },
  {
    type: 'fire',
    labelBn: 'দারুণ',
    labelEn: 'Fire',
    spriteId: 'reaction-fire',
    tint: 'orange',
    weight: 2,
  },
  {
    type: 'mindblown',
    labelBn: 'মাইন্ড ব্লোন',
    labelEn: 'Mind blown',
    spriteId: 'reaction-mindblown',
    tint: 'cyan',
    weight: 3,
  },
];

const REACTION_MAP: ReadonlyMap<ReactionType, ReactionDefinition> = new Map(
  REACTION_DEFINITIONS.map((definition) => [definition.type, definition]),
);

/** Used when an unknown reaction identifier arrives from an older client or a migration. */
const FALLBACK_REACTION: ReactionDefinition = {
  type: 'like',
  labelBn: 'পছন্দ',
  labelEn: 'Like',
  spriteId: 'reaction-like',
  tint: 'blue',
  weight: 1,
};

/**
 * Looks up a reaction definition.
 * @param type reaction identifier
 * @returns the definition, falling back to `like` for unknown input
 */
export function reactionDefinition(type: string): ReactionDefinition {
  return REACTION_MAP.get(type as ReactionType) ?? FALLBACK_REACTION;
}

/**
 * Reports whether a string is a known reaction identifier.
 * @param value candidate value
 * @returns true when the value is one of the ten reactions
 */
export function isReactionType(value: string): value is ReactionType {
  return REACTION_MAP.has(value as ReactionType);
}

/**
 * Sorts reaction counts for the summary row: highest weight first, then highest count.
 * @param counts map of reaction type to count
 * @returns ordered reaction types
 */
export function orderedReactionSummary(
  counts: Readonly<Record<string, number>>,
): readonly ReactionType[] {
  return REACTIONS.filter((type) => (counts[type] ?? 0) > 0).sort((a, b) => {
    const weightDelta = reactionDefinition(b).weight - reactionDefinition(a).weight;
    if (weightDelta !== 0) return weightDelta;
    return (counts[b] ?? 0) - (counts[a] ?? 0);
  });
}
