/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Github, Lock, Mail, Chrome } from 'lucide-react';
import { BsdcLogo } from '@/components/branding/Logo';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SEOHead } from '@/components/seo/SEOHead';
import { authErrorMessage, loginWithEmail, signInWithGithub, signInWithGoogle, signInWithYahoo } from '@/lib/auth';
import { APP_TAGLINE } from '@/config/constants';

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});
type LoginForm = z.infer<typeof loginSchema>;

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || '/';
  const { register, handleSubmit, formState, setError } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });
  const [oauthLoading, setOauthLoading] = useState('');

  async function onSubmit(data: LoginForm) {
    try {
      await loginWithEmail(data.email, data.password);
      toast.success(t('auth.welcomeBack'));
      navigate(from, { replace: true });
    } catch (e) {
      const code = (e as { code?: string }).code || '';
      const message = authErrorMessage(code);
      if (code === 'auth/user-not-found') {
        setError('email', { message });
      } else if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setError('password', { message });
      } else if (code === 'auth/too-many-requests') {
        setError('root', { message });
      } else if (code === 'auth/invalid-email') {
        setError('email', { message });
      } else {
        setError('root', { message });
      }
    }
  }

  async function oauth(login: () => Promise<void>, id: string) {
    setOauthLoading(id);
    try {
      await login();
      navigate(from, { replace: true });
    } catch (e) {
      toast.error(authErrorMessage((e as { code?: string }).code || ''));
    } finally {
      setOauthLoading('');
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10 bsdc-fabric-hero">
      <SEOHead
        title="Log in — BSDC"
        description="Log in to the Bangladesh Software Development Community with Google, GitHub, Yahoo or email."
        path="/login"
        noindex
      />
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <BsdcLogo height={44} className="mx-auto" />
          <h1 className="mt-4 text-2xl font-extrabold">{t('auth.welcomeBack')}</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{t('auth.loginSubtitle')}</p>
        </div>

        <div className="bsdc-surface space-y-3 p-6">
          <Button fullWidth variant="outline" loading={oauthLoading === 'google'} onClick={() => void oauth(signInWithGoogle, 'google')} icon={<Chrome className="h-5 w-5" aria-hidden />}>
            {t('auth.google')}
          </Button>
          <Button fullWidth variant="outline" loading={oauthLoading === 'github'} onClick={() => void oauth(signInWithGithub, 'github')} icon={<Github className="h-5 w-5" aria-hidden />}>
            {t('auth.github')}
          </Button>
          <Button fullWidth variant="outline" loading={oauthLoading === 'yahoo'} onClick={() => void oauth(signInWithYahoo, 'yahoo')} icon={<Mail className="h-5 w-5" aria-hidden />}>
            {t('auth.yahoo')}
          </Button>

          <div className="flex items-center gap-3 py-1">
            <span className="h-px flex-1 bg-surface-light-border dark:bg-surface-dark-border" />
            <span className="text-xs font-semibold uppercase text-neutral-400">{t('common.or')}</span>
            <span className="h-px flex-1 bg-surface-light-border dark:bg-surface-dark-border" />
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
            <Input
              label={t('common.email')}
              type="email"
              autoComplete="email"
              leftIcon={<Mail className="h-4 w-4" aria-hidden />}
              error={formState.errors.email?.message}
              {...register('email')}
            />
            <Input
              label={t('common.password')}
              type="password"
              autoComplete="current-password"
              leftIcon={<Lock className="h-4 w-4" aria-hidden />}
              error={formState.errors.password?.message}
              {...register('password')}
            />
            {formState.errors.root ? (
              <p className="bsdc-error-text text-center" role="alert">
                {formState.errors.root.message}
                {' — '}
                <Link to="/forgot-password" className="font-semibold underline">
                  {t('auth.forgotPassword')}
                </Link>
              </p>
            ) : null}
            <div className="flex justify-end">
              <Link to="/forgot-password" className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400">
                {t('auth.forgotPassword')}
              </Link>
            </div>
            <Button type="submit" fullWidth loading={formState.isSubmitting} icon={<Lock className="h-4 w-4" aria-hidden />}>
              {t('auth.emailLogin')}
            </Button>
          </form>
        </div>

        <p className="mt-5 text-center text-sm text-neutral-500 dark:text-neutral-400">
          {t('auth.noAccount')}{' '}
          <Link to="/register" className="font-bold text-brand-600 hover:underline dark:text-brand-400">
            {t('common.register')}
          </Link>
        </p>
        <p className="mt-6 text-center text-xs text-neutral-400">{APP_TAGLINE}</p>
      </div>
    </div>
  );
}

