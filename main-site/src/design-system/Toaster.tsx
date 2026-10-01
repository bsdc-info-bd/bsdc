import { Toaster as SonnerToaster } from 'sonner';
import { useThemeStore } from '@/store/theme-store';

/** App-wide toast surface, theme aware and screen-reader friendly. */
export function Toaster() {
  const resolved = useThemeStore((state) => state.resolved);
  return (
    <SonnerToaster
      theme={resolved}
      position="bottom-center"
      richColors={false}
      closeButton
      toastOptions={{
        classNames: {
          toast: 'rounded-card border border-border bg-surface text-text shadow-raised',
          description: 'text-muted',
        },
      }}
    />
  );
}
