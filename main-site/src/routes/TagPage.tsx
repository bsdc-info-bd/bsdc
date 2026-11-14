import { useQuery } from '@tanstack/react-query';
import { Hash } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { PostCard } from '@/components/content/PostCard';
import { Seo } from '@/components/seo/Seo';
import { Alert, EmptyState, PageSkeleton, SectionHeading } from '@/design-system';
import { TrendingTags } from '@/components/feed/FeedRail';
import { isConfigured } from '@/lib/env';
import { formatNumber } from '@/lib/format';
import { SITE } from '@/lib/site';
import { useAuthStore } from '@/store/auth-store';

export default function TagPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const params = useParams();
  const slug = (params['slug'] ?? '').toLowerCase();

  const { data, isPending } = useQuery({
    queryKey: ['tag', uid ?? 'anon', slug],
    queryFn: async () => {
      const module = await import('@/lib/content/post-repository');
      const [tag, posts] = await Promise.all([module.fetchTag(slug), module.fetchPostsByTag(slug)]);
      return { tag, posts };
    },
    enabled: slug.length > 0 && isConfigured.supabase,
    staleTime: 60_000,
  });

  if (!isConfigured.supabase) {
    return (
      <>
        <Seo
          title={t('tag.metaTitle', { tag: slug })}
          description={t('tag.metaDescription', { tag: slug })}
          path={`/tag/${slug}`}
          noindex
        />
        <div className="fab-container py-10">
          <Alert tone="danger" title={t('data.errors.notConfigured')} />
        </div>
      </>
    );
  }

  if (isPending) return <PageSkeleton label={t('common.loading')} />;

  const label =
    data?.tag === null || data?.tag === undefined
      ? slug
      : language === 'bn' && data.tag.label_bn.length > 0
        ? data.tag.label_bn
        : data.tag.label_en;
  const hasPosts = (data?.tag?.posts_count ?? 0) > 0 || (data?.posts.length ?? 0) > 0;

  return (
    <>
      <Seo
        title={t('tag.metaTitle', { tag: label })}
        description={
          data?.tag?.description && data.tag.description.length > 0
            ? data.tag.description
            : t('tag.metaDescription', { tag: label })
        }
        path={`/tag/${slug}`}
        noindex={!hasPosts}
        jsonLd={
          hasPosts
            ? [
                {
                  '@type': 'CollectionPage',
                  name: label,
                  url: `${SITE.url}/tag/${slug}`,
                },
              ]
            : []
        }
      />
      <div className="fab-container py-6 sm:py-10">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,44rem)_13rem] lg:justify-center">
          <div className="min-w-0">
            <SectionHeading
              title={`#${label}`}
              description={
                data?.tag
                  ? t('tag.postCount', { total: formatNumber(data.tag.posts_count, language) })
                  : t('tag.metaDescription', { tag: label })
              }
            />
            {data && data.posts.length > 0 ? (
              <ul className="mt-4 grid gap-3">
                {data.posts.map((post) => (
                  <li key={post.id}>
                    <PostCard post={post} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                className="mt-4"
                icon={<Hash size={28} />}
                title={t('tag.emptyTitle')}
                description={t('tag.emptyBody')}
              />
            )}
          </div>
          {/* The rail on a tag page is how a reader moves sideways: from a tag
              they arrived at to the ones being used right now. */}
          <aside className="lg:sticky lg:top-20 lg:self-start">
            <TrendingTags />
          </aside>
        </div>
      </div>
    </>
  );
}
