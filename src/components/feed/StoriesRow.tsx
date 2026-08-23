/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Eye, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import type { Story } from '@/types/post';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/Modal';
import { ImageUploader, type UploadedImage } from '@/components/ui/ImageUploader';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { createStory, fetchActiveStories, markStoryViewed } from '@/lib/data';
import { fetchFollowingIds } from '@/lib/data';
import { useAuthStore } from '@/stores/authStore';
import { colorForSeed, cn, formatNumber } from '@/lib/utils';
import { useUIStore } from '@/stores/uiStore';

export function StoriesRow() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const language = useUIStore((s) => s.language);
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<Story | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const following = profile ? await fetchFollowingIds(profile.uid, 100) : [];
        const list = await fetchActiveStories(following, profile?.uid || 'anonymous');
        if (!cancelled) setStories(list);
      } catch {
        if (!cancelled) setStories([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [profile]);

  const grouped = useMemo(() => {
    const map = new Map<string, Story[]>();
    for (const s of stories) {
      const arr = map.get(s.authorId) || [];
      arr.push(s);
      map.set(s.authorId, arr);
    }
    return [...map.entries()].map(([authorId, list]) => ({ authorId, list }));
  }, [stories]);

  if (loading && grouped.length === 0) return null;

  return (
    <>
      <div className="bsdc-surface mb-4 p-3">
        <div className="bsdc-scroll-x flex gap-3 overflow-x-auto pb-1">
          {profile ? (
            <button
              type="button"
              onClick={() => setComposerOpen(true)}
              className="bsdc-tap flex w-16 shrink-0 flex-col items-center gap-1"
              aria-label={t('story.addStory')}
            >
              <span className="relative">
                <Avatar src={profile.avatar} name={profile.displayName} size={56} />
                <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-brand-600 text-white dark:border-surface-dark">
                  <Plus className="h-3 w-3" aria-hidden />
                </span>
              </span>
              <span className="w-16 truncate text-center text-[10px] font-semibold">{t('story.addStory')}</span>
            </button>
          ) : null}
          {grouped.map(({ authorId, list }) => {
            const first = list[0];
            const seen = list.every((s) => s.viewers.some((v) => v.userId === profile?.uid));
            return (
              <button
                key={authorId}
                type="button"
                onClick={() => setViewing(first)}
                className="bsdc-tap flex w-16 shrink-0 flex-col items-center gap-1"
                aria-label={`${t('nav.profile')} @${first.authorUsername}`}
              >
                <span
                  className={cn(
                    'rounded-full p-[2.5px]',
                    seen ? 'bg-neutral-300 dark:bg-neutral-700' : 'bg-brand-gradient',
                  )}
                >
                  <span className="block rounded-full border-2 border-white dark:border-surface-dark-muted">
                    <Avatar src={first.authorAvatar} name={first.authorName} size={52} />
                  </span>
                </span>
                <span className="w-16 truncate text-center text-[10px] font-semibold">@{first.authorUsername}</span>
              </button>
            );
          })}
        </div>
      </div>

      {viewing ? (
        <StoryViewer
          story={viewing}
          onClose={() => setViewing(null)}
          onNext={() => {
            const flat = grouped.flatMap((g) => g.list);
            const idx = flat.findIndex((s) => s.id === viewing.id);
            const next = flat[idx + 1];
            if (next) setViewing(next);
            else setViewing(null);
          }}
          language={language}
          onAuthorClick={() => {
            navigate(`/p/${viewing.authorUsername}`);
            setViewing(null);
          }}
        />
      ) : null}

      <StoryComposer open={composerOpen} onOpenChange={setComposerOpen} onCreated={() => setComposerOpen(false)} />
    </>
  );
}

function StoryViewer({
  story,
  onClose,
  onNext,
  language,
  onAuthorClick,
}: {
  story: Story;
  onClose: () => void;
  onNext: () => void;
  language: string;
  onAuthorClick: () => void;
}) {
  const { t } = useTranslation();
  const profile = useAuthStore((s) => s.profile);

  useEffect(() => {
    if (profile) void markStoryViewed(story, profile.uid);
  }, [story, profile]);

  useEffect(() => {
    const timer = setTimeout(onNext, 6000);
    return () => clearTimeout(timer);
  }, [onNext]);

  return (
    <Modal open onOpenChange={(o) => (!o ? onClose() : undefined)} size="sm">
      <div className="relative overflow-hidden rounded-xl" style={{ background: story.imageUrl ? '#0d1117' : story.backgroundColor || colorForSeed(story.authorId) }}>
        <div className="absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/60 to-transparent p-3">
          <div className="flex items-center gap-2.5">
            <button type="button" onClick={onAuthorClick} className="flex min-w-0 items-center gap-2.5">
              <Avatar src={story.authorAvatar} name={story.authorName} size={36} />
              <span className="min-w-0 text-left">
                <span className="block truncate text-sm font-bold text-white">{story.authorName}</span>
                <span className="block text-[11px] text-white/70">@{story.authorUsername}</span>
              </span>
            </button>
            <button type="button" onClick={onClose} aria-label={t('common.close')} className="ml-auto rounded-full p-1.5 text-white hover:bg-white/20">
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </div>
        <div className="flex min-h-[60vh] items-center justify-center sm:min-h-[70vh]">
          {story.imageUrl ? (
            <img src={story.imageUrl} alt={story.caption || 'Story'} className="max-h-[75vh] w-full object-contain" />
          ) : (
            <p className="px-8 py-16 text-center text-2xl font-extrabold text-white">{story.caption}</p>
          )}
        </div>
        {story.caption && story.imageUrl ? (
          <p className="absolute inset-x-0 bottom-14 bg-gradient-to-t from-black/70 to-transparent p-4 text-center text-sm font-semibold text-white">
            {story.caption}
          </p>
        ) : null}
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between p-3 text-xs text-white/80">
          <span className="inline-flex items-center gap-1">
            <Eye className="h-3.5 w-3.5" aria-hidden />
            {formatNumber(story.viewCount, language)} {t('story.views')}
          </span>
          <span>{t('story.expires')}</span>
        </div>
        <div className="absolute left-0 top-1/2 -translate-y-1/2">
          <button type="button" onClick={onClose} aria-label="Previous" className="hidden p-2 text-white/60 hover:text-white sm:block">
            <ChevronLeft className="h-6 w-6" aria-hidden />
          </button>
        </div>
        <div className="absolute right-0 top-1/2 -translate-y-1/2">
          <button type="button" onClick={onNext} aria-label="Next story" className="p-2 text-white/60 hover:text-white">
            <ChevronRight className="h-6 w-6" aria-hidden />
          </button>
        </div>
      </div>
    </Modal>
  );
}

function StoryComposer({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void }) {
  const { t } = useTranslation();
  const profile = useAuthStore((s) => s.profile);
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [caption, setCaption] = useState('');
  const [saving, setSaving] = useState(false);
  const [textOnly, setTextOnly] = useState(false);

  async function create() {
    if (!profile) return;
    if (!textOnly && images.length === 0) {
      toast.error('Add an image or switch to a text story');
      return;
    }
    setSaving(true);
    try {
      await createStory(profile, images[0]?.url || '', caption, colorForSeed(profile.uid));
      toast.success('Story published — it disappears in 24 hours');
      setImages([]);
      setCaption('');
      onCreated();
    } catch {
      toast.error('Could not publish story');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={t('story.addStory')}>
      <div className="space-y-4">
        <div className="flex gap-2">
          <Button variant={!textOnly ? 'primary' : 'outline'} size="sm" onClick={() => setTextOnly(false)}>
            {t('story.imageStory')}
          </Button>
          <Button variant={textOnly ? 'primary' : 'outline'} size="sm" onClick={() => setTextOnly(true)}>
            {t('story.textStory')}
          </Button>
        </div>
        {!textOnly ? <ImageUploader single images={images} onChange={setImages} folder="bsdc/stories" tier="casual" /> : null}
        <Input
          label={t('story.caption')}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          maxLength={textOnly ? 120 : 200}
          placeholder={textOnly ? 'Type your text story…' : t('story.caption')}
        />
        <Button fullWidth loading={saving} onClick={() => void create()}>
          {t('common.publish')}
        </Button>
      </div>
    </Modal>
  );
}
