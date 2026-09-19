/**
 * BSDC — src/features/stories/StoryComposer.tsx
 * Purpose : Publishing a story: pick an image, say a sentence, and let it go in twenty-four hours.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Video is refused before it is uploaded, in the same code path and with the same message
 *   as everywhere else on the platform: BSDC has no video surface, and a story is the last place a
 *   surprise exception belongs.
 *   The caption counter is live and the publish button is unavailable until an image exists,
 *   because a story with no image is not a story and saying so after the fact wastes a person's
 *   time.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input, showToast } from '@/shared/ui';
import { TEXT_LIMITS } from '@/core/config/limits';
import { AppError } from '@/core/errors/AppError';
import type { Locale } from '@/core/config/app';
import type { Profile } from '@/entities/profile/model';
import { newStory, type Story } from '@/entities/story/model';
import { publishStory } from '@/entities/story/repository';
import { uploadMedia } from '@/services/media';
import { createLocalPreview, releasePreview } from '@/services/media/preview';

/** Props for the story composer. */
export interface StoryComposerProps {
  readonly author: Profile;
  readonly locale: Locale;
  readonly onPublished: (story: Story) => void;
  readonly onCancel: () => void;
}

/**
 * Renders the story composer.
 * @param props component props
 * @returns the composer element
 */
export function StoryComposer({
  author,
  locale,
  onPublished,
  onCancel,
}: StoryComposerProps): React.ReactElement {
  const { t } = useTranslation('stories');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [blur, setBlur] = useState('');
  const [caption, setCaption] = useState('');
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const previewRef = useRef('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  const choose = (next: File | null): void => {
    if (previewRef.current.length > 0) releasePreview(previewRef.current);
    previewRef.current = '';
    setFile(next);
    setPreviewUrl('');
    setBlur('');
    if (next === null) return;
    void createLocalPreview(next).then((preview) => {
      if (preview === null) return;
      previewRef.current = preview.objectUrl;
      setPreviewUrl(preview.objectUrl);
      setBlur(preview.blurDataUrl);
    });
  };

  const publish = (): void => {
    if (file === null) return;
    setBusy(true);
    setProgress(0);
    void uploadMedia(file, 'storyImage', { folder: 'bsdc/stories', onProgress: setProgress })
      .then(async (result) => {
        if (!result.ok) throw result.error;
        const story = newStory({
          authorUid: author.uid,
          authorName: author.displayName,
          authorNameBn: author.displayNameBn,
          authorUsername: author.username,
          authorPhotoUrl: author.photoUrl,
          mediaUrl: result.value.url,
          caption,
          ...(blur.length > 0 ? { blurDataUrl: blur } : {}),
        });
        const outcome = await publishStory(story);
        if (!outcome.synced && !outcome.queued)
          throw outcome.error ?? new AppError('BSDC-DATA-007');
        showToast(locale, {
          titleBn: t('published.bn'),
          titleEn: t('published.en'),
          tone: 'success',
        });
        onPublished(story);
      })
      .catch((error: unknown) => {
        const code = error instanceof AppError ? error.code : 'BSDC-MEDIA-001';
        showToast(locale, {
          tone: 'error',
          titleBn: t(`error.${code}.bn`, { defaultValue: t('error.default.bn') }),
          titleEn: t(`error.${code}.en`, { defaultValue: t('error.default.en') }),
        });
      })
      .finally(() => setBusy(false));
  };

  return (
    <section className="bsdc-storyComposer" aria-label={t('composer.label')}>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
        className="bsdc-storyComposer__file"
        onChange={(event) => choose(event.target.files?.[0] ?? null)}
      />
      {previewUrl.length > 0 ? (
        <img
          className="bsdc-storyComposer__preview"
          src={previewUrl}
          alt={t('composer.previewAlt')}
          width={360}
          height={640}
        />
      ) : (
        <button
          type="button"
          className="bsdc-storyComposer__drop"
          onClick={() => inputRef.current?.click()}
        >
          <span lang={locale === 'bn' ? 'bn' : 'en'}>{t('composer.choose')}</span>
        </button>
      )}
      <Input
        label={t('composer.caption')}
        value={caption}
        onChange={(event) => setCaption(event.target.value)}
        maxLength={TEXT_LIMITS.storyCaption}
        counter={{ value: caption.length, max: TEXT_LIMITS.storyCaption }}
      />
      <div className="bsdc-storyComposer__actions">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('composer.cancel')}
        </Button>
        <Button
          type="button"
          variant="primary"
          loading={busy}
          disabled={file === null}
          onClick={publish}
        >
          {busy
            ? t('composer.publishing', { percent: Math.round(progress * 100) })
            : t('composer.publish')}
        </Button>
      </div>
    </section>
  );
}
