/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { useTranslation } from 'react-i18next';
import { Bookmark } from 'lucide-react';
import { useBookmarks } from '@/hooks/useFeed';
import { FeedCard } from '@/components/feed/FeedCard';
import { useAuthStore } from '@/stores/authStore';
import { SEOHead } from '@/components/seo/SEOHead';
import { EmptyState } from '@/components/ui/EmptyState';
import { FeedSkeleton } from '@/components/ui/Skeleton';

export default function Bookmarks() {
  const { t } = useTranslation();
  const profile = useAuthStore((s) => s.profile);
  const { posts, loading } = useBookmarks(profile?.uid || null);

  return (
    <>
      <SEOHead title={`${t('common.readingList')} — BSDC`} description="Your saved BSDC posts." path="/bookmarks" noindex />
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-4 flex items-center gap-2 text-xl font-extrabold sm:text-2xl">
          <Bookmark className="h-6 w-6 text-brand-600" aria-hidden />
          {t('common.readingList')}
        </h1>
        {loading ? (
          <FeedSkeleton />
        ) : posts.length === 0 ? (
          <EmptyState title={t('common.empty')} body={t('post.bookmarked') ? 'Save posts to your reading list and find them here.' : ''} icon={<Bookmark className="h-16 w-16" aria-hidden />} />
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <FeedCard key={post.id} post={post} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
