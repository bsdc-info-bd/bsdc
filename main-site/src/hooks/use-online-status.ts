import { useEffect } from 'react';
import { useUiStore } from '@/store/ui-store';

/** Keeps the UI store in sync with network availability for offline banners. */
export function useOnlineStatus(): boolean {
  const online = useUiStore((state) => state.online);
  const setOnline = useUiStore((state) => state.setOnline);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    setOnline(navigator.onLine);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [setOnline]);

  return online;
}
