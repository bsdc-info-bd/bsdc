/**
 * BSDC — src/features/stories/StoryRail.tsx
 * Purpose : The story rail: one ring per person, ordered by who you follow first.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The rail scrolls sideways and every ring is at least 44 by 44 CSS pixels, because a
 *   target you can hit with a thumb is the difference between a feature people use and a feature
 *   people aim at. A ring with unseen frames is outlined rather than badged with a number: this is
 *   not an inbox, and a platform that counts your friends at you is one people learn to dread.
 *   Your own ring sits first with an add control, which is the only affordance that publishes.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useTranslation } from 'react-i18next';
import { Avatar, IconButton } from '@/shared/ui';
import type { Locale } from '@/core/config/app';
import type { Story } from '@/entities/story/model';
import { groupByAuthor, hoursRemaining } from '@/entities/story/model';

/** One author's ring in the rail. */
export interface StoryRing {
  readonly authorUid: string;
  readonly authorName: string;
  readonly authorPhotoUrl: string;
  readonly frames: readonly Story[];
  /** True when this device has not shown these frames yet. */
  readonly unseen: boolean;
}

/** Props for the story rail. */
export interface StoryRailProps {
  readonly stories: readonly Story[];
  readonly locale: Locale;
  readonly viewerUid: string;
  readonly viewerName: string;
  readonly viewerPhotoUrl: string;
  /** Ids of the stories this device has already shown. */
  readonly seenIds: readonly string[];
  readonly onOpen: (authorUid: string) => void;
  readonly onCompose: () => void;
}

/**
 * Renders the story rail.
 * @param props component props
 * @returns the rail element
 */
export function StoryRail({
  stories,
  locale,
  viewerUid,
  viewerName,
  viewerPhotoUrl,
  seenIds,
  onOpen,
  onCompose,
}: StoryRailProps): React.ReactElement | null {
  const { t } = useTranslation('stories');
  const lang = locale === 'bn' ? 'bn' : 'en';
  const seen = new Set(seenIds);
  const grouped = groupByAuthor(stories);
  if (grouped.length === 0 && viewerUid.length === 0) return null;

  const rings: StoryRing[] = grouped.map((entry) => {
    const first = entry.frames[0];
    return {
      authorUid: entry.authorUid,
      authorName: first?.authorName ?? '',
      authorPhotoUrl: first?.authorPhotoUrl ?? '',
      frames: entry.frames,
      unseen: entry.frames.some((frame) => !seen.has(frame.id)),
    };
  });

  const ownIndex = rings.findIndex((ring) => ring.authorUid === viewerUid);
  if (ownIndex > 0) {
    const [own] = rings.splice(ownIndex, 1);
    if (own !== undefined) rings.unshift(own);
  }

  return (
    <section className="bsdc-stories" aria-label={t('rail.label')}>
      <ul className="bsdc-stories__rail">
        {viewerUid.length > 0 ? (
          <li className="bsdc-stories__item">
            <button
              type="button"
              className="bsdc-stories__ring bsdc-stories__ring--own"
              onClick={onCompose}
            >
              <span className="bsdc-stories__avatar">
                <Avatar
                  name={viewerName}
                  src={viewerPhotoUrl.length > 0 ? viewerPhotoUrl : null}
                  size="md"
                  decorative
                />
              </span>
              <IconButton
                icon="plus"
                label={t('composer.open')}
                size="sm"
                className="bsdc-stories__add"
                onClick={onCompose}
              />
              <span className="bsdc-stories__label" lang={lang}>
                {t('rail.yourStory')}
              </span>
            </button>
          </li>
        ) : null}

        {rings.map((ring) => {
          const remaining = ring.frames[0] === undefined ? 0 : hoursRemaining(ring.frames[0]);
          return (
            <li key={ring.authorUid} className="bsdc-stories__item">
              <button
                type="button"
                className="bsdc-stories__ring"
                data-unseen={ring.unseen ? 'true' : 'false'}
                onClick={() => onOpen(ring.authorUid)}
                aria-label={t('rail.openFor', {
                  name: ring.authorName,
                  count: ring.frames.length,
                  hours: remaining,
                })}
              >
                <span className="bsdc-stories__avatar">
                  <Avatar
                    name={ring.authorName}
                    src={ring.authorPhotoUrl.length > 0 ? ring.authorPhotoUrl : null}
                    size="md"
                    decorative
                  />
                </span>
                <span className="bsdc-stories__label" lang={lang}>
                  {ring.authorName}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
