/**
 * BSDC — src/features/presence/PresenceDot.tsx
 * Purpose : A person's live presence indicator, driven by the Realtime Database.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Presence is a fact with three states and no content. The dot is decorative by default
 *   because the adjacent name is already announced; pass a label when the dot is the only signal.
 *   The subscription is reference-counted through the listener registry: a member list showing
 *   forty people opens forty logical subscriptions but the registry collapses duplicates, and
 *   unmounting releases them all deterministically.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib/cn';
import {
  watchPresence,
  type PresenceRecord,
  type PresenceState,
} from '@/services/realtime/presence';

/** Props for the presence dot. */
export interface PresenceDotProps {
  readonly uid: string;
  readonly locale: 'bn' | 'en';
  /** Render the state as text next to the dot. */
  readonly showLabel?: boolean | undefined;
  readonly className?: string | undefined;
}

/**
 * Watches one account's presence.
 * @param uid account id
 * @returns the presence record, or null while unknown
 */
export function usePresence(uid: string): PresenceRecord | null {
  const [record, setRecord] = useState<PresenceRecord | null>(null);
  useEffect(() => {
    if (uid.length === 0) return;
    return watchPresence(uid, setRecord);
  }, [uid]);
  return record;
}

/**
 * Renders a presence indicator.
 * @param props dot props
 * @returns the dot element
 */
export function PresenceDot({
  uid,
  locale,
  showLabel = false,
  className,
}: PresenceDotProps): React.ReactElement {
  const { t } = useTranslation('presence');
  const record = usePresence(uid);
  const state: PresenceState = record?.state ?? 'offline';

  return (
    <span className={cn('bsdc-presence', className)} data-state={state}>
      <span className="bsdc-presence__dot" aria-hidden="true" />
      {showLabel ? (
        <span className="bsdc-presence__label">{t(state)}</span>
      ) : (
        <span className="bsdc-visually-hidden">{`${t('label')}: ${t(state)}`}</span>
      )}
      <span className="bsdc-visually-hidden" lang={locale === 'bn' ? 'bn' : 'en'} />
    </span>
  );
}
