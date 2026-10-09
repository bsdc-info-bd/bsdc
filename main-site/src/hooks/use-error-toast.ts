import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

/**
 * Say out loud that a write was refused.
 *
 * Every optimistic control in this app has the same failure shape: the screen
 * changes at once, the server disagrees, and unless something says so the
 * control simply snaps back — which a member reads as a button that does not
 * work rather than a write that was refused. This takes the message key the
 * mutation produced, toasts it once, and hands the state back.
 */
export function useErrorToast(
  messageKey: string | null,
  onDismiss: () => void,
  options?: { title?: string },
): void {
  const { t } = useTranslation();
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  const title = options?.title;

  useEffect(() => {
    if (messageKey === null) return;
    toast.error(title === undefined ? t(messageKey) : t(title), {
      description: title === undefined ? undefined : t(messageKey),
    });
    dismiss.current();
  }, [messageKey, t, title]);
}
