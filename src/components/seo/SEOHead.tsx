/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { useEffect } from 'react';
import { SEO_DEFAULTS, absoluteUrl } from '@/config/seo';
import { ChevronRight } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

export interface SEOHeadProps {
  title: string;
  description: string;
  keywords?: string[];
  path?: string;
  ogImage?: string;
  ogType?: string;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
  noindex?: boolean;
  author?: string;
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertLink(rel: string, href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

/**
 * Declarative per-page SEO: unique title/description/keywords, canonical URL,
 * Open Graph + Twitter cards, and JSON-LD structured data — all managed on mount.
 */
export function SEOHead({ title, description, keywords, path = '/', ogImage, ogType = 'website', jsonLd, noindex, author }: SEOHeadProps) {
  useEffect(() => {
    const fullTitle = title;
    document.title = fullTitle;
    const url = absoluteUrl(path);

    upsertMeta('name', 'description', description);
    if (keywords?.length) upsertMeta('name', 'keywords', keywords.join(', '));
    upsertMeta('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow');
    upsertMeta('name', 'author', author || 'BSDC');
    upsertLink('canonical', url);

    upsertMeta('property', 'og:title', fullTitle);
    upsertMeta('property', 'og:description', description);
    upsertMeta('property', 'og:url', url);
    upsertMeta('property', 'og:type', ogType);
    upsertMeta('property', 'og:site_name', SEO_DEFAULTS.ogSiteName);
    upsertMeta('property', 'og:image', ogImage || SEO_DEFAULTS.defaultImage);

    upsertMeta('name', 'twitter:card', 'summary_large_image');
    upsertMeta('name', 'twitter:title', fullTitle);
    upsertMeta('name', 'twitter:description', description);
    upsertMeta('name', 'twitter:image', ogImage || SEO_DEFAULTS.defaultImage);

    return () => undefined;
  }, [title, description, keywords, path, ogImage, ogType, noindex, author]);

  useEffect(() => {
    if (!jsonLd) return;
    const list = Array.isArray(jsonLd) ? jsonLd : [jsonLd];
    const scripts: HTMLScriptElement[] = [];
    for (const schema of list) {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.dataset.bsdcSeo = 'page';
      script.textContent = JSON.stringify(schema);
      document.head.appendChild(script);
      scripts.push(script);
    }
    return () => scripts.forEach((s) => s.remove());
  }, [jsonLd]);

  return null;
}

export function JsonLd({ schema }: { schema: Record<string, unknown> | Record<string, unknown>[] }) {
  const list = Array.isArray(schema) ? schema : [schema];
  return (
    <>
      {list.map((s, i) => (
        <script key={i} type="application/ld+json" data-bsdc-seo="inline">
          {JSON.stringify(s)}
        </script>
      ))}
    </>
  );
}

export interface Crumb {
  name: string;
  path: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const location = useLocation();
  return (
    <nav aria-label="Breadcrumb" className="mb-4 min-w-0">
      <ol className="bsdc-scroll-x flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={`${item.path}-${i}`} className="flex shrink-0 items-center gap-1">
              {i > 0 ? <ChevronRight className="h-3 w-3 shrink-0 opacity-60" aria-hidden /> : null}
              {isLast || item.path === location.pathname ? (
                <span aria-current="page" className="max-w-40 truncate font-semibold text-neutral-700 dark:text-neutral-300">
                  {item.name}
                </span>
              ) : (
                <Link to={item.path} className="max-w-40 truncate hover:text-brand-600 hover:underline dark:hover:text-brand-400">
                  {item.name}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

