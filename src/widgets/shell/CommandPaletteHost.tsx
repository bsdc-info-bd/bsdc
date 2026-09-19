/**
 * BSDC — src/widgets/shell/CommandPaletteHost.tsx
 * Purpose : The one place the command palette lives, and the one place its shortcut is registered.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The palette — and cmdk behind it — is loaded lazily by this host and nothing else, so
 *   the shell pays nothing for a screen most people never open. The host owns the shortcut and
 *   listens for the header's open request, which is how a button in the chrome can reach a dialog
 *   without the chrome importing the dialog.
 *   The host renders nothing itself. Keeping the markup out of the shell is what keeps the shell
 *   cheap, and it is also what stops two hosts from ever fighting over the same keystroke.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { lazy, Suspense, useEffect } from 'react';
import { useSession } from '@/features/auth';
import { useCommandPalette } from '@/features/search';
import { on } from '@/core/events/bus';

const SearchDialog = lazy(async () => ({
  default: (await import('@/features/search/SearchDialog')).SearchDialog,
}));

/**
 * Mounts the command palette behind the global shortcut.
 * @returns the palette host, which renders nothing until it is opened
 */
export function CommandPaletteHost(): React.ReactElement | null {
  const { session, locale } = useSession();
  const role = session.claims.role;
  const isStaff = role === 'support' || role === 'moderator' || role === 'admin' || role === 'root';
  const { open, setOpen } = useCommandPalette(isStaff);

  useEffect(() => on('palette:open', () => setOpen(true)), [setOpen]);

  return (
    <Suspense fallback={null}>
      <SearchDialog open={open} onOpenChange={setOpen} locale={locale} isStaff={isStaff} />
    </Suspense>
  );
}
