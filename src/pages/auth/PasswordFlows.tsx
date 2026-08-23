/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowLeft, BadgeCheck, Lock, MailCheck, Mail } from 'lucide-react';
import { BsdcLogo } from '@/components/branding/Logo';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SEOHead } from '@/components/seo/SEOHead';
import { authErrorMessage, resendVerification, resetPassword } from '@/lib/auth';
import { useAuthStore } from '@/stores/authStore';
import { signOut } from '@/lib/auth';

const emailSchema = z.object({ email: z.string().email('Enter a valid email address') });
type EmailForm = z.infer<typeof emailSchema>;

export function ForgotPassword() {
  const { t } = useTranslation();
  const [sent, setSent] = useState(false);
  const { register, handleSubmit, formState, setError } = useForm<EmailForm>({ resolver: zodResolver(emailSchema) });

  async function onSubmit(data: EmailForm) {
    try {
      await resetPassword(data.email);
      setSent(true);
    } catch (e) {
      setError('email', { message: authErrorMessage((e as { code?: string }).code || '') });
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10 bsdc-fabric-hero">
      <SEOHead title="Reset password — BSDC" description="Reset your BSDC account password." path="/forgot-password" noindex />
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <BsdcLogo height={40} className="mx-auto" />
          <h1 className="mt-4 text-2xl font-extrabold">{sent ? t('auth.forgotSent') : t('auth.forgotTitle')}</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{sent ? t('auth.forgotSentBody') : t('auth.forgotSubtitle')}</p>
        </div>
        <div className="bsdc-surface p-6">
          {sent ? (
            <div className="flex flex-col items-center gap-4 py-2 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-400">
                <MailCheck className="h-7 w-7" aria-hidden />
              </span>
              <Link to="/login">
                <Button variant="outline" icon={<ArrowLeft className="h-4 w-4" aria-hidden />}>
                  {t('common.login')}
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <Input label={t('common.email')} type="email" autoComplete="email" leftIcon={<Mail className="h-4 w-4" aria-hidden />} error={formState.errors.email?.message} {...register('email')} />
              <Button type="submit" fullWidth loading={formState.isSubmitting}>
                {t('auth.forgotTitle')}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export function VerifyEmail() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const authUser = useAuthStore((s) => s.authUser);
  const email = (location.state as { email?: string } | null)?.email || authUser?.email || '';
  const [sending, setSending] = useState(false);

  async function handleResend() {
    if (!authUser) {
      navigate('/login', { replace: true });
      return;
    }
    setSending(true);
    try {
      await resendVerification(authUser);
      toast.success(t('auth.resendSent'));
    } catch (e) {
      toast.error(authErrorMessage((e as { code?: string }).code || ''));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10 bsdc-fabric-hero">
      <SEOHead title="Verify your email — BSDC" description="Verify your email to activate your BSDC account." path="/verify-email" noindex />
      <div className="w-full max-w-md text-center">
        <div className="mb-6">
          <BsdcLogo height={40} className="mx-auto" />
        </div>
        <div className="bsdc-surface p-8">
          <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-400">
            <BadgeCheck className="h-8 w-8" aria-hidden />
          </span>
          <h1 className="text-xl font-extrabold">{t('auth.verifyTitle')}</h1>
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
            {t('auth.verifyBody')}
            {email ? (
              <>
                <br />
                <span className="font-semibold text-neutral-700 dark:text-neutral-200">{email}</span>
              </>
            ) : null}
          </p>
          <div className="mt-6 space-y-2">
            <Button fullWidth loading={sending} onClick={() => void handleResend()}>
              {t('auth.resend')}
            </Button>
            <Button fullWidth variant="outline" icon={<Lock className="h-4 w-4" aria-hidden />} onClick={async () => { await signOut(); navigate('/login'); }}>
              {t('common.logout')}
            </Button>
          </div>
          <p className="mt-4 text-xs text-neutral-400">
            {t('auth.checkInbox')} —{' '}
            <button
              type="button"
              className="font-semibold text-brand-600 underline dark:text-brand-400"
              onClick={() => window.location.reload()}
            >
              I have verified — refresh
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
