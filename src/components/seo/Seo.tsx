import { useEffect } from 'react';
import { config } from '@/config';

interface SeoProps {
  title?: string;
  description?: string;
  canonical?: string;
  image?: string;
  type?: 'website' | 'article' | 'profile';
  noindex?: boolean;
  author?: string;
  publishedTime?: string;
  modifiedTime?: string;
  tags?: string[];
  jsonLd?: Record<string, unknown>;
  breadcrumbs?: BreadcrumbItem[];
}

interface BreadcrumbItem {
  name: string;
  url: string;
}

export function Seo({
  title,
  description,
  canonical,
  image,
  type = 'website',
  noindex = false,
  author,
  publishedTime,
  modifiedTime,
  tags,
  jsonLd,
  breadcrumbs,
}: SeoProps) {
  useEffect(() => {
    const fullTitle = title
      ? `${title} • ${config.siteShortName}`
      : config.siteName;

    // Set title
    document.title = fullTitle;

    // Set or update meta tags
    setMeta('description', description || config.siteDescription);
    setMeta('robots', noindex ? 'noindex, nofollow' : 'index, follow');
    if (author) setMeta('author', author);

    // Canonical
    setLink('canonical', canonical ? `${config.siteUrl}${canonical}` : config.siteUrl);

    // Open Graph
    setMeta('og:title', fullTitle, 'property');
    setMeta('og:description', description || config.siteDescription, 'property');
    setMeta('og:type', type, 'property');
    setMeta('og:url', canonical ? `${config.siteUrl}${canonical}` : config.siteUrl, 'property');
    setMeta('og:site_name', config.siteShortName, 'property');
    if (image) setMeta('og:image', image, 'property');
    if (publishedTime) setMeta('article:published_time', publishedTime, 'property');
    if (modifiedTime) setMeta('article:modified_time', modifiedTime, 'property');
    if (tags) {
      tags.forEach((tag, i) => {
        setMeta(`article:tag:${i}`, tag, 'property');
      });
    }

    // Twitter Card
    setMeta('twitter:card', image ? 'summary_large_image' : 'summary');
    setMeta('twitter:title', fullTitle);
    setMeta('twitter:description', description || config.siteDescription);
    if (image) setMeta('twitter:image', image);

    // JSON-LD
    const jsonLdScripts = document.querySelectorAll('script[data-seo-jsonld]');
    jsonLdScripts.forEach((el) => el.remove());

    const schemas: Record<string, unknown>[] = [];

    // Base WebSite schema
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: config.siteName,
      alternateName: config.siteShortName,
      url: config.siteUrl,
      description: config.siteDescription,
    });

    // Breadcrumbs
    if (breadcrumbs && breadcrumbs.length > 0) {
      schemas.push({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: breadcrumbs.map((item, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: item.name,
          item: `${config.siteUrl}${item.url}`,
        })),
      });
    }

    // Custom JSON-LD
    if (jsonLd) {
      schemas.push(jsonLd);
    }

    schemas.forEach((schema) => {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.setAttribute('data-seo-jsonld', 'true');
      script.textContent = JSON.stringify(schema);
      document.head.appendChild(script);
    });

    // Cleanup
    return () => {
      const cleanupScripts = document.querySelectorAll('script[data-seo-jsonld]');
      cleanupScripts.forEach((el) => el.remove());
    };
  }, [title, description, canonical, image, type, noindex, author, publishedTime, modifiedTime, tags, jsonLd, breadcrumbs]);

  return null;
}

function setMeta(name: string, content: string, attribute: string = 'name') {
  let el = document.querySelector(`meta[${attribute}="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attribute, name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setLink(rel: string, href: string) {
  let el = document.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

// Helper to generate profile SEO
export const profileSeoProps = (username: string, displayName?: string, bio?: string, avatar?: string): SeoProps => ({
  title: username,
  description: bio || `${displayName || username}'s profile on ${config.siteShortName}`,
  canonical: `/@${username}`,
  image: avatar || undefined,
  type: 'profile',
  jsonLd: {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    mainEntity: {
      '@type': 'Person',
      name: displayName || username,
      identifier: username,
      url: `${config.siteUrl}/@${username}`,
      image: avatar,
      description: bio,
    },
  },
  breadcrumbs: [
    { name: 'Home', url: '/' },
    { name: username, url: `/@${username}` },
  ],
});

// Helper to generate post SEO
export const postSeoProps = (post: {
  title: string;
  slug: string;
  type: string;
  excerpt: string;
  coverImage?: string | null;
  authorDisplayName?: string;
  publishedAt?: number | null;
  tags?: string[];
}): SeoProps => ({
  title: post.title,
  description: post.excerpt,
  canonical: `/${post.type}/${post.slug}`,
  image: post.coverImage || undefined,
  type: 'article',
  author: post.authorDisplayName,
  publishedTime: post.publishedAt ? new Date(post.publishedAt).toISOString() : undefined,
  tags: post.tags,
  jsonLd: {
    '@context': 'https://schema.org',
    '@type': post.type === 'question' ? 'Question' : 'Article',
    headline: post.title,
    description: post.excerpt,
    image: post.coverImage,
    author: {
      '@type': 'Person',
      name: post.authorDisplayName,
    },
    publisher: {
      '@type': 'Organization',
      name: config.siteName,
      url: config.siteUrl,
    },
    datePublished: post.publishedAt ? new Date(post.publishedAt).toISOString() : undefined,
  },
  breadcrumbs: [
    { name: 'Home', url: '/' },
    { name: post.type.charAt(0).toUpperCase() + post.type.slice(1), url: `/${post.type}` },
    { name: post.title, url: `/${post.type}/${post.slug}` },
  ],
});
