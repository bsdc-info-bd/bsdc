/**
 * BSDC — src/core/config/schemaTypes.ts
 * Purpose : Registry of the structured-data types BSDC emits (PART 10.07).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Builders land with the SEO master system in RESPONSE 5; this registry is the contract
 *           they implement, so a builder can never invent a type or forget one.
 *           No VideoObject for hosted media: BSDC hosts no video (PART 05.04). A VideoObject is
 *           emitted only for an external embed, with a real embedUrl and thumbnailUrl.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */

/** A schema.org type emitted by BSDC and the surface that owns it. */
export interface SchemaTypeEntry {
  readonly type: string;
  readonly surface: string;
  /** Whether a builder exists yet. */
  readonly implemented: boolean;
  readonly note?: string | undefined;
}

export const SCHEMA_TYPES: readonly SchemaTypeEntry[] = [
  { type: 'Organization', surface: 'site-wide', implemented: false },
  { type: 'WebSite', surface: 'site-wide', implemented: false },
  { type: 'WebPage', surface: 'every public route', implemented: false },
  { type: 'WebPageElement', surface: 'navigation', implemented: false },
  { type: 'SiteNavigationElement', surface: 'navigation', implemented: false },
  { type: 'BreadcrumbList', surface: 'content routes', implemented: false },
  { type: 'Person', surface: 'profiles, authors', implemented: false },
  { type: 'ProfilePage', surface: 'profiles', implemented: false },
  { type: 'Article', surface: 'posts', implemented: false },
  { type: 'BlogPosting', surface: 'blog posts', implemented: false },
  { type: 'TechArticle', surface: 'technical posts', implemented: false },
  { type: 'NewsArticle', surface: 'news', implemented: false },
  { type: 'Report', surface: 'reports', implemented: false },
  { type: 'DiscussionForumPosting', surface: 'social posts', implemented: false },
  { type: 'SocialMediaPosting', surface: 'social posts', implemented: false },
  { type: 'Comment', surface: 'comments', implemented: false },
  { type: 'Question', surface: 'questions', implemented: false },
  { type: 'Answer', surface: 'answers', implemented: false },
  { type: 'QAPage', surface: 'question pages', implemented: false },
  { type: 'HowTo', surface: 'tutorials', implemented: false },
  { type: 'SoftwareSourceCode', surface: 'code snippets', implemented: false },
  { type: 'SoftwareApplication', surface: 'projects, apps', implemented: false },
  { type: 'CodeRepository', surface: 'projects', implemented: false },
  { type: 'Dataset', surface: 'datasets', implemented: false },
  { type: 'Event', surface: 'events', implemented: false },
  { type: 'Place', surface: 'venues, stores', implemented: false },
  { type: 'GeoCoordinates', surface: 'locations', implemented: false },
  { type: 'LocalBusiness', surface: 'vendor stores', implemented: false },
  { type: 'JobPosting', surface: 'jobs', implemented: false },
  { type: 'Offer', surface: 'marketplace, plans', implemented: false },
  { type: 'OfferCatalog', surface: 'marketplace', implemented: false },
  { type: 'AggregateOffer', surface: 'marketplace', implemented: false },
  { type: 'Product', surface: 'marketplace', implemented: false },
  { type: 'Review', surface: 'reviews', implemented: false },
  { type: 'AggregateRating', surface: 'reviews', implemented: false },
  { type: 'Service', surface: 'freelancer gigs', implemented: false },
  { type: 'MonetaryAmount', surface: 'prices', implemented: false },
  { type: 'PriceSpecification', surface: 'prices', implemented: false },
  { type: 'FAQPage', surface: 'help, FAQ', implemented: false },
  { type: 'Brand', surface: 'brand page', implemented: false },
  { type: 'CreativeWork', surface: 'licences', implemented: false },
  { type: 'CreativeWorkSeries', surface: 'post series', implemented: false },
  { type: 'ImageObject', surface: 'galleries', implemented: false },
  { type: 'InteractionCounter', surface: 'counters', implemented: false },
  { type: 'ItemList', surface: 'trending, leaderboards', implemented: false },
  { type: 'Course', surface: 'learning paths', implemented: false },
  {
    type: 'EducationalOccupationalCredential',
    surface: 'creator program, licences',
    implemented: false,
  },
  { type: 'Speakable', surface: 'news, FAQ', implemented: false },
  { type: 'DefinedTerm', surface: 'technology entity pages', implemented: false },
  {
    type: 'VideoObject',
    surface: 'external embeds only',
    implemented: false,
    note: 'BSDC hosts no video. Emitted only for an external embed with a real embedUrl.',
  },
];

/** Types implemented so far. */
export function implementedSchemaTypes(): readonly string[] {
  return SCHEMA_TYPES.filter((entry) => entry.implemented).map((entry) => entry.type);
}
