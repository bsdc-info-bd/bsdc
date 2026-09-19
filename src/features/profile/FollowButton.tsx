/**
 * BSDC — src/features/profile/FollowButton.tsx
 * Purpose : The one control that changes whether somebody's work reaches you.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The button is optimistic where being optimistic is honest — it flips immediately,
 *   because waiting half a second to be told you pressed it feels broken — and it rolls back the
 *   moment the write fails, because a follow button that lies about a follow is worse than a slow
 *   one. It never appears on your own profile: following yourself is not a thing a platform should
 *   offer.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, showToast } from '@/shared/ui';
import { setFollowing } from '@/entities/profile/follow';
import { findError } from '@/core/errors/taxonomy';

/** Props for the follow button. */
export interface FollowButtonProps {
  readonly viewerUid: string;
  readonly targetUid: string;
  readonly following: boolean;
  readonly locale: 'bn' | 'en';
  readonly onChanged?: ((following: boolean) => void) | undefined;
  readonly size?: ('sm' | 'md' | 'lg') | undefined;
}

/**
 * Renders the follow control.
 * @param props component props
 * @returns a button element
 */
export function FollowButton({
  viewerUid,
  targetUid,
  following,
  locale,
  onChanged,
  size = 'md',
}: FollowButtonProps): React.ReactElement | null {
  const { t } = useTranslation('profile');
  const [pending, setPending] = useState(false);
  const [optimistic, setOptimistic] = useState(following);

  if (viewerUid.length === 0 || viewerUid === targetUid || targetUid.length === 0) return null;

  const toggle = (): void => {
    const next = !optimistic;
    setOptimistic(next);
    setPending(true);
    void setFollowing(viewerUid, targetUid, next)
      .then((outcome) => {
        if (outcome.synced || outcome.queued) {
          onChanged?.(next);
          return;
        }
        setOptimistic(!next);
        const code = outcome.error?.code ?? 'BSDC-NET-005';
        const definition = findError(code);
        showToast(locale, {
          tone: 'error',
          titleBn: definition?.bn ?? code,
          titleEn: definition?.en ?? code,
        });
      })
      .finally(() => setPending(false));
  };

  return (
    <Button
      variant={optimistic ? 'secondary' : 'primary'}
      size={size}
      loading={pending}
      onClick={toggle}
      aria-pressed={optimistic}
    >
      {optimistic ? t('following') : t('follow')}
    </Button>
  );
}
