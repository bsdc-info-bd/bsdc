/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { useSearchParams } from 'react-router-dom';
import { PostList } from '@/components/feed/PostList';
import { SEOHead, Breadcrumbs } from '@/components/seo/SEOHead';
import { breadcrumbSchema, itemListSchema, webPageSchema } from '@/config/seo';
import { RightRail } from '@/components/feed/RightRail';
import type { PostSort } from '@/types/post';

interface CategoryPageProps {
  routeKey: string;
  title: string;
  description: string;
  filterType?: string;
  sort?: PostSort;
}

/** Shared page shell for content-category listings (blog, qa, snippets, docs, wiki, projects, jobs, notices, explore, trending). */
export function CategoryPage({ routeKey, title, description, filterType, sort }: CategoryPageProps) {
  const [searchParams] = useSearchParams();
  const tag = searchParams.get('tag') || undefined;
  const path = `/${routeKey === 'home' ? '' : routeKey}`;

  return (
    <>
      <SEOHead
        title={`${title} — BSDC`}
        description={description}
        keywords={['bangladesh', 'developers', routeKey]}
        path={path}
        jsonLd={[
          webPageSchema(title, path, description),
          breadcrumbSchema([{ name: 'Home', url: '/' }, { name: title, url: path }]),
          itemListSchema(title, [{ name: title, url: path }]),
        ]}
      />
      <Breadcrumbs items={[{ name: 'BSDC', path: '/' }, { name: title, path: `/${routeKey}` }]} />
      <div className="flex gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="mb-4 text-xl font-extrabold sm:text-2xl">{title}</h1>
          <PostList sort={sort} filterType={filterType} tagFilter={tag} emptyTitle={undefined} emptyBody={undefined} />
        </div>
        <RightRail />
      </div>
    </>
  );
}

export function ExplorePage() {
  return <CategoryPage routeKey="explore" title="Explore" description="Discover the best of the Bangladesh Software Development Community — posts, questions, code and projects." />;
}

export function TrendingPage() {
  return <CategoryPage routeKey="trending" title="Trending" description="The fastest-rising posts in Bangladesh's developer community right now." sort="trending" />;
}

export function BlogPage() {
  return <CategoryPage routeKey="blog" title="Blog" description="Long-form articles and engineering blogs from Bangladeshi developers." filterType="blog" />;
}

export function QaPage() {
  return <CategoryPage routeKey="qa" title="Q&A" description="Ask questions and share answers with the Bangladesh Software Development Community." filterType="qa" />;
}

export function SnippetsPage() {
  return <CategoryPage routeKey="snippets" title="Code Snippets" description="Reusable code snippets in 50+ languages, shared by Bangladeshi developers." filterType="snippet" />;
}

export function DocsPage() {
  return <CategoryPage routeKey="docs" title="Documentation" description="Community-built technical documentation and guides." filterType="docs" />;
}

export function WikiPage() {
  return <CategoryPage routeKey="wiki" title="Wiki" description="The editable knowledge base of the Bangladesh Software Development Community." filterType="wiki" />;
}

export function ProjectsPage() {
  return <CategoryPage routeKey="projects" title="Projects" description="Project showcases from Bangladesh's software builders." filterType="project" />;
}

export function JobsPage() {
  return <CategoryPage routeKey="jobs" title="Jobs" description="Remote, on-site and hybrid software jobs for Bangladeshi developers." filterType="job" />;
}

export function NoticesPage() {
  return <CategoryPage routeKey="notices" title="Notices" description="Official notices and announcements from the BSDC team." filterType="notice" />;
}
