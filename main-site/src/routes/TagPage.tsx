import { useQuery } from '@tanstack/react-query';
import { Hash } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { PostCard } from '@/components/content/PostCard';
import { Seo } from '@/components/seo/Seo';
import { Alert, EmptyState, PageSkeleton, SectionHeading } from '@/design-system';
import { isConfigured } from '@/lib/env';
import { formatNumber } from '@/lib/format';
import { SITE } from '@/lib/site';

export default function TagPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const params = useParams();
  const slug = (params['slug'] ?? '').toLowerCase();

  const { data, isPending } = useQuery({
    queryKey: ['tag', slug],
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
      <div className="fab-container py-10">
        <Alert tone="danger" title={t('data.errors.notConfigured')} />
      </div>
    );
  }

  if (isPending) return <PageSkeleton label={t('common.loading')} />;

  const label =
    data?.tag === null || data?.tag === undefined
      ? slug
      : language === 'bn' && data.tag.label_bn.length > 0
        ? data.tag.label_bn
        : data.tag.label_en;

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
        jsonLd={[
          {
            '@type': 'CollectionPage',
            name: label,
            url: `${SITE.url}/tag/${slug}`,
          },
        ]}
      />
      <div className="fab-container py-6 sm:py-10">
        <div className="mx-auto w-full max-w-3xl">
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
      </div>
    </>
  );
}
