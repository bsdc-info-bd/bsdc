import { Clock, Eye, MessageSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { MediaGallery } from '@/components/media/MediaGallery';
import { Avatar, Badge, Chip } from '@/design-system';
import { cn } from '@/lib/cn';
import type { Post } from '@/lib/content/post-repository';
import { formatNumber, formatRelativeTime } from '@/lib/format';
import { placementFor } from '@/lib/media/arrangement';
import { toGalleryItems } from '@/lib/media/gallery-items';
import { isRepairableMediaHost } from '@/lib/media/hosts';
import { profilePath } from '@/lib/site';

function safeCoverUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:') return parsed.toString();
    if (parsed.protocol.startsWith('http') && isRepairableMediaHost(parsed.hostname)) {
      parsed.protocol = 'https:';
      return parsed.toString();
    }
    return '';
  } catch {
    return '';
  }
}

/**
 * One post, as a reader meets it in the feed.
 *
 * The shape is dev.to's, because it is the shape that survived contact with a
 * developer audience: a small avatar and a name with the date beside it, a title
 * that is the largest type in the card and is the link, tags as `#hashtags` in the
 * accent colour, and the counters as quiet metadata at the bottom. No card inside
 * a card, no shadow on a hover that does not respond, no "read more" on a card
 * that is already a link.
 *
 * Two things it does that the reference does not:
 *
 *   - The picture is fetched at the width the card draws it, so a feed of twenty
 *     cards is not twenty multi-megabyte originals. That is not decoration; it is
 *     the difference between a feed that opens in half a second and one that
 *     opens in six.
 *   - The whole card is not a link. Only the title is, plus the author and the
 *     tags. A card that is one big anchor cannot contain a working avatar link, and
 *     it makes selecting the excerpt text a lottery.
 */
export function PostCard({ post, priority = false }: { post: Post; priority?: boolean }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const when = post.publishedAt ?? post.createdAt;
  /**
   * A post's pictures, or its cover when it has no pictures yet.
   *
   * `cover_url` was uploaded, stored, preloaded in the home page's `<head>` at
   * `fetchpriority="high"` — and never drawn, because only `media` rows were
   * rendered. So every visit to the feed downloaded a full-size cover that no
   * element displayed, on the same connection the visible pictures were waiting
   * for, and an author who set a cover saw it nowhere. One image, one place.
   */
  const gallery = toGalleryItems(post.media);
  const cover = safeCoverUrl(post.coverUrl);
  const pictures =
    gallery.length > 0
      ? gallery
      : cover.length > 0
        ? [
            {
              id: `cover-${post.id}`,
              url: cover,
              thumbUrl: cover,
              // The title is what the picture illustrates, and a decorative
              // empty alt would make the cover invisible to a screen reader on a
              // card whose only picture it is.
              altText: post.title.trim(),
              width: null,
              height: null,
            },
          ]
        : [];
  // One picture is the card's header and goes first, edge to edge; a set of
  // them is content, and stays in the body where a grid does not fight the
  // title for attention.
  const placement = placementFor(pictures);
  const galleryLabel = t('media.gallery.postImages');

  return (
    <article
      className={cn(
        'group relative rounded-card border border-border bg-surface transition-colors duration-150 ease-app',
        'hover:border-green-300 dark:hover:border-green-800',
      )}
    >
      {placement === 'header' ? (
        <div className="overflow-hidden rounded-t-card">
          <MediaGallery items={pictures} flush priority={priority} label={galleryLabel} />
        </div>
      ) : null}

      <div className="p-4 sm:p-5">
        <div className="flex items-center gap-2">
          {post.author ? (
            <>
              <Link to={profilePath(post.author.username)} className="shrink-0">
                <Avatar src={post.author.avatarUrl} name={post.author.displayName} size="sm" />
              </Link>
              <div className="min-w-0">
                <Link
                  to={profilePath(post.author.username)}
                  className="block truncate text-sm font-semibold hover:text-green-700 hover:underline dark:hover:text-green-300"
                >
                  {post.author.displayName}
                </Link>
                <p className="text-2xs text-muted">
                  {formatRelativeTime(new Date(when), language)}
                </p>
              </div>
            </>
          ) : null}
          <Badge tone="neutral" className="ms-auto shrink-0">
            {t(`compose.kinds.${post.kind}`)}
          </Badge>
        </div>

        <div className="mt-3">
          {post.title.length > 0 ? (
            <h2 className="text-xl font-bold leading-snug tracking-tight sm:text-2xl">
              <Link
                to={`/p/${post.slug}`}
                className="rounded-sm transition-colors duration-150 ease-app hover:text-green-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 dark:hover:text-green-300"
              >
                {post.title}
              </Link>
            </h2>
          ) : null}
          {/* A titleless post still needs a way in, so the excerpt carries the
              link. Only one of the two is ever a link, so a screen reader is not
              read the same sentence twice. */}
          {post.excerpt.length > 0 ? (
            post.title.length > 0 ? (
              <p className="mt-1.5 line-clamp-3 text-sm text-muted">{post.excerpt}</p>
            ) : (
              <Link
                to={`/p/${post.slug}`}
                className="mt-1.5 line-clamp-3 block text-sm text-muted hover:text-foreground"
              >
                {post.excerpt}
              </Link>
            )
          ) : null}
        </div>

        {placement === 'body' ? (
          <MediaGallery
            items={pictures}
            priority={priority}
            label={galleryLabel}
            className="mt-3"
          />
        ) : null}

        {/* Tags below the text, as hashtags, which is how a developer scans for a
            subject they care about without reading the excerpt. */}
        {post.tags.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
            {post.tags.slice(0, 4).map((tag) => (
              <li key={tag}>
                <Link
                  to={`/tag/${tag}`}
                  className="text-xs font-medium text-muted transition-colors duration-150 ease-app hover:text-green-700 dark:hover:text-green-300"
                >
                  #{tag}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-4 text-2xs text-muted">
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
          {post.kind === 'question' ? (
            <Chip>
              <Link to={`/p/${post.slug}`}>{t('feed.answer', { defaultValue: 'Answer it' })}</Link>
            </Chip>
          ) : null}
        </div>
      </div>
    </article>
  );
}
