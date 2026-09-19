/**
 * BSDC — src/features/search/SearchDialog.tsx
 * Purpose : The dialog that hosts the command palette, and the global shortcut that opens it.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The shortcut is registered on the window so it works from any surface, and it is
 *   ignored while a person is typing in a field of their own — hijacking a keystroke somebody is
 *   using to write is the fastest way to lose their work and their goodwill.
 *   The palette is imported lazily: the shell pays nothing for a screen most visitors never open.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useTranslation } from 'react-i18next';
import type { Locale } from '@/core/config/app';
import { Modal } from '@/shared/ui';
import { CommandPalette } from './CommandPalette';

/** Props for the search dialog. */
export interface SearchDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly locale: Locale;
  readonly isStaff: boolean;
}

/**
 * Renders the command palette inside a modal dialog.
 * @param props component props
 * @returns the dialog element
 */
export function SearchDialog({
  open,
  onOpenChange,
  locale,
  isStaff,
}: SearchDialogProps): React.ReactElement {
  const { t } = useTranslation('search');

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t('palette.title')}
      description={t('palette.description')}
      size="lg"
      closeLabel={t('palette.close')}
    >
      <CommandPalette locale={locale} isStaff={isStaff} onNavigate={() => onOpenChange(false)} />
    </Modal>
  );
}
