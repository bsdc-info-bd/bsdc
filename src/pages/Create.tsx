/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PostComposer } from '@/components/post/PostComposer';
import { SEOHead, Breadcrumbs } from '@/components/seo/SEOHead';
import type { PostType } from '@/types/post';

export default function CreatePost() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const typeParam = searchParams.get('type') as PostType | null;
  const validTypes: PostType[] = ['text', 'image', 'blog', 'qa', 'snippet', 'docs', 'wiki', 'project', 'job', 'notice', 'poll'];
  const initialType = typeParam && validTypes.includes(typeParam) ? typeParam : undefined;

  return (
    <>
      <SEOHead title={`${t('post.newPost')} — BSDC`} description="Create a post on BSDC." path="/create" noindex />
      <div className="mx-auto max-w-3xl">
        <Breadcrumbs items={[{ name: 'BSDC', path: '/' }, { name: t('post.create'), path: '/create' }]} />
        <PostComposer initialType={initialType} />
      </div>
    </>
  );
}
