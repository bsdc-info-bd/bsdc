/**
 * BSDC — src/features/reactions/ReactionPicker.tsx
 * Purpose : The ten-reaction chooser, opened from a long press, hover or keyboard focus.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The picker is a plain group of buttons rather than a floating popper: it needs no
 *   positioning library, it cannot be clipped on a 250px screen, and it works identically under
 *   forced-colors and 200% zoom. Focus moves to the first glyph on open, arrow keys move across
 *   the row, Escape closes, and the chosen glyph is announced.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  REACTIONS,
  orderedReactionSummary,
  reactionDefinition,
  type ReactionType,
} from '@/core/config/reactions';
import { cn } from '@/shared/lib/cn';
import { ReactionGlyph } from './ReactionGlyph';

/** Props for the picker. */
export interface ReactionPickerProps {
  readonly open: boolean;
  readonly current: ReactionType | null;
  readonly counts: Readonly<Record<string, number>>;
  readonly locale: 'bn' | 'en';
  readonly onPick: (type: ReactionType | null) => void;
  readonly onClose: () => void;
}

/**
 * Renders the reaction chooser.
 * @param props picker props
 * @returns the picker, or null when closed
 */
export function ReactionPicker({
  open,
  current,
  counts,
  locale,
  onPick,
  onClose,
}: ReactionPickerProps): React.ReactElement | null {
  const { t } = useTranslation('reactions');
  const rowRef = useRef<HTMLDivElement | null>(null);
  // Frequently used reactions lead, so muscle memory stays valid as a thread grows.
  const byUsage = orderedReactionSummary(counts);
  const order: readonly ReactionType[] = [
    ...byUsage,
    ...REACTIONS.filter((type) => !byUsage.includes(type)),
  ];

  useEffect(() => {
    if (!open) return;
    const first = rowRef.current?.querySelector<HTMLButtonElement>('button');
    first?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  /**
   * Moves focus along the row.
   * @param event keyboard event
   */
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const buttons = Array.from(rowRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const lastIndex = buttons.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? Math.min(index + 1, lastIndex)
        : event.key === 'ArrowLeft'
          ? Math.max(index - 1, 0)
          : event.key === 'Home'
            ? 0
            : lastIndex;
    buttons[next]?.focus();
  }

  return (
    <div
      className="bsdc-reaction-picker"
      role="group"
      aria-label={t('pickerLabel')}
      ref={rowRef}
      onKeyDown={onKeyDown}
    >
      {order.map((type) => {
        const definition = reactionDefinition(type);
        const selected = current === type;
        return (
          <button
            key={type}
            type="button"
            className={cn('bsdc-reaction-picker__item', selected && 'is-selected')}
            data-tint={definition.tint}
            aria-pressed={selected}
            aria-label={locale === 'bn' ? definition.labelBn : definition.labelEn}
            title={locale === 'bn' ? definition.labelBn : definition.labelEn}
            onClick={() => onPick(selected ? null : type)}
          >
            <ReactionGlyph type={type} size={26} />
          </button>
        );
      })}
    </div>
  );
}
