/**
 * BSDC — src/features/comments/CommentThread.tsx
 * Purpose : A post's comments: threaded one level, paged, live.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The thread subscribes once through the listener registry and releases on unmount, so
 *   opening and closing a post repeatedly never leaves a Firestore listener behind. Replies are
 *   nested exactly one level: deeper trees were unreadable on a 320px screen in testing, so the
 *   data model allows it and the view deliberately does not.
 *   The list virtualises past one hundred rows, which is why the container owns the scroll box.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/shared/ui/Avatar';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Spinner } from '@/shared/ui/Spinner';
import { VirtualList } from '@/shared/ui/VirtualList';
import { fromNow } from '@/shared/lib/date';
import type { Profile } from '@/entities/profile/model';
import {
  createComment,
  listComments,
  softDeleteComment,
  watchComments,
} from '@/entities/comment/repository';
import { newComment, threadComments, type Comment } from '@/entities/comment/model';
import { CommentComposer } from './CommentComposer';

/** Rows beyond which the thread virtualises. */
const VIRTUALISE_AFTER = 100;

/** Props for the comment thread. */
export interface CommentThreadProps {
  readonly postId: string;
  readonly viewer: Profile | null;
  readonly locale: 'bn' | 'en';
  readonly canModerate?: boolean | undefined;
}

/**
 * Renders a post's comments.
 * @param props thread props
 * @returns the comment thread
 */
export function CommentThread({
  postId,
  viewer,
  locale,
  canModerate = false,
}: CommentThreadProps): React.ReactElement {
  const { t } = useTranslation('comments');
  const [comments, setComments] = useState<readonly Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<'remote' | 'local'>('local');
  const [replyTo, setReplyTo] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void listComments(postId).then((page) => {
      if (!active) return;
      setComments(page.items);
      setSource(page.source);
      setLoading(false);
    });
    const release = watchComments(postId, (next) => {
      if (!active) return;
      setComments(next);
      setSource('remote');
      setLoading(false);
    });
    return () => {
      active = false;
      release();
    };
  }, [postId]);

  const threaded = useMemo(() => threadComments(comments), [comments]);
  const virtualise = threaded.length > VIRTUALISE_AFTER;

  /**
   * Posts a comment or a reply.
   * @param body the comment text
   * @param parentId the parent comment, when replying
   */
  const submit = useCallback(
    async (body: string, parentId?: string): Promise<void> => {
      if (viewer === null) return;
      const comment = newComment({
        postId,
        authorUid: viewer.uid,
        body,
        author: {
          username: viewer.username,
          displayName: viewer.displayName,
          displayNameBn: viewer.displayNameBn,
          photoUrl: viewer.photoUrl,
          role: viewer.role,
        },
        ...(parentId !== undefined ? { parentId } : {}),
      });
      setComments((current) => [...current, comment]);
      setReplyTo(null);
      await createComment(comment);
    },
    [postId, viewer],
  );

  /**
   * Removes a comment.
   * @param commentId comment id
   */
  const remove = useCallback(
    async (commentId: string): Promise<void> => {
      setComments((current) =>
        current.map((comment) =>
          comment.id === commentId ? { ...comment, deletedAt: new Date().toISOString() } : comment,
        ),
      );
      await softDeleteComment(postId, commentId);
    },
    [postId],
  );

  if (loading) {
    return (
      <div className="bsdc-comments__loading" role="status" aria-live="polite">
        <Spinner size={20} />
        <span>{t('loading')}</span>
      </div>
    );
  }

  const rows = threaded.map((entry) => ({
    root: entry.root,
    replies: entry.replies,
  }));

  return (
    <section className="bsdc-comments" aria-label={t('title')}>
      {viewer !== null ? (
        <CommentComposer author={viewer} locale={locale} onSubmit={(body) => submit(body)} />
      ) : (
        <p className="bsdc-comments__signin">{t('signInToComment')}</p>
      )}

      {source === 'local' ? (
        <p className="bsdc-comments__offline" role="status">
          {t('deviceOnly')}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          illustration="empty-state"
          title={t('emptyTitle')}
          description={t('emptyBody')}
        />
      ) : virtualise ? (
        <VirtualList
          items={rows}
          itemHeight={132}
          height={520}
          label={t('title')}
          renderItem={(entry) => (
            <CommentRow
              entry={entry}
              locale={locale}
              viewer={viewer}
              canModerate={canModerate}
              replyTo={replyTo}
              onReply={setReplyTo}
              onDelete={remove}
              onSubmitReply={(body) => submit(body, entry.root.id)}
            />
          )}
        />
      ) : (
        <ul className="bsdc-comments__list">
          {rows.map((entry) => (
            <li key={entry.root.id}>
              <CommentRow
                entry={entry}
                locale={locale}
                viewer={viewer}
                canModerate={canModerate}
                replyTo={replyTo}
                onReply={setReplyTo}
                onDelete={remove}
                onSubmitReply={(body) => submit(body, entry.root.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** One root comment and its replies. */
interface CommentRowProps {
  readonly entry: { readonly root: Comment; readonly replies: readonly Comment[] };
  readonly locale: 'bn' | 'en';
  readonly viewer: Profile | null;
  readonly canModerate: boolean;
  readonly replyTo: string | null;
  readonly onReply: (id: string | null) => void;
  readonly onDelete: (id: string) => Promise<void>;
  readonly onSubmitReply: (body: string) => Promise<void>;
}

/**
 * Renders one root comment with its replies.
 * @param props row props
 * @returns the comment row
 */
function CommentRow({
  entry,
  locale,
  viewer,
  canModerate,
  replyTo,
  onReply,
  onDelete,
  onSubmitReply,
}: CommentRowProps): React.ReactElement {
  const { t } = useTranslation('comments');
  const { root, replies } = entry;
  const isMine = viewer !== null && root.authorUid === viewer.uid;
  const removable = isMine || canModerate;

  return (
    <article className="bsdc-comment">
      <Avatar
        name={root.authorDisplayName}
        src={root.authorPhotoUrl === '' ? null : root.authorPhotoUrl}
        size="sm"
      />
      <div className="bsdc-comment__body">
        <header className="bsdc-comment__head">
          <span className="bsdc-comment__author">
            {locale === 'bn' && root.authorDisplayNameBn.length > 0
              ? root.authorDisplayNameBn
              : root.authorDisplayName}
          </span>
          <time className="bsdc-comment__time" dateTime={root.createdAt}>
            {fromNow(root.createdAt, locale)}
          </time>
        </header>
        <p className="bsdc-comment__text">{root.body}</p>
        <div className="bsdc-comment__actions">
          {viewer !== null ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => onReply(replyTo === root.id ? null : root.id)}
            >
              {t('reply')}
            </Button>
          ) : null}
          {removable ? (
            <Button type="button" variant="ghost" size="xs" onClick={() => void onDelete(root.id)}>
              {t('delete')}
            </Button>
          ) : null}
        </div>

        {replyTo === root.id && viewer !== null ? (
          <CommentComposer
            author={viewer}
            locale={locale}
            parentId={root.id}
            focusOnMount
            onCancel={() => onReply(null)}
            onSubmit={(body) => onSubmitReply(body)}
          />
        ) : null}

        {replies.length > 0 ? (
          <ul className="bsdc-comment__replies">
            {replies.map((reply) => (
              <li key={reply.id} className="bsdc-comment bsdc-comment--reply">
                <Avatar
                  name={reply.authorDisplayName}
                  src={reply.authorPhotoUrl === '' ? null : reply.authorPhotoUrl}
                  size="xs"
                />
                <div className="bsdc-comment__body">
                  <header className="bsdc-comment__head">
                    <span className="bsdc-comment__author">
                      {locale === 'bn' && reply.authorDisplayNameBn.length > 0
                        ? reply.authorDisplayNameBn
                        : reply.authorDisplayName}
                    </span>
                    <time className="bsdc-comment__time" dateTime={reply.createdAt}>
                      {fromNow(reply.createdAt, locale)}
                    </time>
                  </header>
                  <p className="bsdc-comment__text">{reply.body}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </article>
  );
}
