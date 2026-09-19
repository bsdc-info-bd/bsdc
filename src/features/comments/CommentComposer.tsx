/**
 * BSDC — src/features/comments/CommentComposer.tsx
 * Purpose : Writing a comment or a reply: text, counter and submit.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Submit is Cmd/Ctrl+Enter as well as the button, because a comment box on a phone
 *   keyboard needs an escape hatch that is not "tap a small button". The counter turns warning
 *   coloured at ninety percent of the ceiling, and the ceiling comes from the same limits table
 *   the server enforces, so nothing is rejected after the fact.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { TEXT_LIMITS } from '@/core/config/limits';
import { Avatar } from '@/shared/ui/Avatar';
import { Button } from '@/shared/ui/Button';
import { Textarea } from '@/shared/ui/Input';
import { displayNameFor } from '@/entities/profile/model';
import type { Profile } from '@/entities/profile/model';

/** Props for the comment composer. */
export interface CommentComposerProps {
  readonly author: Profile | null;
  readonly locale: 'bn' | 'en';
  readonly parentId?: string | undefined;
  /** Focus the field after mount, used for a reply box a person just opened. */
  readonly focusOnMount?: boolean | undefined;
  readonly placeholder?: string | undefined;
  readonly onSubmit: (body: string) => Promise<void> | void;
  readonly onCancel?: (() => void) | undefined;
}

/**
 * Renders the comment composer.
 * @param props composer props
 * @returns the composer
 */
export function CommentComposer({
  author,
  locale,
  parentId,
  focusOnMount = false,
  placeholder,
  onSubmit,
  onCancel,
}: CommentComposerProps): React.ReactElement {
  const { t } = useTranslation('comments');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const fieldRef = useRef<HTMLTextAreaElement | null>(null);
  const limit = TEXT_LIMITS.comment;
  const trimmed = body.trim();
  const canSubmit = trimmed.length > 0 && body.length <= limit && !busy;

  // Focus is applied after mount rather than through the autoFocus attribute: the reply box is
  // opened deliberately by a person, and a ref gives us the same result without the attribute
  // that the accessibility rule forbids.
  useEffect(() => {
    if (focusOnMount) fieldRef.current?.focus();
  }, [focusOnMount]);

  /**
   * Submits the comment.
   * @param event form submit event
   */
  async function submit(event?: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event?.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    try {
      await onSubmit(trimmed);
      setBody('');
    } finally {
      setBusy(false);
    }
  }

  /**
   * Handles the keyboard shortcut.
   * @param event keyboard event
   */
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      void submit();
    }
  }

  return (
    <form
      className="bsdc-comment-composer"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      {author !== null ? (
        <Avatar
          name={displayNameFor(author, locale)}
          src={author.photoUrl === '' ? null : author.photoUrl}
          size="sm"
          decorative
        />
      ) : null}
      <div className="bsdc-comment-composer__field">
        <Textarea
          label={parentId === undefined ? t('writeComment') : t('writeReply')}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={onKeyDown}
          ref={fieldRef}
          rows={2}
          maxLength={limit}
          counter={{ value: body.length, max: limit }}
          hint={t('shortcut')}
          {...(placeholder !== undefined ? { placeholder } : {})}
        />
        <div className="bsdc-comment-composer__actions">
          {onCancel !== undefined ? (
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              {t('cancel')}
            </Button>
          ) : null}
          <Button type="submit" size="sm" disabled={!canSubmit} loading={busy}>
            {parentId === undefined ? t('post') : t('reply')}
          </Button>
        </div>
      </div>
    </form>
  );
}
