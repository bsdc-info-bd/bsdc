/**
 * BSDC — src/features/messenger/TypingIndicator.tsx
 * Purpose : The "someone is typing" line in a conversation.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The line names the people typing rather than showing an abstract animation, because a
 *   name is useful and three dots are decoration. It is a live region with politeness set to
 *   polite so a screen reader hears it without interrupting.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { watchTyping } from '@/services/realtime/typing';

/** Props for the typing indicator. */
export interface TypingIndicatorProps {
  readonly conversationId: string;
  readonly viewerUid: string;
  /** Display names keyed by account id, used to build the sentence. */
  readonly names: Readonly<Record<string, string>>;
  readonly locale: 'bn' | 'en';
}

/**
 * Renders the typing line.
 * @param props indicator props
 * @returns the indicator, or null when nobody is typing
 */
export function TypingIndicator({
  conversationId,
  viewerUid,
  names,
  locale,
}: TypingIndicatorProps): React.ReactElement | null {
  const { t } = useTranslation('messenger');
  const [typing, setTyping] = useState<readonly string[]>([]);

  useEffect(() => {
    if (conversationId.length === 0) return;
    return watchTyping(conversationId, viewerUid, setTyping);
  }, [conversationId, viewerUid]);

  if (typing.length === 0) return null;

  const labels = typing.map((uid) => names[uid] ?? t('someone'));
  const sentence =
    labels.length === 1
      ? t('typingOne', { name: labels[0] ?? '' })
      : labels.length === 2
        ? t('typingTwo', { first: labels[0] ?? '', second: labels[1] ?? '' })
        : t('typingMany', { count: labels.length });

  return (
    <p className="bsdc-typing" aria-live="polite" lang={locale === 'bn' ? 'bn' : 'en'}>
      <span className="bsdc-typing__dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      {sentence}
    </p>
  );
}
