import { zodResolver } from '@hookform/resolvers/zod';
import { Mail } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { AuthCard } from '@/components/auth/AuthCard';
import { Seo } from '@/components/seo/Seo';
import { Alert, Button, TextField } from '@/design-system';
import { requestPasswordReset } from '@/lib/auth/auth-service';
import { authErrorKey } from '@/lib/auth/errors';
import { isConfigured } from '@/lib/env';
import { ROUTES } from '@/lib/site';

const schema = z.object({ email: z.string().trim().min(1).email() });
type FormValues = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const [sent, setSent] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '' } });

  async function onSubmit(values: FormValues) {
    setErrorKey(null);
    try {
      await requestPasswordReset(values.email);
      // The confirmation is deliberately identical whether or not the account
      // exists, so the form cannot be used to enumerate members.
      setSent(true);
    } catch (error) {
      const key = authErrorKey(error);
      if (key === 'auth.errors.invalidCredentials') {
        setSent(true);
        return;
      }
      setErrorKey(key);
    }
  }

  return (
    <>
      <Seo
        title={t('auth.reset.metaTitle')}
        description={t('auth.reset.metaDescription')}
        path={ROUTES.reset}
        noindex
      />
      <AuthCard
        title={t('auth.reset.title')}
        subtitle={t('auth.reset.subtitle')}
        footer={
          <Link to={ROUTES.login} className="font-semibold text-green-700 underline">
            {t('auth.reset.backToLogin')}
          </Link>
        }
      >
        {!isConfigured.firebase ? (
          <Alert tone="danger" title={t('auth.errors.notConfigured')} className="mb-4" />
        ) : null}
        {errorKey ? <Alert tone="danger" title={t(errorKey)} className="mb-4" /> : null}

        {sent ? (
          <Alert tone="success" title={t('auth.reset.sentTitle')}>
            {t('auth.reset.sentBody')}
          </Alert>
        ) : (
          <form
            noValidate
            onSubmit={(event) => void handleSubmit(onSubmit)(event)}
            className="grid gap-4"
          >
            <TextField
              label={t('auth.fields.email')}
              type="email"
              inputMode="email"
              autoComplete="email"
              iconStart={<Mail size={18} />}
              error={errors.email ? t('auth.validation.emailInvalid') : undefined}
              {...register('email')}
            />
            <Button type="submit" block loading={isSubmitting} disabled={!isConfigured.firebase}>
              {t('auth.reset.submit')}
            </Button>
          </form>
        )}
      </AuthCard>
    </>
  );
}
