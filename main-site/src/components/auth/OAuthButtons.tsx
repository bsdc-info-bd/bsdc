import { Github } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/auth-store';
import { Button } from '@/design-system';
import { authErrorKey } from '@/lib/auth/errors';
import { signInWithProvider, type OAuthProviderId } from '@/lib/auth/auth-service';

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
  const [pending, setPending] = useState<OAuthProviderId | null>(null);

  async function start(id: OAuthProviderId) {
    if (pending) return;
    useAuthStore.getState().setRedirectError(null);
    setPending(id);
    try {
      await signInWithProvider(id, remember);
    } catch (error) {
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

  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">
          {t('auth.orContinueWith')}
        </span>
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
      </div>
      <div className="mt-3 grid gap-2">
        {providers.map((provider) => (
          <Button
            key={provider.id}
            variant="secondary"
            block
            iconStart={provider.icon}
            loading={pending === provider.id}
            disabled={disabled || (pending !== null && pending !== provider.id)}
            onClick={() => void start(provider.id)}
          >
            {provider.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
