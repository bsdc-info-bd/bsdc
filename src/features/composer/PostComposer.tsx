/**
 * BSDC — src/features/composer/PostComposer.tsx
 * Purpose : The universal publisher: text, images, visibility, group and schedule.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : One composer serves every surface — the feed, a group, a page — because a person
 *   should not have to learn three ways to say something. Surfaces differ only by the options
 *   they show, which are passed in as props.
 *   Video is refused at the picker and again at the validator, because LAW-07 is not a UI rule.
 *   Publishing is write-through: the post appears at the top of the feed in the same frame, and
 *   the outbox guarantees it reaches the server even if the device goes offline mid-write.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useRef, useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/shared/ui/Avatar';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { Chip } from '@/shared/ui/Chip';
import { Textarea } from '@/shared/ui/Input';
import { Text } from '@/shared/ui/Typography';
import { formatCompact } from '@/shared/lib/number.bn';
import { displayNameFor } from '@/entities/profile/model';
import type { Profile } from '@/entities/profile/model';
import { createPost } from '@/entities/post/repository';
import type { Post } from '@/entities/post/model';
import { toastError, toastSuccess } from '@/shared/ui/toast';
import { MediaTray } from './MediaTray';
import { VISIBILITY_OPTIONS, useComposer } from './useComposer';

/** Props for the composer. */
export interface PostComposerProps {
  readonly author: Profile | null;
  readonly locale: 'bn' | 'en';
  /** Groups the person may post into; hides the group option when empty. */
  readonly groups?: readonly { readonly id: string; readonly name: string }[] | undefined;
  readonly showScheduling?: boolean | undefined;
  readonly compact?: boolean | undefined;
  readonly onPublished?: ((post: Post) => void) | undefined;
}

/**
 * Renders the universal composer.
 * @param props composer props
 * @returns the composer card
 */
export function PostComposer({
  author,
  locale,
  groups,
  showScheduling = false,
  compact = false,
  onPublished,
}: PostComposerProps): React.ReactElement {
  const { t } = useTranslation('composer');
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const authorUid = author?.uid ?? '';

  const { state, actions } = useComposer({ authorUid });

  /**
   * Publishes the draft.
   * @param event form submit event
   */
  async function publish(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (author === null) {
      toastError(
        locale,
        t('errors.signInTitle'),
        t('errors.signInTitle'),
        t('errors.signInBody'),
        t('errors.signInBody'),
      );
      return;
    }
    const post = actions.build();
    if (post === null) {
      toastError(
        locale,
        t('errors.emptyTitle'),
        t('errors.emptyTitle'),
        t('errors.emptyBody'),
        t('errors.emptyBody'),
      );
      return;
    }

    setBusy(true);
    const result = await createPost(post);
    setBusy(false);

    if (result.error !== null && result.error.code === 'BSDC-DATA-007') {
      toastError(
        locale,
        t('errors.emptyTitle'),
        t('errors.emptyTitle'),
        t('errors.emptyBody'),
        t('errors.emptyBody'),
      );
      return;
    }

    actions.reset();
    onPublished?.(post);
    if (result.synced) toastSuccess(locale, t('publishedTitle'), t('publishedTitle'));
    else toastSuccess(locale, t('queuedTitle'), t('queuedTitle'));
  }

  return (
    <Card className="bsdc-composer">
      <form
        onSubmit={(submitEvent) => {
          void publish(submitEvent);
        }}
      >
        <div className="bsdc-composer__head">
          {author !== null ? (
            <Avatar
              name={displayNameFor(author, locale)}
              src={author.photoUrl === '' ? null : author.photoUrl}
              size={compact ? 'sm' : 'md'}
              decorative
            />
          ) : null}
          <div className="bsdc-composer__field">
            <Textarea
              label={t('prompt')}
              value={state.body}
              onChange={(event) => actions.setBody(event.target.value)}
              rows={compact ? 2 : 3}
              maxLength={state.limit}
              counter={{ value: state.charCount, max: state.limit }}
              disabled={author === null}
            />
          </div>
        </div>

        <MediaTray
          attachments={state.attachments}
          locale={locale}
          onDetach={actions.detach}
          onRetry={actions.retry}
          onAltChange={actions.setAlt}
        />

        {state.error !== null ? (
          <Text as="p" role="alert" className="bsdc-composer__error">
            {state.error.messageBn()}
          </Text>
        ) : null}

        <div className="bsdc-composer__toolbar">
          <input
            ref={fileInput}
            type="file"
            className="bsdc-visually-hidden"
            accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
            multiple
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = '';
              void actions.attach(files);
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            iconLeft="award"
            disabled={author === null}
            onClick={() => fileInput.current?.click()}
          >
            {t('addImage')}
          </Button>

          <div className="bsdc-composer__visibility" role="group" aria-label={t('visibilityLabel')}>
            {VISIBILITY_OPTIONS.filter(
              (option) => option !== 'group' || (groups !== undefined && groups.length > 0),
            ).map((option) => (
              <Chip
                key={option}
                selected={state.visibility === option}
                onToggle={() => actions.setVisibility(option)}
              >
                {t(`visibility.${option}`)}
              </Chip>
            ))}
          </div>

          <div className="bsdc-composer__submit">
            {state.charCount > 0 ? (
              <Text as="span" size="sm" tone="muted" numeric>
                {formatCompact(state.charCount, locale)} / {formatCompact(state.limit, locale)}
              </Text>
            ) : null}
            <Button
              type="submit"
              size="md"
              loading={busy}
              disabled={!state.canSubmit || author === null}
            >
              {state.scheduledFor === null ? t('publish') : t('schedule')}
            </Button>
          </div>
        </div>

        {showScheduling && author !== null ? (
          <div className="bsdc-composer__schedule">
            <label className="bsdc-composer__schedule-label" htmlFor="bsdc-schedule">
              {t('scheduleLabel')}
            </label>
            <input
              id="bsdc-schedule"
              type="datetime-local"
              className="bsdc-input"
              value={state.scheduledFor === null ? '' : state.scheduledFor.slice(0, 16)}
              onChange={(event) =>
                actions.setScheduledFor(
                  event.target.value.length === 0
                    ? null
                    : new Date(event.target.value).toISOString(),
                )
              }
            />
          </div>
        ) : null}
      </form>
    </Card>
  );
}
