/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Pencil, ThumbsUp, Trash2, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import type { Comment, Post } from '@/types/post';
import type { ReactionType } from '@/types/common';
import { Avatar } from '@/components/ui/Avatar';
import { VerifiedBadge } from '@/components/ui/Badge';
import { Textarea } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ReactionPicker } from '@/components/feed/ReactionBar';
import {
  acceptAnswer, addComment, deleteComment, editComment, getMyReaction, setCommentReaction,
} from '@/lib/data';
import { cn, timeAgo } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { Markdown } from '@/components/ui/Markdown';

export interface CommentNode extends Comment {
  accepted?: boolean;
  children: CommentNode[];
}

function buildCommentTree(comments: Comment[], acceptedId: string | null): CommentNode[] {
  const byId = new Map<string, CommentNode>();
  const roots: CommentNode[] = [];
  for (const c of comments) {
    byId.set(c.id, { ...c, accepted: c.id === acceptedId, children: [] });
  }
  for (const node of byId.values()) {
    if (node.parentCommentId && byId.has(node.parentCommentId) && node.depth <= 5) {
      byId.get(node.parentCommentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export function CommentSection({ post }: { post: Post }) {
  const { t } = useTranslation();
  const profile = useAuthStore((s) => s.profile);
  const navigate = useNavigate();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [acceptedId, setAcceptedId] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void import('@/lib/data').then(({ fetchComments }) => fetchComments(post.id))
      .then((list) => {
        if (cancelled) return;
        setComments(list);
      })
      .catch(() => undefined)
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [post.id]);

  async function submitTopLevel() {
    if (!profile) {
      navigate('/login');
      return;
    }
    const text = body.trim();
    if (!text) return;
    setSending(true);
    try {
      const created = await addComment(post, profile, text, null);
      setComments((prev) => [...prev, created]);
      setBody('');
      toast.success('Comment posted');
    } catch {
      toast.error('Could not post comment');
    } finally {
      setSending(false);
    }
  }

  const tree = buildCommentTree(comments, acceptedId);
  const total = comments.filter((c) => !c.deleted).length;

  return (
    <section aria-label={t('post.comments')} className="bsdc-surface mt-4">
      <h2 className="flex items-center gap-2 border-b border-surface-light-border p-4 text-base font-bold dark:border-surface-dark-border">
        <MessageSquare className="h-5 w-5 text-brand-600" aria-hidden />
        {t('post.comments')}
        <span className="ml-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-bold text-neutral-500 dark:bg-neutral-800">
          {total}
        </span>
      </h2>
      <div className="p-4">
        <div className="mb-6 flex gap-3">
          <Avatar src={profile?.avatar} name={profile?.displayName || 'Guest'} size={36} />
          <div className="min-w-0 flex-1">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={profile ? t('post.commentPlaceholder') : `${t('common.login')} to comment`}
              minRows={2}
              maxRows={6}
              disabled={!profile}
            />
            {body.trim() ? (
              <div className="mt-2 flex justify-end">
                <Button size="sm" loading={sending} onClick={() => void submitTopLevel()}>
                  {t('post.comment')}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
        {loading ? (
          <p className="py-4 text-center text-sm text-neutral-400">{t('common.loading')}</p>
        ) : tree.length === 0 ? (
          <p className="py-6 text-center text-sm text-neutral-400">{t('common.empty')}</p>
        ) : (
          <ul className="space-y-5">
            {tree.map((node) => (
              <CommentItem key={node.id} node={node} post={post} onAdd={setComments} onAccept={(id) => setAcceptedId(id)} isQuestionAuthor={post.type === 'qa'} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function CommentItem({
  node,
  post,
  onAdd,
  onAccept,
  isQuestionAuthor,
}: {
  node: CommentNode;
  post: Post;
  onAdd: (setter: (prev: Comment[]) => Comment[]) => void;
  onAccept: (id: string) => void;
  isQuestionAuthor: boolean;
}) {
  const { t } = useTranslation();
  const profile = useAuthStore((s) => s.profile);
  const language = useUIStore((s) => s.language);
  const navigate = useNavigate();
  const [replying, setReplying] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(node.body);
  const [reaction, setReaction] = useState<ReactionType | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (profile) void getMyReaction(node.id, profile.uid).then(setReaction);
  }, [profile, node.id]);

  async function submitReply() {
    if (!profile) {
      navigate('/login');
      return;
    }
    const text = replyBody.trim();
    if (!text) return;
    try {
      const created = await addComment(post, profile, text, node);
      onAdd((prev) => [...prev, created]);
      setReplyBody('');
      setReplying(false);
    } catch {
      toast.error('Could not post reply');
    }
  }

  async function saveEdit() {
    const text = editBody.trim();
    if (!text) return;
    await editComment(node.id, text);
    onAdd((prev) => prev.map((c) => (c.id === node.id ? { ...c, body: text, edited: true } : c)));
    setEditing(false);
  }

  return (
    <li className="min-w-0">
      <div className="flex gap-2.5">
        <Link to={`/p/${node.authorUsername}`} aria-label={`${node.authorName} profile`}>
          <Avatar src={node.authorAvatar} name={node.authorName} size={34} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="rounded-xl bg-neutral-50 px-3.5 py-2.5 dark:bg-surface-dark-raised">
            <div className="mb-1 flex flex-wrap items-center gap-x-1.5 text-sm">
              <Link to={`/p/${node.authorUsername}`} className="font-bold hover:underline">
                {node.authorName}
              </Link>
              {node.authorVerified ? <VerifiedBadge size={13} /> : null}
              <span className="text-xs text-neutral-400">
                @{node.authorUsername} · {timeAgo(node.createdAt, language)}
              </span>
              {node.accepted ? (
                <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700 dark:bg-green-950/60 dark:text-green-300">
                  <CheckCircle2 className="h-3 w-3" aria-hidden />
                  {t('post.accepted')}
                </span>
              ) : null}
            </div>
            {editing ? (
              <div className="mt-1">
                <Textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} minRows={2} maxRows={8} />
                <div className="mt-2 flex justify-end gap-2">
                  <Button size="xs" variant="ghost" onClick={() => setEditing(false)}>
                    {t('common.cancel')}
                  </Button>
                  <Button size="xs" onClick={() => void saveEdit()}>
                    {t('common.save')}
                  </Button>
                </div>
              </div>
            ) : node.deleted ? (
              <p className="text-sm italic text-neutral-400">[deleted]</p>
            ) : (
              <Markdown content={node.body} className="text-sm" />
            )}
            {node.edited && !editing ? <p className="mt-0.5 text-[10px] italic text-neutral-400">{t('chat.edited')}</p> : null}
          </div>
          <div className="mt-1 flex items-center gap-1 pl-1">
            <span className="relative flex">
              <button
                type="button"
                aria-label={t('post.reactions.like')}
                onClick={async () => {
                  if (!profile) {
                    navigate('/login');
                    return;
                  }
                  if (reaction) {
                    setReaction(null);
                  } else {
                    await setCommentReaction(node, profile, 'like');
                    setReaction('like');
                  }
                }}
                className={cn('bsdc-tap flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold', reaction ? 'text-fb-600' : 'text-neutral-400 hover:bg-neutral-100 dark:hover:bg-surface-dark-raised')}
              >
                <ThumbsUp className="h-3.5 w-3.5" aria-hidden fill={reaction === 'like' ? 'currentColor' : 'none'} />
                {node.reactionTotal > 0 ? node.reactionTotal : ''}
              </button>
              <span className="group/th relative">
                <button
                  type="button"
                  aria-label="Add reaction"
                  onClick={() => setPickerOpen((v) => !v)}
                  className="hidden h-6 w-6 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 group-hover/th:flex dark:hover:bg-surface-dark-raised"
                >
                  +
                </button>
                {pickerOpen ? (
                  <span className="absolute bottom-8 left-0 z-20">
                    <ReactionPicker
                      onSelect={async (type) => {
                        setPickerOpen(false);
                        if (!profile) return;
                        await setCommentReaction(node, profile, type);
                        setReaction(type);
                      }}
                    />
                  </span>
                ) : null}
              </span>
            </span>
            {node.depth < 5 ? (
              <button
                type="button"
                onClick={() => setReplying((v) => !v)}
                className="bsdc-tap rounded-md px-2 py-1 text-xs font-semibold text-neutral-400 hover:bg-neutral-100 hover:text-brand-600 dark:hover:bg-surface-dark-raised"
              >
                {t('post.reply')}
              </button>
            ) : null}
            {isQuestionAuthor && profile?.uid === post.authorId && !node.accepted ? (
              <button
                type="button"
                onClick={async () => {
                  await acceptAnswer(post, node);
                  onAccept(node.id);
                  toast.success('Answer accepted');
                }}
                className="bsdc-tap rounded-md px-2 py-1 text-xs font-semibold text-green-600 hover:bg-green-50 dark:hover:bg-green-950/40"
              >
                <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" aria-hidden />
                {t('post.acceptAnswer')}
              </button>
            ) : null}
            {profile && (profile.uid === node.authorId) ? (
              <span className="ml-auto flex items-center">
                <button
                  type="button"
                  aria-label={t('common.edit')}
                  onClick={() => setEditing(true)}
                  className="bsdc-tap rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-surface-dark-raised"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={t('common.delete')}
                  onClick={async () => {
                    await deleteComment(node);
                    onAdd((prev) => prev.map((c) => (c.id === node.id ? { ...c, deleted: true, body: '' } : c)));
                  }}
                  className="bsdc-tap rounded-md p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </span>
            ) : null}
          </div>
          {replying ? (
            <div className="mt-2 flex gap-2">
              <Avatar src={profile?.avatar} name={profile?.displayName || 'Guest'} size={28} />
              <div className="min-w-0 flex-1">
                <Textarea value={replyBody} onChange={(e) => setReplyBody(e.target.value)} placeholder={t('post.replyPlaceholder')} minRows={1} maxRows={4} autoFocus />
                <div className="mt-1.5 flex justify-end gap-2">
                  <Button size="xs" variant="ghost" onClick={() => setReplying(false)}>
                    {t('common.cancel')}
                  </Button>
                  <Button size="xs" onClick={() => void submitReply()}>
                    {t('post.reply')}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
          {node.children.length > 0 ? (
            <ul className="mt-4 space-y-4 border-l border-surface-light-border pl-4 dark:border-surface-dark-border sm:pl-6">
              {node.children.map((child) => (
                <CommentItem key={child.id} node={child} post={post} onAdd={onAdd} onAccept={onAccept} isQuestionAuthor={isQuestionAuthor} />
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </li>
  );
}

