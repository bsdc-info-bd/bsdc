import { registerSW } from 'virtual:pwa-register';
import { toast } from 'sonner';
import i18n from './i18n';

/**
 * Service worker registration with an explicit update prompt, so a user is
 * never left on a stale shell and never force-reloaded mid-action.
 */
export function registerServiceWorker(): void {
  if (import.meta.env.DEV) return;

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      toast(i18n.t('pwa.updateTitle'), {
        duration: Infinity,
        action: {
          label: i18n.t('pwa.updateAction'),
          onClick: () => {
            void updateSW(true);
          },
        },
      });
    },
    onOfflineReady() {
      toast.success(i18n.t('pwa.readyTitle'));
    },
  });
}
