/**
 * BSDC — scripts/build-rss.ts
 * Purpose : Writes the RSS 2.0 and Atom 1.0 feeds (PART 10.04).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Two formats because two audiences: RSS 2.0 is what most readers and aggregators expect,
 *   Atom 1.0 is what the ones that care about correctness expect. Both are generated from the same
 *   list so they can never disagree about what the community published.
 *   The feed carries Bangla and English titles side by side, with `xml:lang` on each, because a feed
 *   is a place where a Bengali reader and an English reader read the same community — collapsing them
 *   into one language would make it a different community for each.
 *   Item content comes from the public-content source. With no source, the feed contains the static
 *   pages and a channel that says what it is; it is never padded with invented entries.
 *   No Cloudflare Worker is involved (ADR-036): this is a build step producing static files.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BRAND, CONTACT, OWNERSHIP, SITE_URL } from '../src/core/config/app';
import {
  escapeXml,
  loadPublicContent,
  w3cDate,
  type PublicContentItem,
} from './lib/public-content';

/** How many items a feed carries. Enough to be useful, few enough to stay light. */
const ITEM_LIMIT = 50;

/** The feed's own identity. */
const CHANNEL = {
  title: `${BRAND.nameEn} — ${BRAND.taglineEn}`,
  titleBn: `${BRAND.nameBn} — ${BRAND.taglineBn}`,
  description:
    'The public feed of the Bangladesh Software Development Community: events, jobs, projects and writing from the community. A platform of RRC Development.',
  descriptionBn:
    'বাংলাদেশ সফটওয়্যার ডেভেলপমেন্ট কমিউনিটির পাবলিক ফিড: ইভেন্ট, চাকরি, প্রকল্প এবং কমিউনিটির লেখা।',
  language: 'bn-BD',
  copyright: `© ${new Date().getUTCFullYear()} ${BRAND.legalLine}`,
} as const;

/**
 * Renders the RSS 2.0 feed.
 * @param items the feed items
 * @param now the build instant
 * @returns the XML
 */
function rssXml(items: readonly PublicContentItem[], now: Date): string {
  const lastBuild = w3cDate(now.toISOString(), now);
  const entries = items
    .slice(0, ITEM_LIMIT)
    .map((item) => {
      const published = w3cDate(item.updatedAt, now);
      return (
        `  <item>\n` +
        `    <title>${escapeXml(item.titleBn.length > 0 ? item.titleBn : item.titleEn)}</title>\n` +
        `    <title xml:lang="en">${escapeXml(item.titleEn.length > 0 ? item.titleEn : item.titleBn)}</title>\n` +
        `    <link>${escapeXml(`${SITE_URL}${item.path}`)}</link>\n` +
        `    <guid isPermaLink="true">${escapeXml(`${SITE_URL}${item.path}`)}</guid>\n` +
        `    <pubDate>${published}</pubDate>\n` +
        `    <category>${escapeXml(item.kind)}</category>\n` +
        `  </item>`
      );
    })
    .join('\n');

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n` +
    `  <channel>\n` +
    `    <title>${escapeXml(CHANNEL.title)}</title>\n` +
    `    <title xml:lang="bn">${escapeXml(CHANNEL.titleBn)}</title>\n` +
    `    <link>${escapeXml(SITE_URL)}</link>\n` +
    `    <description>${escapeXml(CHANNEL.description)}</description>\n` +
    `    <description xml:lang="bn">${escapeXml(CHANNEL.descriptionBn)}</description>\n` +
    `    <language>${CHANNEL.language}</language>\n` +
    `    <lastBuildDate>${lastBuild}</lastBuildDate>\n` +
    `    <managingEditor>${escapeXml(CONTACT.general)}</managingEditor>\n` +
    `    <webMaster>${escapeXml(CONTACT.operations)}</webMaster>\n` +
    `    <generator>${escapeXml(`${BRAND.short} build pipeline — ${OWNERSHIP.organisation}`)}</generator>\n` +
    `    <copyright>${escapeXml(CHANNEL.copyright)}</copyright>\n` +
    `    <atom:link href="${escapeXml(`${SITE_URL}/feed.xml`)}" rel="self" type="application/rss+xml" />\n` +
    `${entries}\n` +
    `  </channel>\n` +
    `</rss>\n`
  );
}

/**
 * Renders the Atom 1.0 feed.
 * @param items the feed items
 * @param now the build instant
 * @returns the XML
 */
function atomXml(items: readonly PublicContentItem[], now: Date): string {
  const updated = w3cDate(now.toISOString(), now);
  const entries = items
    .slice(0, ITEM_LIMIT)
    .map((item) => {
      const published = w3cDate(item.updatedAt, now);
      return (
        `  <entry>\n` +
        `    <title xml:lang="bn">${escapeXml(item.titleBn.length > 0 ? item.titleBn : item.titleEn)}</title>\n` +
        `    <title xml:lang="en">${escapeXml(item.titleEn.length > 0 ? item.titleEn : item.titleBn)}</title>\n` +
        `    <link href="${escapeXml(`${SITE_URL}${item.path}`)}" rel="alternate" />\n` +
        `    <id>${escapeXml(`${SITE_URL}${item.path}`)}</id>\n` +
        `    <updated>${published}</updated>\n` +
        `    <category term="${escapeXml(item.kind)}" />\n` +
        `  </entry>`
      );
    })
    .join('\n');

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="bn">\n` +
    `  <title>${escapeXml(CHANNEL.titleBn)}</title>\n` +
    `  <subtitle>${escapeXml(CHANNEL.descriptionBn)}</subtitle>\n` +
    `  <link href="${escapeXml(`${SITE_URL}/feed.atom.xml`)}" rel="self" />\n` +
    `  <link href="${escapeXml(SITE_URL)}" rel="alternate" />\n` +
    `  <updated>${updated}</updated>\n` +
    `  <id>${escapeXml(SITE_URL)}</id>\n` +
    `  <rights>${escapeXml(CHANNEL.copyright)}</rights>\n` +
    `${entries}\n` +
    `</feed>\n`
  );
}

/** Writes both feeds. */
function main(): void {
  const now = new Date();
  const items = loadPublicContent();
  const out = resolve(process.cwd(), 'public');
  mkdirSync(out, { recursive: true });
  writeFileSync(resolve(out, 'feed.xml'), rssXml(items, now), 'utf8');
  writeFileSync(resolve(out, 'feed.atom.xml'), atomXml(items, now), 'utf8');
  console.info(
    `[bsdc] feeds written: ${Math.min(items.length, ITEM_LIMIT)} item(s) as RSS 2.0 and Atom 1.0`,
  );
}

main();
