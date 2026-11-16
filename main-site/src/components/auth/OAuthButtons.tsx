import { Github } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/design-system';
import { signInWithProvider, type OAuthProviderId } from '@/lib/auth/auth-service';
import { authErrorKey } from '@/lib/auth/errors';
import { useAuthStore } from '@/store/auth-store';

export interface OAuthButtonsProps {
  remember: boolean;
  disabled?: boolean;
  onError: (messageKey: string) => void;
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.4a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.6-5.2 3.6-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3a7.2 7.2 0 0 1-10.7-3.8h-4v3.1A12 12 0 0 0 12 24Z"
      />
      <path fill="#FBBC05" d="M5.4 14.3a7.2 7.2 0 0 1 0-4.6v-3.1h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8Z"
      />
    </svg>
  );
}

function YahooMark() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        fill="#6001D2"
        d="M3 5h4.2l3.3 7.1L13.9 5H18l-6.4 13.2H7.4l1.8-3.6L3 5Zm15.1 9.2a1.9 1.9 0 1 1 0 3.8 1.9 1.9 0 0 1 0-3.8ZM21 5l-3.2 7.6h-3L18 5h3Z"
      />
    </svg>
  );
}

/** Google, GitHub and Yahoo — the exact provider set approved for BSDC. */
export function OAuthButtons({ remember, disabled = false, onError }: OAuthButtonsProps) {
  const { t } = useTranslation();
  const redirectResolving = useAuthStore((state) => state.redirectResolving);
  const authStatus = useAuthStore((state) => state.status);
  const [pending, setPending] = useState<OAuthProviderId | null>(null);
  const [settling, setSettling] = useState(false);

  useEffect(() => {
    if (!settling) return;
    const timer = window.setTimeout(() => setSettling(false), 4_000);
    return () => window.clearTimeout(timer);
  }, [settling]);

  async function start(id: OAuthProviderId) {
    if (pending || settling || redirectResolving || authStatus === 'authenticated') return;
    useAuthStore.getState().setRedirectError(null);
    setPending(id);
    try {
      await signInWithProvider(id, remember);
      // Keep the button locked briefly while Firebase onAuthStateChanged + claims
      // + profile hydration finishes so a rapid double-tap cannot open a second popup.
      setSettling(true);
    } catch (error) {
      setSettling(false);
      onError(authErrorKey(error));
    } finally {
      setPending(null);
    }
  }

  const providers: { id: OAuthProviderId; label: string; icon: JSX.Element }[] = [
    { id: 'google', label: t('auth.continueWithGoogle'), icon: <GoogleMark /> },
    { id: 'github', label: t('auth.continueWithGithub'), icon: <Github size={18} /> },
    { id: 'yahoo', label: t('auth.continueWithYahoo'), icon: <YahooMark /> },
  ];

  const lockAll = disabled || redirectResolving || settling || authStatus === 'authenticated';

  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">
          {t('auth.orContinueWith')}
        </span>
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
      </div>
      <div className="mt-3 grid gap-2.5">
        {providers.map((provider) => {
          const isCurrent = pending === provider.id;
          return (
            <Button
              key={provider.id}
              variant="secondary"
              block
              iconStart={provider.icon}
              loading={isCurrent}
              disabled={lockAll || (pending !== null && !isCurrent)}
              className="justify-center border-border bg-bg transition-all duration-150 ease-app hover:-translate-y-0.5 hover:border-green-500/50 hover:bg-surface active:translate-y-0"
              onClick={() => void start(provider.id)}
            >
              {isCurrent || settling ? t('auth.oauthSigningIn') : provider.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
