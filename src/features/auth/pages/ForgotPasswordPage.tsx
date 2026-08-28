import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Seo } from '@/components/seo';
import { Button, Input, useToast } from '@/components/ui';
import { resetPassword, mapAuthError } from '@/lib/firebase/auth';
import { isFirebaseConfigured } from '@/config';
import { Mail } from 'lucide-react';

const schema = z.object({
  email: z.string().email('Please enter a valid email'),
});

type FormData = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    getValues,
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    if (!isFirebaseConfigured()) {
      toast({ type: 'warning', title: 'Firebase not configured' });
      return;
    }
    setIsLoading(true);
    try {
      await resetPassword(data.email);
      setSent(true);
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code || '';
      toast({ type: 'error', title: mapAuthError(code) });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Seo title={t('auth.resetPassword')} noindex />
      <div className="w-full max-w-md mx-auto">
        <div className="text-center mb-8">
          <Link to="/" className="inline-block">
            <h1 className="text-2xl font-bold text-brand-500">{t('common.appName')}</h1>
          </Link>
          <h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">
            {t('auth.resetPassword')}
          </h2>
        </div>

        <div className="card p-6">
          {sent ? (
            <div className="text-center space-y-4">
              <Mail className="h-12 w-12 mx-auto text-brand-500" />
              <p className="text-gray-600 dark:text-gray-400">
                {t('auth.verificationSent', { email: getValues('email') })}
              </p>
              <Link to="/login">
                <Button variant="outline" className="w-full">
                  {t('common.back')} to {t('auth.signIn')}
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Enter your email address and we'll send you a link to reset your password.
              </p>
              <Input
                label={t('auth.email')}
                type="email"
                autoComplete="email"
                error={errors.email?.message}
                {...register('email')}
              />
              <Button type="submit" variant="primary" className="w-full" isLoading={isLoading}>
                {t('auth.sendResetLink')}
              </Button>
              <Link to="/login">
                <Button variant="ghost" className="w-full">
                  {t('common.back')} to {t('auth.signIn')}
                </Button>
              </Link>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
