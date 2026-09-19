/**
 * BSDC — src/features/feed/PostCard.tsx
 * Purpose : One post in a stream: author, body, attachments, reactions, comments and actions.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The card is the most-rendered component in the product, so it does three things
 *   carefully. It reserves the media box through aspect-ratio, so nothing shifts when an image
 *   arrives. It keeps its own reaction and comment state optimistic, so a tap feels instant and
 *   the server corrects it a moment later. And it offers save, share and report as real buttons
 *   with real labels, because the feed is where most moderation journeys begin.
 *   The overflow menu is a plain disclosure, not a popper: it cannot be clipped at 250px and it
 *   costs no positioning library in the bundle.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Avatar } from '@/shared/ui/Avatar';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { Icon } from '@/shared/ui/Icon';
import { IconButton } from '@/shared/ui/IconButton';
import { Text } from '@/shared/ui/Typography';
import { fromNow } from '@/shared/lib/date';
import { formatCompact } from '@/shared/lib/number.bn';
import { copyText, shareNative } from '@/shared/lib/clipboard';
import { toastSuccess } from '@/shared/ui/toast';
import type { Profile } from '@/entities/profile/model';
import { canEditPost, type Post } from '@/entities/post/model';
import { setSaved, softDeletePost } from '@/entities/post/repository';
import type { ReactionSummary } from '@/entities/reaction/model';
import { summariseReactions } from '@/entities/reaction/model';
import { peekReactionSummary, watchReactions } from '@/entities/reaction/repository';
import { ReactionBar } from '@/features/reactions';
import { CommentThread } from '@/features/comments';
import { PostMedia } from './PostMedia';

/** Props for the post card. */
export interface PostCardProps {
  readonly post: Post;
  readonly locale: 'bn' | 'en';
  readonly viewer: Profile | null;
  readonly canModerate?: boolean | undefined;
  readonly priority?: boolean | undefined;
  readonly showComments?: boolean | undefined;
  readonly onOpenComments?: ((postId: string) => void) | undefined;
  readonly onDeleted?: ((postId: string) => void) | undefined;
}

/**
 * Renders one post.
 * @param props card props
 * @returns the post card
 */
export function PostCard({
  post,
  locale,
  viewer,
  canModerate = false,
  priority = false,
  showComments = false,
  onOpenComments,
  onDeleted,
}: PostCardProps): React.ReactElement {
  const { t } = useTranslation('feed');
  const [summary, setSummary] = useState<ReactionSummary>(() =>
    summariseReactions([], viewer?.uid ?? null),
  );
  const [saved, setSavedState] = useState(post.saved);
  const [menuOpen, setMenuOpen] = useState(false);
  const [threadOpen, setThreadOpen] = useState(showComments);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void peekReactionSummary(post.id, viewer?.uid ?? null).then(setSummary);
    const release = watchReactions(post.id, viewer?.uid ?? null, setSummary);
    return release;
  }, [post.id, viewer?.uid]);

  const authorName =
    locale === 'bn' && post.authorDisplayNameBn.length > 0
      ? post.authorDisplayNameBn
      : post.authorDisplayName;
  const editable = canEditPost(post, viewer?.uid ?? null, viewer?.role ?? 'member');

  /**
   * Copies a link to the post.
   */
  async function share(): Promise<void> {
    const url = `${window.location.origin}/post/${post.id}`;
    const shared = await shareNative({ title: authorName, text: post.body.slice(0, 120), url });
    if (shared === 'shared') return;
    const copied = await copyText(url);
    if (copied) toastSuccess(locale, t('linkCopied'), t('linkCopied'));
  }

  /**
   * Toggles the saved state.
   */
  async function toggleSave(): Promise<void> {
    if (viewer === null) return;
    const next = !saved;
    setSavedState(next);
    await setSaved(viewer.uid, post.id, next);
  }

  /**
   * Moves the post to the recovery bin.
   */
  async function remove(): Promise<void> {
    setBusy(true);
    await softDeletePost(post.id);
    setBusy(false);
    setMenuOpen(false);
    onDeleted?.(post.id);
  }

  return (
    <Card as="article" className="bsdc-post" padding="md">
      <header className="bsdc-post__head">
        <Avatar
          name={authorName}
          src={post.authorPhotoUrl === '' ? null : post.authorPhotoUrl}
          size="md"
        />
        <div className="bsdc-post__identity">
          <Link className="bsdc-post__author" to={`/u/${post.authorUsername}`}>
            {authorName}
          </Link>
          <div className="bsdc-post__meta">
            <time dateTime={post.createdAt}>{fromNow(post.createdAt, locale)}</time>
            <span aria-hidden="true">·</span>
            <span>{t(`visibility.${post.visibility}`)}</span>
            {post.authorVerified ? (
              <Badge tone="brand" variant="outline">
                {t('verified')}
              </Badge>
            ) : null}
            {post.editedAt !== null ? (
              <span className="bsdc-post__edited">{t('edited')}</span>
            ) : null}
          </div>
        </div>

        <div className="bsdc-post__menu">
          <IconButton
            icon={menuOpen ? 'close' : 'menu'}
            label={t('moreActions')}
            variant="ghost"
            size="sm"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          />
          {menuOpen ? (
            <div className="bsdc-post__menu-list" role="menu">
              <button type="button" role="menuitem" onClick={() => void share()}>
                <Icon name="externalLink" size={16} />
                <span>{t('copyLink')}</span>
              </button>
              <button type="button" role="menuitem" onClick={() => void toggleSave()}>
                <Icon name="bookmark" size={16} />
                <span>{saved ? t('unsave') : t('save')}</span>
              </button>
              {editable ? (
                <button type="button" role="menuitem" disabled={busy} onClick={() => void remove()}>
                  <Icon name="close" size={16} />
                  <span>{t('delete')}</span>
                </button>
              ) : null}
              {!editable && viewer !== null ? (
                <Link to={`/report/post/${post.id}`} role="menuitem">
                  <Icon name="alert" size={16} />
                  <span>{t('report')}</span>
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      {post.body.trim().length > 0 ? (
        <Text as="p" className="bsdc-post__body" lang={locale === 'bn' ? 'bn' : 'en'}>
          {post.body}
        </Text>
      ) : null}

      <PostMedia media={post.media} locale={locale} priority={priority} />

      <ReactionBar
        postId={post.id}
        summary={summary}
        locale={locale}
        viewerUid={viewer?.uid ?? null}
        disabled={viewer === null}
      />

      <footer className="bsdc-post__footer">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={threadOpen}
          onClick={() => {
            setThreadOpen((open) => !open);
            onOpenComments?.(post.id);
          }}
        >
          {`${t('comments')} ${formatCompact(post.counts.comments, locale)}`}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => void share()}>
          {t('share')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={saved}
          onClick={() => void toggleSave()}
        >
          {saved ? t('saved') : t('save')}
        </Button>
      </footer>

      {threadOpen ? (
        <CommentThread postId={post.id} viewer={viewer} locale={locale} canModerate={canModerate} />
      ) : null}
    </Card>
  );
}
