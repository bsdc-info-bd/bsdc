import { MailCheck } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AuthCard } from '@/components/auth/AuthCard';
import { Seo } from '@/components/seo/Seo';
import { Alert, Button } from '@/design-system';
import { logout, resendVerificationEmail } from '@/lib/auth/auth-service';
import { authErrorKey } from '@/lib/auth/errors';
import { sanitizeRedirect } from '@/lib/auth/redirect';
import { ROUTES } from '@/lib/site';
import { useAuthStore } from '@/store/auth-store';

type Notice = { tone: 'success' | 'warning' | 'danger'; messageKey: string } | null;

export default function VerifyEmailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);

  const nextPath = sanitizeRedirect(params.get('next'), ROUTES.home);
  const verified = user?.emailVerified === true;

  async function resend() {
    if (!user) return;
    setBusy(true);
    try {
      await resendVerificationEmail(user, nextPath);
      setNotice({ tone: 'success', messageKey: 'auth.verify.resent' });
    } catch (error) {
      setNotice({ tone: 'danger', messageKey: authErrorKey(error) });
    } finally {
      setBusy(false);
    }
  }

  async function recheck() {
    if (!user) return;
    setBusy(true);
    try {
      await user.reload();
      if (user.emailVerified) {
        await user.getIdToken(true);
        navigate(nextPath, { replace: true });
        return;
      }
      setNotice({ tone: 'warning', messageKey: 'auth.verify.stillPending' });
    } catch (error) {
      setNotice({ tone: 'danger', messageKey: authErrorKey(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Seo
        title={t('auth.verify.metaTitle')}
        description={t('auth.verify.metaDescription')}
        path={ROUTES.verify}
        noindex
      />
      <AuthCard
        title={verified ? t('auth.verify.verifiedTitle') : t('auth.verify.title')}
        subtitle={
          verified
            ? t('auth.verify.verifiedBody')
            : t('auth.verify.body', { email: user?.email ?? '' })
        }
      >
        {notice ? <Alert tone={notice.tone} title={t(notice.messageKey)} className="mb-4" /> : null}

        {verified ? (
          <Button block onClick={() => navigate(nextPath, { replace: true })}>
            {t('auth.verify.continue')}
          </Button>
        ) : (
          <div className="grid gap-3">
            <div className="flex justify-center text-green-700">
              <MailCheck size={40} aria-hidden="true" />
            </div>
            <Button block loading={busy} onClick={() => void recheck()}>
              {t('auth.verify.recheck')}
            </Button>
            <Button variant="secondary" block disabled={busy} onClick={() => void resend()}>
              {t('auth.verify.resend')}
            </Button>
            <Button variant="ghost" block onClick={() => void logout()}>
              {t('auth.signOut')}
            </Button>
          </div>
        )}
      </AuthCard>
    </>
  );
}
