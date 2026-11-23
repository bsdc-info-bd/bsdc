import { CheckCircle2, Heart, MessageCircle, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { CommentForm } from '@/components/interactions/CommentForm';
import { Lightbox } from '@/components/media/Lightbox';
import { MediaImage } from '@/components/media/MediaImage';
import { Alert, Avatar, Badge, Button, EmptyState, Skeleton } from '@/design-system';
import { useComments } from '@/hooks/use-comments';
import type { CommentImage, CommentNode } from '@/lib/interactions/interaction-types';
import { cn } from '@/lib/cn';
import { formatNumber, formatRelativeTime } from '@/lib/format';
import { profilePath } from '@/lib/site';
import { dataErrorKey } from '@/lib/supabase/errors';
import { selectIsSignedIn, useAuthStore } from '@/store/auth-store';

export interface CommentThreadProps {
  postId: string;
  postAuthorUid: string;
  isQuestion: boolean;
  allowComments: boolean;
}

/** The full discussion under a post: replies up to three levels deep. */
export function CommentThread({
  postId,
  postAuthorUid,
  isQuestion,
  allowComments,
}: CommentThreadProps) {
  const { t } = useTranslation();
  const isSignedIn = useAuthStore(selectIsSignedIn);
  const thread = useComments(postId);

  if (!allowComments) {
    return <Alert tone="info" title={t('interactions.commentsClosed')} />;
  }

  return (
    <section aria-labelledby="comments-heading" className="flex flex-col gap-4">
      <h2 id="comments-heading" className="text-xl">
        {t('interactions.commentsHeading')}
      </h2>

      {isSignedIn ? (
        <CommentForm
          placeholder={t('interactions.commentPlaceholder')}
          submitLabel={t('interactions.publishComment')}
          busy={thread.isPosting}
          allowImage
          onSubmit={async (body, image) => {
            await thread.add(body, null, image);
          }}
        />
      ) : (
        <Alert tone="info" title={t('interactions.signInToComment')} />
      )}

      {thread.isLoading ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : null}

      {thread.isError ? <Alert tone="danger" title={t('interactions.commentsFailed')} /> : null}

      {!thread.isLoading && !thread.isError && thread.tree.length === 0 ? (
        <EmptyState
          icon={<MessageCircle size={22} />}
          title={t('interactions.noComments')}
          description={t('interactions.noCommentsBody')}
        />
      ) : null}

      <ul className="flex flex-col gap-3">
        {thread.tree.map((node) => (
          <li key={node.id}>
            <CommentItem
              node={node}
              thread={thread}
              postAuthorUid={postAuthorUid}
              isQuestion={isQuestion}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The picture a comment carries, at the width of the comment and no larger.
 *
 * Two details matter more than they look. The intrinsic width and height are
 * passed to the `<img>` so the browser reserves the box before the bytes arrive —
 * a thread where each picture pushes the replies below it down as it loads is a
 * thread nobody can read on a phone. And the whole thing is a button that opens
 * the same Lightbox the messenger uses, because a crack in a phone screen is not
 * visible at 320 px.
 */
function CommentPicture({ image }: { image: CommentImage }) {
  const { t } = useTranslation();
  const [enlarged, setEnlarged] = useState(false);
  const description =
    image.alt.trim().length > 0 ? image.alt : t('interactions.pictureWithoutDescription');

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => {
          setEnlarged(true);
        }}
        className="fab-tap block w-full overflow-hidden rounded-xl border border-border"
        aria-label={t('interactions.enlargePicture', { description })}
      >
        <MediaImage
          src={image.url}
          variantSrc={image.thumbUrl}
          alt={description}
          width={image.width ?? undefined}
          height={image.height ?? undefined}
          fullWidth={image.width}
          slotWidth={384}
          loading="lazy"
          decoding="async"
          className="max-h-72 w-full object-cover"
        />
      </button>
      {enlarged ? (
        <Lightbox
          items={[
            {
              id: image.url,
              url: image.url,
              thumbUrl: image.thumbUrl,
              altText: description,
              width: image.width,
              height: image.height,
            },
          ]}
          index={0}
          label={t('interactions.commentPicture')}
          onChange={() => undefined}
          onClose={() => {
            setEnlarged(false);
          }}
        />
      ) : null}
    </div>
  );
}

interface CommentItemProps {
  node: CommentNode;
  thread: ReturnType<typeof useComments>;
  postAuthorUid: string;
  isQuestion: boolean;
}

function CommentItem({ node, thread, postAuthorUid, isQuestion }: CommentItemProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const viewerUid = useAuthStore((state) => state.user?.uid ?? null);
  const isSignedIn = useAuthStore(selectIsSignedIn);
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);

  const isOwn = viewerUid !== null && node.author?.uid === viewerUid;
  const canModerate = isOwn || viewerUid === postAuthorUid;
  const canAccept = isQuestion && viewerUid === postAuthorUid && !isOwn;

  async function remove() {
    try {
      await thread.remove(node.id);
      toast.success(t('interactions.commentDeleted'), {
        description: t('interactions.commentDeletedBody'),
      });
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    }
  }

  return (
    <article
      id={`comment-${node.id}`}
      className={cn(
        'rounded-xl border border-border bg-surface p-3',
        node.isAnswer && 'border-green-500',
      )}
    >
      <div className="flex items-start gap-2">
        {node.author ? (
          <Link to={profilePath(node.author.username)} className="shrink-0">
            <Avatar src={node.author.avatarUrl} name={node.author.displayName} size="sm" />
          </Link>
        ) : (
          <Avatar name={t('interactions.unknownMember')} size="sm" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {node.author ? (
              <Link
                to={profilePath(node.author.username)}
                className="text-sm font-semibold hover:underline"
              >
                {node.author.displayName}
              </Link>
            ) : (
              <span className="text-sm font-semibold">{t('interactions.unknownMember')}</span>
            )}
            <span className="text-2xs text-muted">
              {formatRelativeTime(new Date(node.createdAt), language)}
            </span>
            {node.editedAt ? (
              <span className="text-2xs text-muted">{t('interactions.edited')}</span>
            ) : null}
            {node.isAnswer ? <Badge tone="green">{t('interactions.acceptedAnswer')}</Badge> : null}
          </div>

          {editing ? (
            <div className="mt-2">
              <CommentForm
                placeholder={t('interactions.editComment')}
                submitLabel={t('common.save')}
                // The box opens with the words that are already there.
                initialBody={node.body}
                onCancel={() => {
                  setEditing(false);
                }}
                onSubmit={async (body) => {
                  await thread.edit(node.id, body);
                  toast.success(t('interactions.commentUpdated'));
                }}
              />
            </div>
          ) : (
            <>
              {node.body.trim().length > 0 ? (
                <p className="mt-1 whitespace-pre-wrap break-words text-sm">{node.body}</p>
              ) : null}
              {node.image === null ? null : <CommentPicture image={node.image} />}
            </>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={!isSignedIn}
              aria-pressed={node.liked}
              onClick={() => {
                thread.like(node.id);
              }}
            >
              <Heart size={14} className={cn(node.liked && 'fill-current text-green-700')} />
              <span>{formatNumber(node.likes, language)}</span>
              <span className="fab-sr-only">{t('interactions.likeComment')}</span>
            </Button>

            {isSignedIn && node.depth < 3 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setReplying((value) => !value);
                }}
              >
                {t('interactions.reply')}
              </Button>
            ) : null}

            {canAccept ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  thread.accept(node.id);
                }}
              >
                <CheckCircle2 size={14} />
                {node.isAnswer ? t('interactions.unacceptAnswer') : t('interactions.acceptAnswer')}
              </Button>
            ) : null}

            {isOwn ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditing((value) => !value);
                }}
              >
                <Pencil size={14} />
                <span className="fab-sr-only">{t('common.edit')}</span>
              </Button>
            ) : null}

            {canModerate ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  void remove();
                }}
              >
                <Trash2 size={14} />
                <span className="fab-sr-only">{t('common.delete')}</span>
              </Button>
            ) : null}
          </div>

          {replying ? (
            <div className="mt-2">
              <CommentForm
                placeholder={t('interactions.replyPlaceholder')}
                submitLabel={t('interactions.publishReply')}
                allowImage
                onCancel={() => {
                  setReplying(false);
                }}
                onSubmit={async (body, image) => {
                  await thread.add(body, node.id, image);
                }}
              />
            </div>
          ) : null}

          {node.children.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-2 border-s border-border ps-3">
              {node.children.map((child) => (
                <li key={child.id}>
                  <CommentItem
                    node={child}
                    thread={thread}
                    postAuthorUid={postAuthorUid}
                    isQuestion={isQuestion}
                  />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </article>
  );
}
