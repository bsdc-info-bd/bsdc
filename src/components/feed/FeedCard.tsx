/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  MessageSquare, Share2, Bookmark, BookmarkCheck, MoreHorizontal, Flag, Pencil, Trash2,
  Pin, Eye, Clock, MapPin, Briefcase, DollarSign, Star, GitBranch, ExternalLink, Megaphone, Code2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Post } from '@/types/post';
import type { ReactionType } from '@/types/common';
import { Avatar } from '@/components/ui/Avatar';
import { VerifiedBadge, RoleBadge } from '@/components/ui/Badge';
import { ReactionButton } from './ReactionBar';
import { POST_TYPE_META } from './postMeta';
import {
  getMyReaction, hasVoted, postRouteOf, removeReaction, setReaction, softDeletePost,
  toggleBookmark, updatePost, votePoll,
} from '@/lib/data';
import { copyToClipboard, formatCurrency, formatNumber, timeAgo, truncate, cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { roleAtLeast } from '@/types/user';
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from '@/components/ui/Dropdown';
import { ConfirmDialog } from '@/components/ui/Modal';
import { Markdown } from '@/components/ui/Markdown';
import { Lightbox } from 'yet-another-react-lightbox';
import type { UserRole } from '@/types/user';

export function FeedCard({ post, onDeleted, onEdited }: { post: Post; onDeleted?: (id: string) => void; onEdited?: (post: Post) => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const language = useUIStore((s) => s.language);
  const [reaction, setReactionState] = useState<ReactionType | null>(null);
  const [reactionLoaded, setReactionLoaded] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const [deleted, setDeleted] = useState(false);
  const [voted, setVoted] = useState<string | null>(null);

  const detailUrl = `/${postRouteOf(post.type)}/${post.slug}`;
  const typeMeta = POST_TYPE_META[post.type];

  useEffect(() => {
    if (!profile || reactionLoaded) return;
    setReactionLoaded(true);
    void getMyReaction(post.id, profile.uid).then((r) => setReactionState(r));
    if (post.poll) void hasVoted(post.id, profile.uid).then((v) => setVoted(v));
  }, [profile, post.id, reactionLoaded, post.poll]);

  if (deleted) return null;

  async function handleReact(type: ReactionType) {
    if (!profile) {
      navigate('/login');
      return;
    }
    setReactionState(type);
    try {
      await setReaction(post, profile, type);
      onEdited?.({ ...post, reactionTotal: post.reactionTotal + 1 });
    } catch {
      setReactionState(null);
      toast.error('Could not save reaction');
    }
  }

  async function handleRemoveReaction() {
    if (!profile || !reaction) return;
    setReactionState(null);
    try {
      await removeReaction(post, profile.uid);
    } catch {
      setReactionState(reaction);
    }
  }

  async function handleShare() {
    const url = `${window.location.origin}${detailUrl}`;
    await copyToClipboard(url);
    toast.success(t('post.shareLinkCopied'));
    void updatePost(post.id, {}).catch(() => undefined);
  }

  async function handleBookmark() {
    if (!profile) {
      navigate('/login');
      return;
    }
    try {
      const saved = await toggleBookmark(profile, post);
      setBookmarked(saved);
      toast.success(saved ? t('post.bookmarked') : t('post.bookmarkRemoved'));
    } catch {
      toast.error('Could not save bookmark');
    }
  }

  async function handleDelete() {
    if (!profile) return;
    await softDeletePost(post.id, true);
    toast.success('Post deleted');
    setDeleted(true);
    onDeleted?.(post.id);
  }

  async function handleVote(optionId: string) {
    if (!profile) {
      navigate('/login');
      return;
    }
    if (voted) return;
    setVoted(optionId);
    try {
      const ok = await votePoll(post, optionId, profile.uid);
      if (!ok) toast.error('You already voted in this poll');
    } catch {
      setVoted(null);
      toast.error('Could not record your vote');
    }
  }

  const canManage = profile && (profile.uid === post.authorId || roleAtLeast(profile.role, 'moderator'));

  return (
    <article className="bsdc-surface bsdc-fabric-card-hover overflow-hidden" aria-label={post.title || `Post by ${post.authorName}`}>
      <div className="flex items-start gap-3 p-4 pb-3">
        <Link to={`/p/${post.authorUsername}`} aria-label={`${post.authorName} profile`}>
          <Avatar src={post.authorAvatar} name={post.authorName} size={42} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <Link to={`/p/${post.authorUsername}`} className="truncate text-sm font-bold hover:underline">
              {post.authorName}
            </Link>
            {post.authorVerified ? <VerifiedBadge size={15} /> : null}
            {post.authorRole && post.authorRole !== 'user' ? <RoleBadge role={post.authorRole as UserRole} /> : null}
          </div>
          <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-neutral-500 dark:text-neutral-400">
            <span className="truncate">@{post.authorUsername}</span>
            <span aria-hidden>·</span>
            <time dateTime={new Date(post.createdAt).toISOString()}>{timeAgo(post.publishedAt || post.createdAt, language)}</time>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1" style={{ color: typeMeta.color }}>
              <typeMeta.icon className="h-3 w-3" aria-hidden />
              {t(typeMeta.labelKey)}
            </span>
            {post.status === 'scheduled' ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                <Clock className="h-3 w-3" aria-hidden />
                {t('post.scheduled')}
              </span>
            ) : null}
            {post.pinned ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold text-brand-700 dark:bg-brand-950/60 dark:text-brand-300">
                <Pin className="h-3 w-3" aria-hidden />
                Pinned
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void handleBookmark()}
            aria-label={t('post.bookmark')}
            className="bsdc-tap hidden rounded-lg p-2 text-neutral-400 hover:bg-neutral-100 hover:text-brand-600 dark:hover:bg-surface-dark-raised sm:flex"
          >
            {bookmarked ? <BookmarkCheck className="h-5 w-5 text-brand-600" aria-hidden /> : <Bookmark className="h-5 w-5" aria-hidden />}
          </button>
          <Dropdown open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownTrigger asChild>
              <button type="button" aria-label={t('common.more')} className="bsdc-tap rounded-lg p-2 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-surface-dark-raised">
                <MoreHorizontal className="h-5 w-5" aria-hidden />
              </button>
            </DropdownTrigger>
            <DropdownContent>
              <DropdownItem icon={<Flag className="h-4 w-4" aria-hidden />} onSelect={() => navigate(`/report?type=post&id=${post.id}`)}>
                {t('post.report')}
              </DropdownItem>
              <DropdownItem icon={<Share2 className="h-4 w-4" aria-hidden />} onSelect={() => void handleShare()}>
                {t('common.copy')}
              </DropdownItem>
              {canManage ? (
                <>
                  <DropdownSeparator />
                  <DropdownItem icon={<Pencil className="h-4 w-4" aria-hidden />} onSelect={() => navigate(`/create?edit=${post.id}`)}>
                    {t('post.editPost')}
                  </DropdownItem>
                  {profile && roleAtLeast(profile.role, 'moderator') ? (
                    <DropdownItem
                      icon={<Pin className="h-4 w-4" aria-hidden />}
                      onSelect={async () => {
                        await updatePost(post.id, { pinned: !post.pinned });
                        toast.success(post.pinned ? 'Unpinned' : 'Pinned');
                      }}
                    >
                      {post.pinned ? 'Unpin' : 'Pin'}
                    </DropdownItem>
                  ) : null}
                  <DropdownItem danger icon={<Trash2 className="h-4 w-4" aria-hidden />} onSelect={() => setConfirmDelete(true)}>
                    {t('post.deletePost')}
                  </DropdownItem>
                </>
              ) : null}
            </DropdownContent>
          </Dropdown>
        </div>
      </div>

      <div className="px-4 pb-3">
        {post.title ? (
          <Link to={detailUrl} className="group block">
            <h2 className="text-base font-bold leading-snug group-hover:text-brand-700 dark:group-hover:text-brand-400 sm:text-lg">
              {post.title}
            </h2>
          </Link>
        ) : null}
        {post.type === 'notice' && post.notice ? (
          <p
            className={cn(
              'mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold',
              post.notice.priority === 'urgent'
                ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300'
                : post.notice.priority === 'important'
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                  : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300',
            )}
          >
            <Megaphone className="h-3.5 w-3.5" aria-hidden />
            {t(`post.${post.notice.priority}`)}
          </p>
        ) : null}
      </div>

      <div className="px-4">
        <Markdown content={post.type === 'snippet' && post.snippet ? truncate(post.body, 220) : post.body} className="text-[15px]" />
        {post.type === 'snippet' && post.snippet ? (
          <Link to={detailUrl} className="mt-3 block overflow-hidden rounded-xl border border-surface-light-border bg-[#0d1117] dark:border-surface-dark-border">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
              <span className="flex items-center gap-2 text-xs font-semibold text-neutral-300">
                <Code2 className="h-3.5 w-3.5" aria-hidden />
                {post.snippet.language}
              </span>
              <span className="text-xs text-brand-400">{t('common.seeAll')}</span>
            </div>
            <pre className="max-h-40 overflow-hidden p-4 font-mono text-xs leading-relaxed text-neutral-100">
              <code>{truncate(post.snippet.code, 320)}</code>
            </pre>
          </Link>
        ) : null}
        {post.type === 'job' && post.job ? (
          <div className="mt-3 space-y-1.5 rounded-xl border border-surface-light-border p-3.5 text-sm dark:border-surface-dark-border">
            <p className="flex items-center gap-2 font-semibold">
              <Briefcase className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
              {post.job.company} · {t(`post.${post.job.jobType}`)}
            </p>
            {post.job.location ? (
              <p className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400">
                <MapPin className="h-4 w-4 shrink-0" aria-hidden />
                {post.job.location}
              </p>
            ) : null}
            {post.job.salaryMin && post.job.salaryMax ? (
              <p className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400">
                <DollarSign className="h-4 w-4 shrink-0" aria-hidden />
                {formatCurrency(post.job.salaryMin, post.job.salaryCurrency, language)} – {formatCurrency(post.job.salaryMax, post.job.salaryCurrency, language)}
              </p>
            ) : null}
            <p className="pt-1">
              <a
                href={post.job.applyUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex items-center gap-1.5 font-semibold text-brand-600 hover:underline dark:text-brand-400"
              >
                {t('jobs.apply')}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            </p>
          </div>
        ) : null}
        {post.type === 'project' && post.project ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {post.project.repoUrl ? (
              <a href={post.project.repoUrl} target="_blank" rel="noopener noreferrer" className="bsdc-chip gap-1.5 bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200">
                <GitBranch className="h-3.5 w-3.5" aria-hidden /> Repository
              </a>
            ) : null}
            {post.project.liveUrl ? (
              <a href={post.project.liveUrl} target="_blank" rel="noopener noreferrer" className="bsdc-chip gap-1.5 bg-brand-50 text-brand-700 hover:bg-brand-100 dark:bg-brand-950/60 dark:text-brand-300">
                <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Live demo
              </a>
            ) : null}
            <span className="bsdc-chip gap-1.5 bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
              <Star className="h-3.5 w-3.5" aria-hidden /> {formatNumber(post.project.starCount, language)}
            </span>
          </div>
        ) : null}
        {post.type === 'poll' && post.poll ? <PollPreview post={post} voted={voted} onVote={(id) => void handleVote(id)} language={language} /> : null}
      </div>

      {post.images.length > 0 ? (
        <div className="mt-3" style={{ marginBottom: post.images.length ? undefined : 0 }}>
          <ImageGrid images={post.images} title={post.title || post.body} onOpen={setLightboxIndex} />
        </div>
      ) : null}

      <div className="mx-4 mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-surface-light-border py-2 dark:border-surface-dark-border">
        <div className="flex items-center gap-0.5 sm:gap-1">
          <ReactionButton
            activeType={reaction}
            counts={post.reactionCounts}
            total={post.reactionTotal}
            onReact={(type) => void handleReact(type)}
            onRemove={() => void handleRemoveReaction()}
          />
          <Link
            to={detailUrl}
            className="bsdc-tap flex items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-neutral-500 hover:bg-neutral-100 hover:text-brand-600 dark:text-neutral-400 dark:hover:bg-surface-dark-raised"
            aria-label={t('post.comment')}
          >
            <MessageSquare className="h-5 w-5" aria-hidden />
            {post.commentCount > 0 ? post.commentCount : t('post.comment')}
          </Link>
        </div>
        <div className="flex items-center gap-0.5 sm:gap-1">
          <button
            type="button"
            onClick={() => void handleShare()}
            aria-label={t('post.share')}
            className="bsdc-tap flex items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-neutral-500 hover:bg-neutral-100 hover:text-brand-600 dark:text-neutral-400 dark:hover:bg-surface-dark-raised"
          >
            <Share2 className="h-5 w-5" aria-hidden />
            <span className="hidden sm:inline">{t('post.share')}</span>
            {post.shareCount > 0 ? <span>{post.shareCount}</span> : null}
          </button>
          <button
            type="button"
            onClick={() => void handleBookmark()}
            aria-label={t('post.bookmark')}
            className="bsdc-tap flex items-center justify-center rounded-lg px-3 text-neutral-500 hover:bg-neutral-100 hover:text-brand-600 dark:text-neutral-400 dark:hover:bg-surface-dark-raised"
          >
            {bookmarked ? <BookmarkCheck className="h-5 w-5 text-brand-600" aria-hidden /> : <Bookmark className="h-5 w-5" aria-hidden />}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 px-4 pb-3 text-xs text-neutral-400 dark:text-neutral-500">
        <span className="inline-flex items-center gap-1">
          <Eye className="h-3.5 w-3.5" aria-hidden />
          {formatNumber(post.viewCount, language)} {t('post.views')}
        </span>
        {post.readingMinutes > 1 ? <span>{post.readingMinutes} {t('post.readingTime')}</span> : null}
        {post.tags.length > 0 ? (
          <span className="ml-auto hidden min-w-0 flex-wrap gap-1 sm:flex">
            {post.tags.slice(0, 3).map((tag) => (
              <Link key={tag} to={`/tag/${encodeURIComponent(tag)}`} className="truncate text-brand-600 hover:underline dark:text-brand-400">
                #{tag}
              </Link>
            ))}
          </span>
        ) : null}
      </div>

      {post.images.length > 0 ? (
        <Lightbox
          open={lightboxIndex >= 0}
          close={() => setLightboxIndex(-1)}
          index={lightboxIndex < 0 ? 0 : lightboxIndex}
          slides={post.images.map((src) => ({ src, alt: post.title || 'Post image' }))}
        />
      ) : null}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('post.deletePost')}
        body={t('post.deleteConfirm')}
        confirmLabel={t('common.delete')}
        danger
        onConfirm={() => {
          void handleDelete();
          setConfirmDelete(false);
        }}
      />
    </article>
  );
}

function ImageGrid({ images, title, onOpen }: { images: string[]; title: string; onOpen: (index: number) => void }) {
  const count = Math.min(images.length, 4);
  const layout =
    count === 1
      ? 'grid-cols-1'
      : count === 2
        ? 'grid-cols-2'
        : count === 3
          ? 'grid-cols-2 sm:grid-cols-3'
          : 'grid-cols-2';
  return (
    <div className={`grid gap-0.5 sm:gap-1 ${layout}`}>
      {images.slice(0, 4).map((src, i) => (
        <button
          key={`${src}-${i}`}
          type="button"
          onClick={() => onOpen(i)}
          aria-label={`${title} — image ${i + 1}`}
          className={cn('group relative min-h-0 overflow-hidden', count === 1 ? 'max-h-[520px]' : 'aspect-square', i === 3 && images.length > 4 ? 'relative' : '')}
        >
          <img src={src} alt={`${title} — image ${i + 1}`} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
          {i === 3 && images.length > 4 ? (
            <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-lg font-bold text-white">
              +{images.length - 4}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function PollPreview({
  post,
  voted,
  onVote,
  language,
}: {
  post: Post;
  voted: string | null;
  onVote: (optionId: string) => void;
  language: string;
}) {
  const { t } = useTranslation();
  if (!post.poll) return null;
  const total = post.poll.options.reduce((s, o) => s + o.votes, 0);
  return (
    <div className="mt-3 space-y-2">
      {post.poll.options.map((option) => {
        const pct = total > 0 ? Math.round((option.votes / total) * 100) : 0;
        return (
          <button
            key={option.id}
            type="button"
            disabled={Boolean(voted)}
            onClick={() => onVote(option.id)}
            className="relative block w-full overflow-hidden rounded-lg border border-surface-light-border px-3 py-2.5 text-left text-sm transition-colors hover:border-brand-400 disabled:cursor-default dark:border-surface-dark-border"
            aria-label={`${option.text} — ${pct}%`}
          >
            {voted ? (
              <span className="absolute inset-y-0 left-0 bg-brand-100 dark:bg-brand-950" style={{ width: `${pct}%` }} aria-hidden />
            ) : null}
            <span className="relative flex items-center justify-between gap-2">
              <span className={cn('font-medium', voted === option.id && 'font-bold text-brand-700 dark:text-brand-300')}>
                {option.text}
              </span>
              {voted ? (
                <span className="shrink-0 text-xs font-bold text-neutral-500">
                  {pct}% · {formatNumber(option.votes, language)}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
      <p className="text-xs text-neutral-400">
        {formatNumber(total, language)} {t('post.votes')}
        {post.poll.expiresAt ? ` · ${t('post.pollExpires')}: ${new Date(post.poll.expiresAt).toLocaleDateString()}` : ''}
      </p>
    </div>
  );
}

