import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Eye, MessageSquare, Pencil } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { MarkdownView } from '@/components/content/MarkdownView';
import { Seo } from '@/components/seo/Seo';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  PageSkeleton,
  ProgressBar,
} from '@/design-system';
import { isConfigured } from '@/lib/env';
import { formatAbsoluteDate, formatNumber } from '@/lib/format';
import { profilePath, SITE } from '@/lib/site';
import { dataErrorKey } from '@/lib/supabase/errors';
import { useAuthStore } from '@/store/auth-store';

const JSON_LD_TYPE: Record<string, string> = {
  article: 'Article',
  question: 'QAPage',
  snippet: 'TechArticle',
  post: 'DiscussionForumPosting',
  poll: 'DiscussionForumPosting',
  media: 'DiscussionForumPosting',
};

export default function PostPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const params = useParams();
  const slug = (params['slug'] ?? '').toLowerCase();
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['post', slug],
    queryFn: async () => {
      const { fetchPostBySlug } = await import('@/lib/content/post-repository');
      return fetchPostBySlug(slug);
    },
    enabled: slug.length > 0 && isConfigured.supabase,
    staleTime: 30_000,
  });

  const postId = data?.id ?? '';

  const { data: myVote } = useQuery({
    queryKey: ['poll-vote', postId, user?.uid ?? ''],
    queryFn: async () => {
      const { fetchMyPollVote } = await import('@/lib/content/post-repository');
      return fetchMyPollVote(postId, user?.uid ?? '');
    },
    enabled: postId.length > 0 && Boolean(user) && (data?.poll.length ?? 0) > 0,
  });

  const vote = useMutation({
    mutationFn: async (optionId: string) => {
      const { castPollVote } = await import('@/lib/content/post-repository');
      await castPollVote(postId, optionId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['post', slug] });
      await queryClient.invalidateQueries({ queryKey: ['poll-vote', postId] });
    },
  });

  // One view per mount, fire and forget: a reader is never blocked by it.
  useEffect(() => {
    if (postId.length === 0) return;
    void import('@/lib/content/post-repository')
      .then(({ registerPostView }) => registerPostView(postId))
      .catch(() => undefined);
  }, [postId]);

  if (!isConfigured.supabase) {
    return (
      <div className="fab-container py-10">
        <Alert tone="danger" title={t('data.errors.notConfigured')} />
      </div>
    );
  }

  if (isPending) return <PageSkeleton label={t('common.loading')} />;

  if (isError) {
    return (
      <div className="fab-container py-10">
        <Alert tone="danger" title={t(dataErrorKey(error))} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="fab-container py-10">
        <EmptyState
          icon={<MessageSquare size={32} />}
          title={t('post.notFoundTitle')}
          description={t('post.notFoundBody')}
          action={
            <Link to="/">
              <Button variant="secondary">{t('common.backHome')}</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const post = data;
  const isAuthor = user?.uid === post.author?.uid;
  const published = post.publishedAt ?? post.createdAt;
  const totalVotes = post.poll.reduce((sum, option) => sum + option.votes, 0);

  return (
    <>
      <Seo
        title={`${post.title.length > 0 ? post.title : post.excerpt.slice(0, 60)} — ${t('common.brand')}`}
        description={post.excerpt.length > 0 ? post.excerpt : t('post.metaFallback')}
        path={`/p/${post.slug}`}
        type="article"
        {...(post.coverUrl.length > 0 ? { image: post.coverUrl } : {})}
        noindex={post.visibility !== 'public' || post.status !== 'published'}
        jsonLd={[
          {
            '@type': JSON_LD_TYPE[post.kind] ?? 'DiscussionForumPosting',
            headline: post.title.length > 0 ? post.title : post.excerpt.slice(0, 110),
            description: post.excerpt,
            datePublished: published,
            ...(post.editedAt ? { dateModified: post.editedAt } : {}),
            inLanguage: post.language,
            url: `${SITE.url}/p/${post.slug}`,
            keywords: post.tags.join(', '),
            ...(post.author
              ? {
                  author: {
                    '@type': 'Person',
                    name: post.author.displayName,
                    url: `${SITE.url}${profilePath(post.author.username)}`,
                  },
                }
              : {}),
          },
        ]}
      />

      <article className="fab-container py-6 sm:py-10">
        <div className="mx-auto w-full max-w-3xl">
          {post.status !== 'published' ? (
            <Alert tone="warning" title={t('post.draftNotice')} className="mb-4" />
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="green">{t(`compose.kinds.${post.kind}`)}</Badge>
            {post.isSensitive ? <Badge tone="warn">{t('post.sensitive')}</Badge> : null}
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              <Clock size={14} aria-hidden="true" />
              {t('post.readingTime', { minutes: formatNumber(post.readingTime, language) })}
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              <Eye size={14} aria-hidden="true" />
              {formatNumber(post.views, language)}
            </span>
          </div>

          {post.title.length > 0 ? <h1 className="mt-3 text-3xl">{post.title}</h1> : null}

          {post.author ? (
            <div className="mt-4 flex items-center gap-3">
              <Link to={profilePath(post.author.username)} className="shrink-0">
                <Avatar src={post.author.avatarUrl} name={post.author.displayName} size="md" />
              </Link>
              <div className="min-w-0">
                <Link
                  to={profilePath(post.author.username)}
                  className="fab-truncate block font-semibold hover:underline"
                >
                  {post.author.displayName}
                </Link>
                <p className="text-xs text-muted">
                  {formatAbsoluteDate(new Date(published), language)}
                  {post.editedAt ? ` · ${t('post.edited')}` : ''}
                </p>
              </div>
              {isAuthor ? (
                <Link to="/compose" className="ms-auto shrink-0">
                  <Button variant="secondary" size="sm" iconStart={<Pencil size={16} />}>
                    {t('post.edit')}
                  </Button>
                </Link>
              ) : null}
            </div>
          ) : null}

          {post.coverUrl.length > 0 ? (
            <img
              src={post.coverUrl}
              alt=""
              loading="lazy"
              className="mt-5 w-full rounded-card object-cover"
            />
          ) : null}

          {post.body.length > 0 ? <MarkdownView markdown={post.body} className="mt-5" /> : null}

          {post.kind === 'snippet' && post.code.length > 0 ? (
            <MarkdownView
              className="mt-5"
              markdown={`\`\`\`${post.codeLanguage}\n${post.code}\n\`\`\``}
            />
          ) : null}

          {post.media.length > 0 ? (
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {post.media.map((item) => (
                <li key={item.mediaId.length > 0 ? item.mediaId : item.url}>
                  <img
                    src={item.url}
                    alt={item.altText}
                    loading="lazy"
                    className="w-full rounded-card object-cover"
                  />
                </li>
              ))}
            </ul>
          ) : null}

          {post.poll.length > 0 ? (
            <Card className="mt-5">
              <h2 className="text-lg font-semibold">{t('post.pollTitle')}</h2>
              <ul className="mt-3 grid gap-3">
                {post.poll.map((option) => {
                  const share = totalVotes > 0 ? Math.round((option.votes / totalVotes) * 100) : 0;
                  const chosen = myVote === option.id;
                  return (
                    <li key={option.id}>
                      <button
                        type="button"
                        disabled={!user || vote.isPending}
                        onClick={() => vote.mutate(option.id)}
                        className="fab-tap w-full rounded-xl border border-border px-3 py-2 text-start text-sm hover:bg-surface-2 disabled:opacity-70"
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="fab-truncate">
                            {option.label}
                            {chosen ? ' ✓' : ''}
                          </span>
                          <span className="shrink-0 text-xs text-muted">
                            {formatNumber(share, language)}%
                          </span>
                        </span>
                        <ProgressBar value={share} label={option.label} className="mt-2" />
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 text-xs text-muted">
                {t('post.pollVotes', { votes: formatNumber(totalVotes, language) })}
              </p>
              {!user ? <p className="mt-1 text-xs text-muted">{t('post.pollSignIn')}</p> : null}
            </Card>
          ) : null}

          {post.tags.length > 0 ? (
            <ul className="mt-6 flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <li key={tag}>
                  <Link to={`/tag/${tag}`}>
                    <Chip>#{tag}</Chip>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}

          <p className="mt-6 text-xs text-muted">
            {t('post.commentsSoon', { count: post.comments })}
          </p>
        </div>
      </article>
    </>
  );
}
