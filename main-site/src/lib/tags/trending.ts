/**
 * The tags worth showing, and what to call them.
 *
 * A tag cloud is the cheapest useful thing on a developer feed and the easiest
 * thing to get wrong: ordered by nothing it is noise, ordered by an absolute
 * count it is permanently the same five tags, and rendered without a filter it
 * shows tags that were typed once by accident.
 *
 * The ranking below is the one a reader recognises from dev.to: a count, boosted
 * while the tag is actually being used, and floored so a tag nobody has touched
 * in a year does not sit at the top forever because it was popular once. It is
 * pure arithmetic, tested without a network, so the ordering cannot drift between
 * the rail, the tag page and the search suggestions.
 */

/** A row of the tag ranking query. */
export interface TagRow {
  slug: string;
  label_en: string;
  label_bn: string;
  posts_count: number;
  /** When the newest post carrying the tag was published, when the query knows. */
  last_used?: string | null;
}

/** What the interface draws. */
export interface TrendingTag {
  readonly slug: string;
  /** The label in the reader's language, falling back to the canonical one. */
  readonly label: string;
  readonly posts: number;
  /** A bar this tag's popularity can be drawn as, from 0 to 1. */
  readonly weight: number;
  readonly fresh: boolean;
}

/**
 * How much being used this week is worth against total history.
 *
 * Two: a tag with half the posts of another but live activity still outranks it,
 * which is what "trending" is supposed to mean. Any higher and a single new post
 * on a dead tag would send it to the top, which is a game anybody can play.
 */
const FRESHNESS_BOOST = 2;

/** A tag used after this instant counts as live. */
const FRESH_WINDOW_MS = 7 * 86_400_000;

/** How many tags the rail asks the database for. */
export const TRENDING_LIMIT = 5;

/** The label in the reader's language, with the canonical label as the fallback. */
export function tagLabel(row: TagRow, language: 'bn' | 'en'): string {
  const bn = row.label_bn.trim();
  const en = row.label_en.trim();
  if (language === 'bn' && bn.length > 0) return bn;
  if (en.length > 0) return en;
  if (bn.length > 0) return bn;
  return row.slug;
}

/**
 * Rank and weight a set of tags.
 *
 * `now` is injected so a test can move the clock and so the caller decides what
 * "now" means — a server-rendered and a client-rendered list must not disagree
 * because two clocks differ by a second.
 */
export function rankTags(
  rows: readonly TagRow[],
  language: 'bn' | 'en',
  limit = TRENDING_LIMIT,
  now = Date.now(),
): readonly TrendingTag[] {
  const scored = rows
    .filter((row) => row.slug.trim().length > 0 && row.posts_count > 0)
    .map((row) => {
      const used = typeof row.last_used === 'string' ? Date.parse(row.last_used) : Number.NaN;
      const fresh = !Number.isNaN(used) && now - used <= FRESH_WINDOW_MS;
      return { row, fresh, score: row.posts_count * (fresh ? FRESHNESS_BOOST : 1) };
    })
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      // A tie is broken by the name, so the order is stable between two renders
      // — an unpredictable list is one a reader notices reordering itself.
      return left.row.slug.localeCompare(right.row.slug);
    })
    .slice(0, Math.max(0, limit));

  const highest = scored[0]?.score ?? 0;
  return scored.map(({ row, fresh, score }) => ({
    slug: row.slug,
    label: tagLabel(row, language),
    posts: row.posts_count,
    weight: highest === 0 ? 0 : Math.round((score / highest) * 100) / 100,
    fresh,
  }));
}

/**
 * The query that feeds the rail.
 *
 * Written here rather than inline so the tag page and the rail cannot ask for
 * different things — a rail that ranks by one number while the page it links to
 * ranks by another is a rail whose links look wrong when they arrive.
 */
export const TRENDING_QUERY =
  'tags?select=slug,label_en,label_bn,posts_count' +
  `&posts_count=gt.0&order=posts_count.desc&limit=${String(TRENDING_LIMIT * 3)}`;

/**
 * A tag rendered as the address it lives at.
 *
 * Postgres lower-cases and hyphenates a tag before it stores it, so a label with
 * a space in it is not a slug. Encoding here keeps a Bengali label with no ASCII
 * characters from producing an empty path.
 */
export function tagPath(slug: string): string {
  const trimmed = slug.trim().toLowerCase();
  if (trimmed.length === 0) return '/tag';
  return `/tag/${encodeURIComponent(trimmed)}`;
}
