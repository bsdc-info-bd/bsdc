/**
 * BSDC — src/features/saved/SaveButton.tsx
 * Purpose : One save control that works for a post, a job, an event, a project or a gig.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : `aria-pressed` carries the state, and the label changes with it, so a screen reader
 *   hears "Remove from saved" rather than a button that only looks different. The control is
 *   44x44 CSS pixels on touch (PART 09.03) and never blocks the row it sits in.
 *   Signed-out visitors are not offered the control: a bookmark they cannot keep is a lie, so the
 *   button hides itself instead of failing.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useTranslation } from 'react-i18next';
import { Button, Icon } from '@/shared/ui';
import type { Locale } from '@/core/config/app';
import type { NewSavedInput, SavedKind } from '@/entities/saved/model';

/** Props for the save button. */
export interface SaveButtonProps {
  /** Signed-in account id, or null for a visitor. */
  readonly uid: string | null;
  readonly locale: Locale;
  readonly kind: SavedKind;
  readonly entityId: string;
  readonly title: string;
  readonly titleLang: Locale;
  readonly subtitle?: string | undefined;
  readonly href: string;
  readonly saved: boolean;
  /** Toggles the saved state. */
  readonly onToggle: (input: NewSavedInput, saved: boolean) => void;
  readonly variant?: 'ghost' | 'subtle' | 'outline' | undefined;
  readonly size?: 'xs' | 'sm' | 'md' | undefined;
  readonly withLabel?: boolean | undefined;
}

/**
 * Renders a save control for any saveable thing.
 * @param props component props
 * @returns the button, or nothing for a signed-out visitor
 */
export function SaveButton({
  uid,
  locale,
  kind,
  entityId,
  title,
  titleLang,
  subtitle,
  href,
  saved,
  onToggle,
  variant = 'ghost',
  size = 'sm',
  withLabel = false,
}: SaveButtonProps): React.ReactElement | null {
  const { t } = useTranslation('saved');
  if (uid === null) return null;

  const label = saved ? t('remove') : t('save');

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className="bsdc-saveBtn"
      aria-pressed={saved}
      aria-label={withLabel ? undefined : label}
      onClick={() =>
        onToggle(
          {
            kind,
            entityId,
            title,
            titleLang,
            ...(subtitle === undefined ? {} : { subtitle }),
            href,
          },
          !saved,
        )
      }
    >
      <Icon name="bookmark" size={16} />
      {withLabel ? <span lang={locale === 'bn' ? 'bn' : 'en'}>{label}</span> : null}
    </Button>
  );
}
