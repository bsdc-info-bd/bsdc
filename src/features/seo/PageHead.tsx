/**
 * BSDC — src/features/seo/PageHead.tsx
 * Purpose : The runtime half of search and sharing: one component that owns the document head.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The route table is the single source of truth (ADR-005), so this component reads the same
 *   entry the router matched and writes the head from it: title, description in both languages,
 *   canonical, the hreflang pair, Open Graph, the Twitter card, JSON-LD, and — for anything marked
 *   `noindex` — a robots tag that keeps it out of an index it has no business being in.
 *   Tags are updated rather than appended, because a single-page application that appends a new
 *   canonical on every navigation ends up with eleven of them and a crawler that believes none.
 *   The prerender step writes the same facts into the static document a crawler fetches, from the
 *   same table, so the two can never disagree about what a page is called.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BRAND, CONTACT, NETWORK_SITES, OWNERSHIP, SITE_URL } from '@/core/config/app';
import { ROUTES } from '@/core/config/routes';
import type { Locale } from '@/core/config/app';

/**
 * Finds the route table entry for a pathname. Parameterised paths match by their prefix, so
 * `/u/someone` resolves to the profile entry rather than to nothing at all.
 * @param pathname the browser path
 * @returns the matching route, or undefined
 */
function matchRoute(pathname: string): (typeof ROUTES)[number] | undefined {
  const exact = ROUTES.find((route) => route.path === pathname);
  if (exact !== undefined) return exact;
  return ROUTES.find((route) => {
    if (!route.path.includes(':')) return false;
    const [prefix] = route.path.split('/:');
    return prefix !== undefined && prefix.length > 0 && pathname.startsWith(`${prefix}/`);
  });
}

/**
 * Sets, replaces or removes a meta tag by its name or property.
 * @param selector the attribute to key on, `name` or `property`
 * @param key the value of that attribute
 * @param content the content, or null to remove the tag
 * @returns void
 */
function setMeta(selector: 'name' | 'property', key: string, content: string | null): void {
  const existing = document.head.querySelector<HTMLMetaElement>(`meta[${selector}="${key}"]`);
  if (content === null) {
    existing?.remove();
    return;
  }
  const tag = existing ?? document.createElement('meta');
  tag.setAttribute(selector, key);
  tag.setAttribute('content', content);
  if (existing === null) document.head.append(tag);
}

/**
 * Sets, replaces or removes a link tag by its relation and, where given, its language.
 * @param rel the relation
 * @param href the href, or null to remove the tag
 * @param hreflang the language, when the relation is an alternate
 * @returns void
 */
function setLink(rel: string, href: string | null, hreflang?: string): void {
  const selector =
    hreflang === undefined
      ? `link[rel="${rel}"]:not([hreflang])`
      : `link[rel="${rel}"][hreflang="${hreflang}"]`;
  const existing = document.head.querySelector<HTMLLinkElement>(selector);
  if (href === null) {
    existing?.remove();
    return;
  }
  const tag = existing ?? document.createElement('link');
  tag.setAttribute('rel', rel);
  tag.setAttribute('href', href);
  if (hreflang !== undefined) tag.setAttribute('hreflang', hreflang);
  if (existing === null) document.head.append(tag);
}

/**
 * Builds the JSON-LD graph for a page.
 * @param url the canonical URL
 * @param titleEn the English page title
 * @returns the JSON-LD object
 */
function graph(url: string, titleEn: string): Record<string, unknown> {
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
 * Renders nothing and owns the document head.
 * @returns null
 */
export function PageHead(): null {
  const location = useLocation();
  const { t, i18n } = useTranslation('nav');
  const locale: Locale = i18n.language.startsWith('bn') ? 'bn' : 'en';

  useEffect(() => {
    const pathname = location.pathname;
    const route = matchRoute(pathname);
    const url = `${SITE_URL}${pathname === '/' ? '/' : pathname}`;
    const titleKey = route?.titleKey ?? 'home';
    const labelEn = t(titleKey, { lng: 'en' });
    const labelBn = t(titleKey, { lng: 'bn' });
    const titleEn = `${labelEn} — ${BRAND.short}`;
    const titleBn = `${labelBn} — ${BRAND.short}`;
    const descriptionEn = `${BRAND.nameEn} — ${labelEn}. ${BRAND.taglineEn}`;
    const descriptionBn = `${BRAND.nameBn} — ${labelBn}। ${BRAND.taglineBn}`;
    const card = `${SITE_URL}/cards/${
      pathname === '/' ? 'home' : pathname.replace(/^\//, '').replace(/\//g, '-')
    }.png`;

    document.title = locale === 'bn' ? titleBn : titleEn;
    document.documentElement.setAttribute('lang', locale === 'bn' ? 'bn' : 'en');

    setMeta('name', 'description', locale === 'bn' ? descriptionBn : descriptionEn);
    setMeta('name', 'robots', route?.noindex === true ? 'noindex, nofollow' : null);
    setLink('canonical', url);
    setLink('alternate', `${url}?lng=bn`, 'bn-BD');
    setLink('alternate', `${url}?lng=en`, 'en-GB');
    setLink('alternate', url, 'x-default');

    setMeta('property', 'og:type', 'website');
    setMeta('property', 'og:site_name', BRAND.nameEn);
    setMeta('property', 'og:url', url);
    setMeta('property', 'og:title', titleEn);
    setMeta('property', 'og:description', descriptionEn);
    setMeta('property', 'og:locale', locale === 'bn' ? 'bn_BD' : 'en_GB');
    setMeta('property', 'og:locale:alternate', locale === 'bn' ? 'en_GB' : 'bn_BD');
    setMeta('property', 'og:image', card);
    setMeta('property', 'og:image:width', '1200');
    setMeta('property', 'og:image:height', '630');
    setMeta('property', 'og:image:alt', `${labelEn} — ${BRAND.legalLine}`);

    setMeta('name', 'twitter:card', 'summary_large_image');
    setMeta('name', 'twitter:site', '@bsdc_info_bd');
    setMeta('name', 'twitter:title', titleEn);
    setMeta('name', 'twitter:description', descriptionEn);
    setMeta('name', 'twitter:image', card);

    const scriptId = 'bsdc-jsonld';
    const existing = document.head.querySelector<HTMLScriptElement>(`#${scriptId}`);
    const script = existing ?? document.createElement('script');
    script.id = scriptId;
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(graph(url, titleEn));
    if (existing === null) document.head.append(script);
  }, [location.pathname, locale, t]);

  return null;
}
