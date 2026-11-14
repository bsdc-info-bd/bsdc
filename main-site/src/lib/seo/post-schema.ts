import type { Post } from '@/lib/content/post-repository';
import type { Comment } from '@/lib/interactions/interaction-types';
import { clipText, pruneJsonLd } from '@/lib/seo/engine';
import { profilePath, SITE } from '@/lib/site';

const JSON_LD_TYPE: Record<string, string> = {
  article: 'Article',
  question: 'QAPage',
  snippet: 'TechArticle',
  post: 'DiscussionForumPosting',
  poll: 'DiscussionForumPosting',
  media: 'DiscussionForumPosting',
};

function authorNode(
  author: { readonly username: string; readonly displayName: string } | null | undefined,
  origin: string,
): Record<string, unknown> | undefined {
  if (!author) return undefined;
  const profile = profilePath(author.username);
  return pruneJsonLd({
    '@type': 'Person',
    name: author.displayName,
    url: `${origin}${profile}`,
  });
}

function answerNode(comment: Comment, postUrl: string, origin: string): Record<string, unknown> {
  return pruneJsonLd({
    '@type': 'Answer',
    text: comment.body,
    datePublished: comment.createdAt,
    ...(comment.editedAt ? { dateModified: comment.editedAt } : {}),
    upvoteCount: comment.likes,
    url: `${postUrl}#comment-${comment.id}`,
    author: authorNode(comment.author, origin),
  });
}

/**
 * Builds valid schema.org JSON-LD for a community post page.
 *
 * `question` posts emit a compliant `QAPage` with a `Question` `mainEntity`
 * (including `acceptedAnswer` / `suggestedAnswer` from top-level replies),
 * while articles, snippets, and discussions emit `Article`, `TechArticle`, or
 * `DiscussionForumPosting`.
 */
export function buildPostJsonLd(
  post: Post,
  comments: readonly Comment[] = [],
  origin: string = SITE.url,
): Record<string, unknown> {
  const base = origin.replace(/\/+$/, '');
  const url = `${base}/p/${post.slug}`;
  const published = post.publishedAt ?? post.createdAt;
  const modified = post.editedAt ?? published;
  const headline =
    post.title.trim().length > 0
      ? clipText(post.title, 110)
      : clipText(post.excerpt || post.body, 110);
  const images = [
    ...(post.coverUrl.trim().length > 0 ? [post.coverUrl.trim()] : []),
    ...post.media.map((item) => item.url).filter((item) => item.length > 0),
  ].slice(0, 5);
  const postAuthor = authorNode(post.author, base);

  if (post.kind === 'question') {
    const topLevelAnswers = comments.filter((comment) => comment.parentId === null);
    const accepted = topLevelAnswers.find((comment) => comment.isAnswer) ?? null;
    const suggested = topLevelAnswers
      .filter((comment) => accepted === null || comment.id !== accepted.id)
      .slice(0, 10);

    return pruneJsonLd({
      '@type': 'QAPage',
      '@id': `${url}#qapage`,
      url,
      inLanguage: post.language,
      mainEntity: {
        '@type': 'Question',
        name: headline,
        text: post.body.trim().length > 0 ? post.body.trim() : post.excerpt,
        answerCount: Math.max(post.comments, topLevelAnswers.length),
        upvoteCount: post.likes,
        datePublished: published,
        dateModified: modified,
        author: postAuthor,
        ...(images.length > 0 ? { image: images } : {}),
        ...(accepted !== null ? { acceptedAnswer: answerNode(accepted, url, base) } : {}),
        ...(suggested.length > 0
          ? { suggestedAnswer: suggested.map((comment) => answerNode(comment, url, base)) }
          : {}),
      },
    });
  }

  const schemaType = JSON_LD_TYPE[post.kind] ?? 'DiscussionForumPosting';

  return pruneJsonLd({
    '@type': schemaType,
    '@id': `${url}#post`,
    headline,
    description: post.excerpt,
    ...(schemaType === 'DiscussionForumPosting' && post.body.trim().length > 0
      ? { text: clipText(post.body, 1000) }
      : {}),
    datePublished: published,
    dateModified: modified,
    inLanguage: post.language,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    keywords: post.tags.join(', '),
    commentCount: post.comments,
    ...(images.length > 0 ? { image: images } : {}),
    author: postAuthor,
    publisher: { '@id': `${base}/#organization` },
    ...(schemaType === 'DiscussionForumPosting'
      ? {
          interactionStatistic: [
            {
              '@type': 'InteractionCounter',
              interactionType: 'https://schema.org/LikeAction',
              userInteractionCount: post.likes,
            },
            {
              '@type': 'InteractionCounter',
              interactionType: 'https://schema.org/CommentAction',
              userInteractionCount: post.comments,
            },
          ],
        }
      : {}),
  });
}
