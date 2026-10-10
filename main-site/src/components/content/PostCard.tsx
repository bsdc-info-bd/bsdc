import { Clock, Eye, MessageSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { MediaGallery } from '@/components/media/MediaGallery';
import { Avatar, Badge, Card, Chip } from '@/design-system';
import type { Post } from '@/lib/content/post-repository';
import { placementFor } from '@/lib/media/arrangement';
import { toGalleryItems } from '@/lib/media/gallery-items';
import { formatNumber, formatRelativeTime } from '@/lib/format';
import { profilePath } from '@/lib/site';

/** Feed and listing representation of a post. Never renders raw markdown. */
export function PostCard({ post }: { post: Post }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const when = post.publishedAt ?? post.createdAt;
  const gallery = toGalleryItems(post.media);
  // One picture is the card's header and goes first, edge to edge; a set of
  // them is content, and stays in the body where a grid does not fight the
  // byline for the reader's first look.
  const placement = placementFor(post.media);
  const galleryLabel = t('media.gallery.postImages');

  return (
    <Card as="article" interactive>
      {placement === 'header' ? (
        <MediaGallery items={gallery} flush priority label={galleryLabel} className="mb-3" />
      ) : null}

      <div className="flex items-center gap-2">
        {post.author ? (
          <>
            <Link to={profilePath(post.author.username)} className="shrink-0">
              <Avatar src={post.author.avatarUrl} name={post.author.displayName} size="sm" />
            </Link>
            <div className="min-w-0">
              <Link
                to={profilePath(post.author.username)}
                className="fab-truncate block text-sm font-semibold hover:underline"
              >
                {post.author.displayName}
              </Link>
              <p className="text-2xs text-muted">{formatRelativeTime(new Date(when), language)}</p>
            </div>
          </>
        ) : null}
        <Badge tone="neutral" className="ms-auto">
          {t(`compose.kinds.${post.kind}`)}
        </Badge>
      </div>

      <Link to={`/p/${post.slug}`} className="mt-3 block">
        {post.title.length > 0 ? (
          <h3 className="text-lg font-semibold hover:underline">{post.title}</h3>
        ) : null}
        <p className="mt-1 text-sm text-muted">{post.excerpt}</p>
      </Link>

      {placement === 'body' ? (
        <MediaGallery items={gallery} label={galleryLabel} className="mt-3" />
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-3 text-2xs text-muted">
        <span className="inline-flex items-center gap-1">
          <Clock size={13} aria-hidden="true" />
          {t('post.readingTime', { minutes: formatNumber(post.readingTime, language) })}
        </span>
        <span className="inline-flex items-center gap-1">
          <Eye size={13} aria-hidden="true" />
          {formatNumber(post.views, language)}
        </span>
        <span className="inline-flex items-center gap-1">
          <MessageSquare size={13} aria-hidden="true" />
          {formatNumber(post.comments, language)}
        </span>
        {post.tags.slice(0, 3).map((tag) => (
          <Link key={tag} to={`/tag/${tag}`}>
            <Chip>#{tag}</Chip>
          </Link>
        ))}
      </div>
    </Card>
  );
}
