/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Chrome, Github, Lock, Mail, User } from 'lucide-react';
import { BsdcLogo } from '@/components/branding/Logo';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SEOHead } from '@/components/seo/SEOHead';
import { authErrorMessage, registerWithEmail, signInWithGithub, signInWithGoogle, signInWithYahoo } from '@/lib/auth';
import { useAuthStore } from '@/stores/authStore';

const registerSchema = z
  .object({
    displayName: z.string().min(2, 'Enter your name (2+ characters)').max(50, 'Name is too long'),
    email: z.string().email('Enter a valid email address'),
    password: z
      .string()
      .min(8, 'At least 8 characters')
      .regex(/[A-Z]/, 'Include at least 1 uppercase letter')
      .regex(/[0-9]/, 'Include at least 1 number'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
type RegisterForm = z.infer<typeof registerSchema>;

export default function Register() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setStage = useAuthStore((s) => s.setStage);
  const { register, handleSubmit, formState, setError } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  });
  const [oauthLoading, setOauthLoading] = useState('');

  async function onSubmit(data: RegisterForm) {
    try {
      await registerWithEmail(data.displayName, data.email, data.password);
      setStage('needsVerification');
      toast.success('Account created — check your email to verify');
      navigate('/verify-email', { replace: true, state: { email: data.email } });
    } catch (e) {
      const code = (e as { code?: string }).code || '';
      const message = authErrorMessage(code);
      if (code === 'auth/email-already-in-use') setError('email', { message });
      else if (code === 'auth/weak-password') setError('password', { message });
      else setError('root', { message });
    }
  }

  async function oauth(login: () => Promise<void>, id: string) {
    setOauthLoading(id);
    try {
      await login();
      navigate('/', { replace: true });
    } catch (e) {
      toast.error(authErrorMessage((e as { code?: string }).code || ''));
    } finally {
      setOauthLoading('');
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10 bsdc-fabric-hero">
      <SEOHead
        title="Create account — BSDC"
        description="Join the Bangladesh Software Development Community — free developer account with Google, GitHub, Yahoo or email."
        path="/register"
      />
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <BsdcLogo height={44} className="mx-auto" />
          <h1 className="mt-4 text-2xl font-extrabold">{t('auth.registerTitle')}</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{t('auth.registerSubtitle')}</p>
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
              label={t('common.displayName')}
              autoComplete="name"
              leftIcon={<User className="h-4 w-4" aria-hidden />}
              error={formState.errors.displayName?.message}
              {...register('displayName')}
            />
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
              autoComplete="new-password"
              hint={t('auth.passwordHint')}
              leftIcon={<Lock className="h-4 w-4" aria-hidden />}
              error={formState.errors.password?.message}
              {...register('password')}
            />
            <Input
              label={t('auth.confirmPassword')}
              type="password"
              autoComplete="new-password"
              leftIcon={<Lock className="h-4 w-4" aria-hidden />}
              error={formState.errors.confirmPassword?.message}
              {...register('confirmPassword')}
            />
            {formState.errors.root ? (
              <p className="bsdc-error-text text-center" role="alert">
                {formState.errors.root.message}
              </p>
            ) : null}
            <Button type="submit" fullWidth loading={formState.isSubmitting}>
              {t('auth.emailRegister')}
            </Button>
          </form>
        </div>

        <p className="mt-5 text-center text-sm text-neutral-500 dark:text-neutral-400">
          {t('auth.hasAccount')}{' '}
          <Link to="/login" className="font-bold text-brand-600 hover:underline dark:text-brand-400">
            {t('common.login')}
          </Link>
        </p>
      </div>
    </div>
  );
}
