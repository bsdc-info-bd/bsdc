import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Seo } from '@/components/seo';
import { Button, Input, useToast } from '@/components/ui';
import { signInWithGoogle, signInWithGithub, registerWithEmail, mapAuthError } from '@/lib/firebase/auth';
import { isFirebaseConfigured, config } from '@/config';
import { isValidUsername } from '@/utils';
import { Github } from 'lucide-react';

const registerSchema = z
  .object({
    displayName: z.string().min(2, 'Name must be at least 2 characters').max(50),
    username: z
      .string()
      .min(3, 'Username must be at least 3 characters')
      .max(30, 'Username must be at most 30 characters')
      .regex(/^[a-zA-Z0-9_]+$/, 'Only letters, numbers, and underscores'),
    email: z.string().email('Please enter a valid email'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  });

  const username = watch('username', '');

  const isReserved = username && (config.app.reservedUsernames as readonly string[]).includes(username.toLowerCase());
  const usernameValid = username && isValidUsername(username) && !isReserved;

  const onSubmit = async (data: RegisterForm) => {
    if (!isFirebaseConfigured()) {
      toast({ type: 'warning', title: 'Firebase not configured', message: 'Set environment variables to enable authentication.' });
      return;
    }
    if (isReserved) {
      toast({ type: 'error', title: t('auth.usernameReserved') });
      return;
    }
    setIsLoading(true);
    try {
      await registerWithEmail(data.email, data.password, data.displayName);
      toast({ type: 'success', title: 'Account created! Please check your email for verification.' });
      navigate('/feed');
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code || '';
      toast({ type: 'error', title: mapAuthError(code) });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleRegister = async () => {
    if (!isFirebaseConfigured()) {
      toast({ type: 'warning', title: 'Firebase not configured' });
      return;
    }
    setOauthLoading('google');
    try {
      await signInWithGoogle();
      toast({ type: 'success', title: 'Signed in with Google' });
      navigate('/feed');
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code || '';
      toast({ type: 'error', title: mapAuthError(code) });
    } finally {
      setOauthLoading(null);
    }
  };

  const handleGithubRegister = async () => {
    if (!isFirebaseConfigured()) {
      toast({ type: 'warning', title: 'Firebase not configured' });
      return;
    }
    setOauthLoading('github');
    try {
      await signInWithGithub();
      toast({ type: 'success', title: 'Account created with GitHub' });
      navigate('/feed');
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code || '';
      toast({ type: 'error', title: mapAuthError(code) });
    } finally {
      setOauthLoading(null);
    }
  };
  return (
    <>
      <Seo title={t('auth.signUp')} description="Join BSDC" noindex />
      <div className="w-full max-w-md mx-auto">
        <div className="text-center mb-8">
          <Link to="/" className="inline-block">
            <h1 className="text-2xl font-bold text-brand-500">{t('common.appName')}</h1>
          </Link>
          <h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">
            {t('auth.signUp')}
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Join the developer community
          </p>
        </div>

        <div className="card p-6 space-y-4">
          <div className="space-y-3">
            <Button
              variant="outline"
              className="w-full"
              onClick={handleGoogleRegister}
              isLoading={oauthLoading === 'google'}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              {t('auth.signUpWith', { provider: 'Google' })}
            </Button>

            <Button
              variant="outline"
              className="w-full"
              onClick={handleGithubRegister}
              isLoading={oauthLoading === 'github'}
            >
              <Github className="h-5 w-5" />
              {t('auth.signUpWith', { provider: 'GitHub' })}
            </Button>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200 dark:border-gray-700" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white dark:bg-gray-900 px-2 text-gray-400">{t('common.or')}</span>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label={t('auth.displayName')}
              autoComplete="name"
              error={errors.displayName?.message}
              {...register('displayName')}
            />
            <Input
              label={t('auth.username')}
              autoComplete="username"
              error={errors.username?.message || (isReserved ? t('auth.usernameReserved') : undefined)}
              helperText={
                usernameValid ? `Your profile: bsdc.info.bd/@${username}` : undefined
              }
              {...register('username')}
            />
            <Input
              label={t('auth.email')}
              type="email"
              autoComplete="email"
              error={errors.email?.message}
              {...register('email')}
            />
            <Input
              label={t('auth.password')}
              type="password"
              autoComplete="new-password"
              error={errors.password?.message}
              {...register('password')}
            />
            <Input
              label={t('auth.confirmPassword')}
              type="password"
              autoComplete="new-password"
              error={errors.confirmPassword?.message}
              {...register('confirmPassword')}
            />

            <Button type="submit" variant="primary" className="w-full" isLoading={isLoading}>
              {t('auth.signUp')}
            </Button>
          </form>
        </div>

        <p className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
          {t('auth.alreadyHaveAccount')}{' '}
          <Link to="/login" className="text-brand-500 hover:text-brand-600 hover:underline font-medium">
            {t('auth.signIn')}
          </Link>
        </p>
      </div>
    </>
  );
}
