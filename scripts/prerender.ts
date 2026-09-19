/**
 * BSDC — scripts/prerender.ts
 * Purpose : Writes a static, self-describing HTML document for every public route (PART 10.02).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The application is a single-page app, which is a problem for anything that reads HTML
 *   without running it. Every public route therefore also exists as a static document carrying the
 *   real title, description, canonical, hreflang pair, Open Graph tags, Twitter card and JSON-LD —
 *   assembled here from the route table, which is the same source the router uses (ADR-005), so the
 *   tags cannot drift from the pages.
 *   This is not a headless-browser render: it is the document shell with the head filled in for the
 *   route, which is what a crawler needs and all that a crawler reliably uses. The body still boots
 *   the app, so a person arriving at the URL gets the real application, not a snapshot.
 *   Routes marked `noindex` are skipped entirely: writing a static file for a private screen is how
 *   private screens end up in a search index.
 *   No Cloudflare Worker is involved at any point (ADR-036). This is a build step, and Cloudflare
 *   Pages serves the files it writes.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { ROUTES } from '../src/core/config/routes';
import { BRAND, CONTACT, NETWORK_SITES, OWNERSHIP, SITE_URL } from '../src/core/config/app';
import { escapeXml } from './lib/public-content';
import { localePath } from '../src/shared/lib/url';

/** Where the built application lives. */
const DIST = resolve(process.cwd(), 'dist');

/** Optional per-route copy, keyed by path. Absent entries fall back to the brand tagline. */
const META_FILE = resolve(process.cwd(), 'build/page-meta.json');

/** Copy overrides for a route. */
interface PageMeta {
  readonly descriptionEn?: string | undefined;
  readonly descriptionBn?: string | undefined;
}

/** Loaded overrides, if the file exists. */
const overrides: Readonly<Record<string, PageMeta>> = (() => {
  if (!existsSync(META_FILE)) return {};
  const parsed: unknown = JSON.parse(readFileSync(META_FILE, 'utf8'));
  return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, PageMeta>) : {};
})();

/** Navigation labels, used for the page title in each language. */
const navLabels: Readonly<Record<'bn' | 'en', Readonly<Record<string, string>>>> = {
  bn: JSON.parse(readFileSync(resolve(process.cwd(), 'public/locales/bn/nav.json'), 'utf8')),
  en: JSON.parse(readFileSync(resolve(process.cwd(), 'public/locales/en/nav.json'), 'utf8')),
};

/**
 * Resolves the title of a route in one language.
 * @param titleKey the key under the nav namespace
 * @param locale the language
 * @returns the label, or the brand name when the key is unknown
 */
function label(titleKey: string, locale: 'bn' | 'en'): string {
  return navLabels[locale][titleKey] ?? BRAND.short;
}

/**
 * Builds the JSON-LD graph for one route.
 * @param path the route path
 * @param titleEn the English title
 * @returns the JSON-LD object
 */
function jsonLd(path: string, titleEn: string): Record<string, unknown> {
  const url = `${SITE_URL}${path === '/' ? '/' : path}`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: BRAND.nameEn,
        alternateName: BRAND.nameBn,
        url: SITE_URL,
        description: BRAND.positioning,
        email: CONTACT.general,
        founder: { '@type': 'Person', name: OWNERSHIP.owner, jobTitle: OWNERSHIP.roleLine },
        parentOrganization: { '@type': 'Organization', name: OWNERSHIP.organisationFull },
        sameAs: NETWORK_SITES.map((site) => site.url),
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: SITE_URL,
        name: BRAND.nameEn,
        inLanguage: ['bn-BD', 'en-GB'],
        publisher: { '@id': `${SITE_URL}/#organization` },
      },
      {
        '@type': 'WebPage',
        '@id': `${url}#webpage`,
        url,
        name: titleEn,
        isPartOf: { '@id': `${SITE_URL}/#website` },
        about: { '@id': `${SITE_URL}/#organization` },
        inLanguage: ['bn-BD', 'en-GB'],
      },
    ],
  };
}

/**
 * Builds the head tags for one route in one language.
 * @param path the locale-agnostic route path
 * @param titleKey the nav key
 * @param descriptionEn English description
 * @param descriptionBn Bangla description
 * @param locale which language this document is written in, or `x-default` for the bare URL
 * @returns the tag block
 */
function headTags(
  path: string,
  titleKey: string,
  descriptionEn: string,
  descriptionBn: string,
  locale: 'bn' | 'en' | 'x-default',
): string {
  const bareUrl = `${SITE_URL}${path === '/' ? '/' : path}`;
  const url = locale === 'x-default' ? bareUrl : SITE_URL + localePath(locale, path);
  const isBangla = locale === 'bn';
  const titleEn = `${label(titleKey, 'en')} — ${BRAND.short}`;
  const titleBn = `${label(titleKey, 'bn')} — ${BRAND.short}`;
  const title = isBangla ? titleBn : titleEn;
  const description = isBangla ? descriptionBn : descriptionEn;
  const cardName = path === '/' ? 'home' : path.replace(/^\//, '').replace(/\//g, '-');
  const card = `${SITE_URL}/cards/${cardName}.png`;
  const primaryLocale = isBangla ? 'bn_BD' : 'en_GB';
  const alternateLocale = isBangla ? 'en_GB' : 'bn_BD';

  return [
    `<title>${escapeXml(title)}</title>`,
    `<meta name="description" content="${escapeXml(description)}" />`,
    `<link rel="canonical" href="${escapeXml(url)}" />`,
    `<link rel="alternate" hreflang="bn-BD" href="${escapeXml(SITE_URL + localePath('bn', path))}" />`,
    `<link rel="alternate" hreflang="en-GB" href="${escapeXml(SITE_URL + localePath('en', path))}" />`,
    `<link rel="alternate" hreflang="x-default" href="${escapeXml(bareUrl)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escapeXml(BRAND.nameEn)}" />`,
    `<meta property="og:locale" content="${primaryLocale}" />`,
    `<meta property="og:locale:alternate" content="${alternateLocale}" />`,
    `<meta property="og:url" content="${escapeXml(url)}" />`,
    `<meta property="og:title" content="${escapeXml(titleEn)}" />`,
    `<meta property="og:title:bn" content="${escapeXml(titleBn)}" />`,
    `<meta property="og:description" content="${escapeXml(descriptionEn)}" />`,
    `<meta property="og:description:bn" content="${escapeXml(descriptionBn)}" />`,
    `<meta property="og:image" content="${escapeXml(card)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${escapeXml(`${label(titleKey, 'en')} — ${BRAND.legalLine}`)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:site" content="@bsdc_info_bd" />`,
    `<meta name="twitter:title" content="${escapeXml(titleEn)}" />`,
    `<meta name="twitter:description" content="${escapeXml(descriptionEn)}" />`,
    `<meta name="twitter:image" content="${escapeXml(card)}" />`,
    `<script type="application/ld+json">${JSON.stringify(jsonLd(path, titleEn))}</script>`,
  ].join('\n    ');
}

/** Prerenders every public route. */
function main(): void {
  const shellPath = join(DIST, 'index.html');
  if (!existsSync(shellPath)) {
    console.error('[bsdc] dist/index.html is missing. Run the build before prerendering.');
    process.exit(1);
  }
  const shell = readFileSync(shellPath, 'utf8');
  const region = /<!--bsdc:head-->[\s\S]*?<!--\/bsdc:head-->/;
  if (!region.test(shell)) {
    console.error(
      '[bsdc] dist/index.html has no bsdc:head markers. The prerender step needs a region to replace.',
    );
    process.exit(1);
  }

  let written = 0;
  for (const route of ROUTES) {
    if (route.status !== 'live' || route.noindex === true || route.path.includes(':')) continue;
    const meta = overrides[route.path] ?? {};
    const descriptionEn =
      meta.descriptionEn ?? `${BRAND.nameEn} — ${label(route.titleKey, 'en')}. ${BRAND.taglineEn}`;
    const descriptionBn =
      meta.descriptionBn ?? `${BRAND.nameBn} — ${label(route.titleKey, 'bn')}। ${BRAND.taglineBn}`;

    // Three documents per route: the bare one, and one per language. The sitemap declares the
    // language URLs as alternates, so they have to answer with a real 200 and not a shell that
    // says the wrong thing about which language it is in.
    for (const locale of ['x-default', 'bn', 'en'] as const) {
      // The whole region is replaced, not appended to: a document with two titles is a document
      // whose title depends on which one a crawler happens to read first.
      const document = shell
        .replace(
          region,
          `<!--bsdc:head-->\n    ${headTags(
            route.path,
            route.titleKey,
            descriptionEn,
            descriptionBn,
            locale,
          )}\n    <!--/bsdc:head-->`,
        )
        .replace(/<html lang="[a-z-]*"/u, `<html lang="${locale === 'bn' ? 'bn' : 'en'}"`);
      const target =
        locale === 'x-default'
          ? route.path === '/'
            ? join(DIST, 'index.html')
            : join(DIST, route.path, 'index.html')
          : join(DIST, locale, route.path === '/' ? 'index.html' : join(route.path, 'index.html'));
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, document, 'utf8');
      written += 1;
    }
  }

  // A single-page app on a static host still needs a 404 document, and it should say what it is.
  writeFileSync(join(DIST, '404.html'), readFileSync(join(DIST, 'index.html'), 'utf8'), 'utf8');
  console.info(
    `[bsdc] prerendered ${written} document(s): every public route in Bangla, English and the bare URL; 404.html written.`,
  );
}

main();
