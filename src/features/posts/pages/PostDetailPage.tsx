import { useParams } from 'react-router-dom';
import { Seo } from '@/components/seo';
import { FeedSkeleton } from '@/components/ui';

export default function PostDetailPage() {
  const { slug } = useParams<{ slug: string }>();

  return (
    <>
      <Seo title="Post" description="Loading post..." />
      <div className="max-w-3xl mx-auto py-6 px-4">
        <FeedSkeleton count={1} />
        <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-4">
          Post &quot;{slug}&quot; will be loaded from Firebase when configured.
        </p>
      </div>
    </>
  );
}
