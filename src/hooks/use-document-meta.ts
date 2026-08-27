import { useEffect } from 'react';

interface DocumentMetaOptions {
  title: string;
  description?: string;
  /** Unbuilt areas must not be indexed. */
  noindex?: boolean;
}

/**
 * Minimal per-route document title/meta handling.
 *
 * This is deliberately tiny in Phase 0; Phase 7 (SEO & Discoverability)
 * replaces it with react-helmet-async plus build-time prerendering of
 * critical meta tags per brief §9.
 */
export function useDocumentMeta({ title, description, noindex }: DocumentMetaOptions): void {
  useEffect(() => {
    document.title = title;

    let desc: HTMLMetaElement | null = null;
    if (description) {
      desc = document.querySelector('meta[name="description"]');
      if (!desc) {
        desc = document.createElement('meta');
        desc.setAttribute('name', 'description');
        document.head.appendChild(desc);
      }
      desc.setAttribute('content', description);
    }

    let robots: HTMLMetaElement | null = null;
    if (noindex) {
      robots = document.createElement('meta');
      robots.setAttribute('name', 'robots');
      robots.setAttribute('content', 'noindex, nofollow');
      document.head.appendChild(robots);
    }

    return () => {
      robots?.remove();
    };
  }, [title, description, noindex]);
}
