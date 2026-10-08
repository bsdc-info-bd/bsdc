import { zodResolver } from '@hookform/resolvers/zod';
import { Mail } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { AuthCard } from '@/components/auth/AuthCard';
import { OAuthButtons } from '@/components/auth/OAuthButtons';
import { Seo } from '@/components/seo/Seo';
import { Alert, Button, PasswordField, Switch, TextField } from '@/design-system';
import { signInWithEmail } from '@/lib/auth/auth-service';
import { authErrorKey } from '@/lib/auth/errors';
import {
  clearAttempts,
  lockoutSecondsRemaining,
  registerFailedAttempt,
} from '@/lib/auth/rate-limit';
import { isConfigured } from '@/lib/env';
import { useAuthStore } from '@/store/auth-store';
import { ROUTES } from '@/lib/site';

const schema = z.object({
  email: z.string().trim().min(1).email(),
  password: z.string().min(1),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const redirectError = useAuthStore((state) => state.redirectError);
  const [remember, setRemember] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [lockedFor, setLockedFor] = useState(() => lockoutSecondsRemaining('login'));

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  const nextParam = params.get('next');
  const signupHref = nextParam
    ? `${ROUTES.signup}?next=${encodeURIComponent(nextParam)}`
    : ROUTES.signup;

  async function onSubmit(values: FormValues) {
    setErrorKey(null);
    const waiting = lockoutSecondsRemaining('login');
    if (waiting > 0) {
      setLockedFor(waiting);
      return;
    }
    try {
      await signInWithEmail({ email: values.email, password: values.password, remember });
      clearAttempts('login');
      // AuthProvider flips the session to "authenticated"; RequireGuest then
      // redirects this route to the requested destination.
    } catch (error) {
      setErrorKey(authErrorKey(error));
      setLockedFor(registerFailedAttempt('login'));
    }
  }

  return (
    <>
      <Seo
        title={t('auth.login.metaTitle')}
        description={t('auth.login.metaDescription')}
        path={ROUTES.login}
        noindex
      />
      <AuthCard
        title={t('auth.login.title')}
        subtitle={t('auth.login.subtitle')}
        footer={
          <>
            {t('auth.login.noAccount')}{' '}
            <Link to={signupHref} className="font-semibold text-green-700 underline">
              {t('auth.signUp')}
            </Link>
          </>
        }
      >
        {!isConfigured.firebase ? (
          <Alert tone="danger" title={t('auth.errors.notConfigured')} className="mb-4" />
        ) : null}
        {errorKey || redirectError ? (
          <Alert tone="danger" title={t(errorKey ?? redirectError!)} className="mb-4" />
        ) : null}
        {lockedFor > 0 ? (
          <Alert
            tone="warning"
            title={t('auth.lockout', { seconds: lockedFor })}
            className="mb-4"
          />
        ) : null}

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
          <PasswordField
            label={t('auth.fields.password')}
            autoComplete="current-password"
            error={errors.password ? t('auth.validation.passwordShort') : undefined}
            {...register('password')}
          />
          <Switch checked={remember} onCheckedChange={setRemember} label={t('auth.rememberMe')} />
          <Button
            type="submit"
            block
            loading={isSubmitting}
            disabled={!isConfigured.firebase || lockedFor > 0}
          >
            {t('auth.signIn')}
          </Button>
          <Link to={ROUTES.reset} className="text-center text-sm text-green-700 underline">
            {t('auth.login.forgot')}
          </Link>
        </form>

        <div className="mt-5">
          <OAuthButtons
            remember={remember}
            disabled={!isConfigured.firebase}
            onError={setErrorKey}
          />
        </div>
      </AuthCard>
    </>
  );
}
