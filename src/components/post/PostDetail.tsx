/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Eye, Clock, Briefcase } from 'lucide-react';
import { FeedCard } from '@/components/feed/FeedCard';
import { CommentSection } from './CommentThread';
import { Breadcrumbs, SEOHead } from '@/components/seo/SEOHead';
import { breadcrumbSchema, postDetailRoute, postSchema } from '@/config/seo';
import { findRelatedPosts, getPostBySlug, incrementPostView } from '@/lib/data';
import { trackInteraction } from '@/lib/personalization';
import { extractDescription, formatNumber, headingSlug, timeAgo } from '@/lib/utils';
import { Markdown } from '@/components/ui/Markdown';
import { useUIStore } from '@/stores/uiStore';
import { ErrorState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import type { Post } from '@/types/post';

function usePostByRouteParam(): { post: Post | null; loading: boolean; error: string } {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    getPostBySlug(slug)
      .then((p) => {
        if (cancelled) return;
        if (!p) setError('not-found');
        else {
          setPost(p);
          void incrementPostView(p.id);
          const openedAt = Date.now();
          trackInteraction({ kind: 'view', postId: p.id, postType: p.type, tags: p.tags, authorId: p.authorId, dwellSeconds: 0 });
          // Record dwell time when the reader leaves the post.
          window.setTimeout(() => {
            trackInteraction({ kind: 'view', postId: p.id, postType: p.type, tags: p.tags, authorId: p.authorId, dwellSeconds: Math.round((Date.now() - openedAt) / 1000) });
          }, 30000);
        }
      })
      .catch(() => !cancelled && setError('network'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [slug]);
  return { post, loading, error };
}

export function PostDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const language = useUIStore((s) => s.language);
  const { post, loading, error } = usePostByRouteParam();
  const [relatedPosts, setRelatedPosts] = useState<Post[]>([]);

  useEffect(() => {
    if (!post) return;
    findRelatedPosts(post).then(setRelatedPosts).catch(() => setRelatedPosts([]));
  }, [post]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    );
  }

  if (error || !post) {
    return (
      <ErrorState
        message={error === 'not-found' ? 'This post does not exist or has been removed.' : 'Could not load this post. Check your connection.'}
        onRetry={() => navigate(0)}
      />
    );
  }

  const route = postDetailRoute(post.type);

  return (
    <>
      <SEOHead
        title={`${(post.seoTitle || post.title || extractDescription(post.body, 'BSDC post')).slice(0, 55)} — BSDC`}
        description={post.seoDescription || extractDescription(post.body)}
        keywords={post.tags}
        path={`/${route}/${post.slug}`}
        ogType="article"
        ogImage={post.images[0]}
        author={post.authorName}
        jsonLd={[
          postSchema(post),
          breadcrumbSchema([
            { name: 'Home', url: '/' },
            { name: t(`nav.${route === 'post' ? 'home' : route}`) || route, url: `/${route === 'post' ? '' : route}` },
            { name: post.title || 'Post', url: `/${route}/${post.slug}` },
          ]),
        ]}
      />
      <Breadcrumbs
        items={[
          { name: 'BSDC', path: '/' },
          ...(route !== 'post' ? [{ name: t(`nav.${route}`) || route, path: `/${route}` }] : []),
          { name: post.title || 'Post', path: `/${route}/${post.slug}` },
        ]}
      />
      <div className="mb-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="bsdc-tap inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-neutral-500 hover:bg-neutral-100 dark:hover:bg-surface-dark-raised"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t('common.back')}
        </button>
        <p className="flex items-center gap-3 text-xs text-neutral-400">
          <span className="inline-flex items-center gap-1">
            <Eye className="h-3.5 w-3.5" aria-hidden />
            {formatNumber(post.viewCount, language)} {t('post.views')}
          </span>
          {post.readingMinutes > 1 ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              {post.readingMinutes} {t('post.readingTime')}
            </span>
          ) : null}
        </p>
      </div>

      {(post.type === 'blog' || post.type === 'docs' || post.type === 'wiki') && post.body.length > 1200 ? (
        <TableOfContents body={post.body} />
      ) : null}

      <FeedCard post={post} showBody={false} />

      {post.body.trim() ? (
        <article className="bsdc-surface mt-4 min-w-0 overflow-hidden p-4 sm:p-6" aria-label="Article content">
          <Markdown content={post.body} className="text-[15px] sm:text-base" />
        </article>
      ) : null}

      {relatedPosts.length > 0 ? (
        <section className="mt-6" aria-labelledby="related-posts-heading">
          <h2 id="related-posts-heading" className="mb-3 text-lg font-bold">Related posts</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {relatedPosts.map((related) => (
              <a key={related.id} href={`/${postDetailRoute(related.type)}/${related.slug}`} className="bsdc-surface min-w-0 p-4 transition-colors hover:border-brand-300 dark:hover:border-brand-700">
                <h3 className="truncate font-semibold">{related.title || 'Untitled post'}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-neutral-500">{extractDescription(related.body)}</p>
              </a>
            ))}
          </div>
        </section>
      ) : null}

      {post.type === 'snippet' && post.snippet ? (
        <section className="bsdc-surface mt-4 overflow-hidden" aria-label="Code">
          <pre className="max-h-[600px] overflow-auto bg-[#0d1117] p-4 font-mono text-[13px] leading-relaxed text-neutral-100">
            <code>{post.snippet.code}</code>
          </pre>
        </section>
      ) : null}

      {post.type === 'job' && post.job && post.job.requirements.length > 0 ? (
        <section className="bsdc-surface mt-4 p-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-bold">
            <Briefcase className="h-4 w-4 text-brand-600" aria-hidden />
            {t('post.requirements')}
          </h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {post.job.requirements.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {post.wikiRevisions?.length > 0 ? (
        <section className="bsdc-surface mt-4 p-4">
          <h2 className="mb-2 text-sm font-bold">Edit history</h2>
          <ul className="space-y-1 text-xs text-neutral-500">
            {post.wikiRevisions.map((rev, i) => (
              <li key={i}>
                {timeAgo(rev.editedAt, language)} — {rev.summary || 'edited'}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <CommentSection post={post} />
    </>
  );
}

export function TableOfContents({ body }: { body: string }) {
  const { t } = useTranslation();
  const headings = Array.from(body.matchAll(/^##+\s+(.+)$/gm)).map((m) => m[1]);
  if (headings.length < 2) return null;
  return (
    <nav className="bsdc-surface mb-4 p-4" aria-label={t('post.tableOfContents')}>
      <p className="mb-2 text-sm font-bold">{t('post.tableOfContents')}</p>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-brand-600 dark:text-brand-400">
        {headings.map((h, i) => {
          const id = headingSlug(h);
          return (
            <li key={`${h}-${i}`}>
              <a href={`#${id}`} className="hover:underline">
                {h}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

