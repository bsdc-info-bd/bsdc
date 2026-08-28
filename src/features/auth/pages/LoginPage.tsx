import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Seo } from '@/components/seo';
import { Button, Input, useToast } from '@/components/ui';
import { signInWithGoogle, signInWithGithub, signInWithEmail, mapAuthError } from '@/lib/firebase/auth';
import { isFirebaseConfigured } from '@/config';
import { Github } from 'lucide-react';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    if (!isFirebaseConfigured()) {
      toast({ type: 'warning', title: 'Firebase not configured', message: 'Set environment variables to enable authentication.' });
      return;
    }
    setIsLoading(true);
    try {
      await signInWithEmail(data.email, data.password);
      toast({ type: 'success', title: 'Signed in successfully' });
      navigate('/feed');
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code || '';
      toast({ type: 'error', title: mapAuthError(code) });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
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

  const handleGithubLogin = async () => {
    if (!isFirebaseConfigured()) {
      toast({ type: 'warning', title: 'Firebase not configured' });
      return;
    }
    setOauthLoading('github');
    try {
      await signInWithGithub();
      toast({ type: 'success', title: 'Signed in with GitHub' });
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
      <Seo title={t('auth.signIn')} description="Sign in to BSDC" noindex />
      <div className="w-full max-w-md mx-auto">
        <div className="text-center mb-8">
          <Link to="/" className="inline-block">
            <h1 className="text-2xl font-bold text-brand-500">{t('common.appName')}</h1>
          </Link>
          <h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">
            {t('auth.signIn')}
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('common.tagline')}
          </p>
        </div>

        <div className="card p-6 space-y-4">
          {/* OAuth buttons */}
          <div className="space-y-3">
            <Button
              variant="outline"
              className="w-full"
              onClick={handleGoogleLogin}
              isLoading={oauthLoading === 'google'}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              {t('auth.signInWith', { provider: 'Google' })}
            </Button>

            <Button
              variant="outline"
              className="w-full"
              onClick={handleGithubLogin}
              isLoading={oauthLoading === 'github'}
            >
              <Github className="h-5 w-5" />
              {t('auth.signInWith', { provider: 'GitHub' })}
            </Button>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200 dark:border-gray-700" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white dark:bg-gray-900 px-2 text-gray-400">
                {t('common.or')}
              </span>
            </div>
          </div>

          {/* Email form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
              autoComplete="current-password"
              error={errors.password?.message}
              {...register('password')}
            />

            <div className="flex justify-end">
              <Link
                to="/forgot-password"
                className="text-sm text-brand-500 hover:text-brand-600 hover:underline"
              >
                {t('auth.forgotPassword')}
              </Link>
            </div>

            <Button type="submit" variant="primary" className="w-full" isLoading={isLoading}>
              {t('auth.signIn')}
            </Button>
          </form>
        </div>

        <p className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
          {t('auth.dontHaveAccount')}{' '}
          <Link to="/register" className="text-brand-500 hover:text-brand-600 hover:underline font-medium">
            {t('auth.signUp')}
          </Link>
        </p>
      </div>
    </>
  );
}
