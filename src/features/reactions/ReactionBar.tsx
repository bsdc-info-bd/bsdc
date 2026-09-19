/**
 * BSDC — src/features/reactions/ReactionBar.tsx
 * Purpose : The reaction row: summary, quick react, and the ten-glyph chooser.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The bar owns the optimistic state: the button updates the moment it is tapped and the
 *   authoritative count replaces it when the server snapshot arrives. A long press (or hover on a
 *   pointer device, or Enter-plus-arrows on a keyboard) opens the chooser; a plain tap applies or
 *   removes the default `like`. Every target here is at least 44 by 44 CSS pixels, because this is
 *   the most-tapped row in the product.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  orderedReactionSummary,
  reactionDefinition,
  type ReactionType,
} from '@/core/config/reactions';
import { setReaction } from '@/entities/reaction/repository';
import { applyReactionChange, type ReactionSummary } from '@/entities/reaction/model';
import { formatCompact } from '@/shared/lib/number.bn';
import { cn } from '@/shared/lib/cn';
import { ReactionGlyph } from './ReactionGlyph';
import { ReactionPicker } from './ReactionPicker';

/** How long a press must be held to open the chooser. */
const LONG_PRESS_MS = 420;

/** Props for the reaction bar. */
export interface ReactionBarProps {
  readonly postId: string;
  readonly summary: ReactionSummary;
  readonly locale: 'bn' | 'en';
  readonly viewerUid: string | null;
  readonly disabled?: boolean | undefined;
  readonly onChanged?: ((summary: ReactionSummary) => void) | undefined;
}

/**
 * Renders the reaction row for a post.
 * @param props bar props
 * @returns the reaction bar
 */
export function ReactionBar({
  postId,
  summary,
  locale,
  viewerUid,
  disabled = false,
  onChanged,
}: ReactionBarProps): React.ReactElement {
  const { t } = useTranslation('reactions');
  const [optimistic, setOptimistic] = useState<ReactionSummary>(summary);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setOptimistic(summary), [summary]);
  useEffect(
    () => () => {
      if (pressTimer.current !== null) clearTimeout(pressTimer.current);
      if (hoverTimer.current !== null) clearTimeout(hoverTimer.current);
    },
    [],
  );

  /**
   * Applies a reaction choice locally and remotely.
   * @param next the chosen reaction, or null to clear
   */
  const apply = useCallback(
    (next: ReactionType | null): void => {
      if (viewerUid === null || disabled) return;
      const previous = optimistic.mine;
      const updated = applyReactionChange(optimistic, previous, next);
      setOptimistic(updated);
      onChanged?.(updated);
      void setReaction(postId, viewerUid, next);
    },
    [disabled, onChanged, optimistic, postId, viewerUid],
  );

  /**
   * Starts the long-press timer.
   */
  function onPressStart(): void {
    if (disabled) return;
    pressTimer.current = setTimeout(() => setPickerOpen(true), LONG_PRESS_MS);
  }

  /**
   * Cancels the long-press timer and, when it never fired, toggles the default reaction.
   */
  function onPressEnd(): void {
    if (pressTimer.current !== null) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
      if (!pickerOpen) apply(optimistic.mine === null ? 'like' : null);
    }
  }

  const top = orderedReactionSummary(optimistic.counts).slice(0, 3);
  const mine = optimistic.mine;
  const mineLabel =
    mine === null
      ? t('react')
      : locale === 'bn'
        ? reactionDefinition(mine).labelBn
        : reactionDefinition(mine).labelEn;

  return (
    <div className="bsdc-reaction-bar">
      <div className="bsdc-reaction-bar__summary" aria-live="polite">
        {top.length > 0 ? (
          <span className="bsdc-reaction-bar__stack" aria-hidden="true">
            {top.map((type) => (
              <ReactionGlyph
                key={type}
                type={type}
                size={16}
                className="bsdc-reaction-bar__badge"
              />
            ))}
          </span>
        ) : null}
        {optimistic.total > 0 ? (
          <span className="bsdc-reaction-bar__count">
            {formatCompact(optimistic.total, locale)}
          </span>
        ) : null}
      </div>

      <div className="bsdc-reaction-bar__actions">
        <button
          type="button"
          className={cn('bsdc-reaction-bar__button', mine !== null && 'is-active')}
          onPointerDown={onPressStart}
          onPointerUp={onPressEnd}
          onPointerLeave={() => {
            if (pressTimer.current !== null) {
              clearTimeout(pressTimer.current);
              pressTimer.current = null;
            }
          }}
          onPointerEnter={() => {
            hoverTimer.current = setTimeout(() => setPickerOpen(true), 500);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && event.shiftKey) setPickerOpen(true);
          }}
          onFocus={() => setPickerOpen(false)}
          aria-pressed={mine !== null}
          aria-expanded={pickerOpen}
          disabled={disabled || viewerUid === null}
        >
          {mine !== null ? <ReactionGlyph type={mine} size={18} /> : null}
          <span>{mineLabel}</span>
        </button>

        <button
          type="button"
          className="bsdc-reaction-bar__button"
          onClick={() => setPickerOpen((open) => !open)}
          aria-expanded={pickerOpen}
          aria-label={t('choose')}
          disabled={disabled || viewerUid === null}
        >
          <span aria-hidden="true">{t('chooseGlyph')}</span>
        </button>
      </div>

      <ReactionPicker
        open={pickerOpen}
        current={mine}
        counts={optimistic.counts}
        locale={locale}
        onPick={(type) => {
          apply(type);
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </div>
  );
}
