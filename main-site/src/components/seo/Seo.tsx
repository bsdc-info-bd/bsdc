import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import { SITE } from '@/lib/site';
import { canonicalPath, clipText, isPrivatePath } from '@/lib/seo/engine';

export interface SeoProps {
  title: string;
  description: string;
  /** Path beginning with "/" — combined with the canonical site origin. */
  path: string;
  image?: string;
  type?: 'website' | 'article' | 'profile';
  noindex?: boolean;
  /** Extra JSON-LD nodes merged into the page graph. */
  jsonLd?: Record<string, unknown>[];
}

function absoluteUrl(path: string): string {
  return new URL(path, SITE.url).toString();
}

/**
 * Per-route SEO: title, description, canonical, hreflang alternates, Open
 * Graph, Twitter cards and a JSON-LD graph. Runtime meta here is mirrored by
 * the build-time prerender pipeline so crawlers receive full HTML.
 */
export function Seo({
  title,
  description,
  path,
  image = '/og/og-image.png',
  type = 'website',
  noindex = false,
  jsonLd = [],
}: SeoProps) {
  const { i18n } = useTranslation();
  const language = i18n.language === 'bn' ? 'bn' : 'en';
  // The canonical form, the length limits and the list of pages that are
  // never indexed all come from the SEO engine, so this component cannot
  // disagree with the sitemap, the prerender or the edge.
  const canonical = absoluteUrl(canonicalPath(path));
  const imageUrl = absoluteUrl(image);
  const withheld = noindex || isPrivatePath(path);

  const graph: Record<string, unknown>[] = [
    {
      '@type': 'Organization',
      '@id': `${SITE.url}/#organization`,
      name: SITE.name,
      alternateName: SITE.shortName,
      url: SITE.url,
      logo: absoluteUrl('/icons/icon-512.png'),
      email: SITE.emails.primary,
      parentOrganization: { '@type': 'Organization', name: SITE.parentOrganization },
      founder: { '@type': 'Person', name: SITE.owner.name },
      sameAs: [SITE.repository, SITE.altUrl],
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE.url}/#website`,
      url: SITE.url,
      name: SITE.name,
      alternateName: SITE.shortName,
      inLanguage: [language === 'bn' ? 'bn-BD' : 'en-US'],
      publisher: { '@id': `${SITE.url}/#organization` },
      potentialAction: {
        '@type': 'SearchAction',
        target: { '@type': 'EntryPoint', urlTemplate: `${SITE.url}/search?q={search_term_string}` },
        'query-input': 'required name=search_term_string',
      },
    },
    ...jsonLd,
  ];

  return (
    <Helmet prioritizeSeoTags>
      <html lang={language} />
      <title>{clipText(title, 70)}</title>
      <meta name="description" content={clipText(description, 180)} />
      <link rel="canonical" href={canonical} />
      <meta
        name="robots"
        content={withheld ? 'noindex,nofollow' : 'index,follow,max-image-preview:large'}
      />

      <link rel="alternate" hrefLang="bn" href={`${canonical}?lang=bn`} />
      <link rel="alternate" hrefLang="en" href={`${canonical}?lang=en`} />
      <link rel="alternate" hrefLang="x-default" href={canonical} />

      <meta property="og:site_name" content={SITE.name} />
      <meta property="og:type" content={type} />
      <meta property="og:title" content={clipText(title, 70)} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <meta property="og:image" content={imageUrl} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:locale" content={language === 'bn' ? 'bn_BD' : 'en_US'} />
      <meta property="og:locale:alternate" content={language === 'bn' ? 'en_US' : 'bn_BD'} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={imageUrl} />

      <script type="application/ld+json">
        {JSON.stringify({ '@context': 'https://schema.org', '@graph': graph })}
      </script>
    </Helmet>
  );
}
