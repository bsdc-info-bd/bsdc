import { useQuery } from '@tanstack/react-query';
import { BookmarkX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PostCard } from '@/components/content/PostCard';
import { Seo } from '@/components/seo/Seo';
import { Alert, EmptyState, PageSkeleton, SectionHeading } from '@/design-system';
import { ROUTES } from '@/lib/site';
import { useAuthStore } from '@/store/auth-store';

/** Everything this member saved for later, newest first. */
export default function BookmarksPage() {
  const { t } = useTranslation();
  const uid = useAuthStore((state) => state.user?.uid ?? null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['bookmarks', uid],
    queryFn: async () => {
      const { fetchBookmarkedPosts } = await import('@/lib/interactions/interaction-repository');
      return fetchBookmarkedPosts(uid ?? '');
    },
    enabled: uid !== null,
    staleTime: 60_000,
  });

  const posts = data ?? [];

  return (
    <>
      <Seo
        title={t('bookmarks.metaTitle')}
        description={t('bookmarks.metaDescription')}
        path={ROUTES.bookmarks}
        noindex
      />
      <div className="fab-container py-6 sm:py-10">
        <SectionHeading title={t('bookmarks.title')} description={t('bookmarks.description')} />

        {isLoading ? <PageSkeleton label={t('common.loading')} /> : null}
        {isError ? <Alert tone="danger" title={t('bookmarks.failed')} /> : null}

        {!isLoading && !isError && posts.length === 0 ? (
          <EmptyState
            icon={<BookmarkX size={22} />}
            title={t('bookmarks.emptyTitle')}
            description={t('bookmarks.emptyBody')}
          />
        ) : null}

        <div className="mt-4 flex flex-col gap-3">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      </div>
    </>
  );
}
