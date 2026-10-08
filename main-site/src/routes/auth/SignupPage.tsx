import { zodResolver } from '@hookform/resolvers/zod';
import { Mail, User } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { AuthCard } from '@/components/auth/AuthCard';
import { OAuthButtons } from '@/components/auth/OAuthButtons';
import { Seo } from '@/components/seo/Seo';
import { Alert, Button, PasswordField, PasswordStrength, Switch, TextField } from '@/design-system';
import { signUpWithEmail } from '@/lib/auth/auth-service';
import { authErrorKey } from '@/lib/auth/errors';
import { sanitizeRedirect } from '@/lib/auth/redirect';
import { isConfigured } from '@/lib/env';
import { useAuthStore } from '@/store/auth-store';
import { ROUTES } from '@/lib/site';

const schema = z
  .object({
    displayName: z.string().trim().min(2).max(60),
    email: z.string().trim().min(1).email(),
    password: z
      .string()
      .min(8)
      .refine((value) => /[A-Za-z]/.test(value) && /\d/.test(value), { path: [], params: {} }),
    confirmPassword: z.string().min(1),
    age: z.literal(true),
    terms: z.literal(true),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
  });

type FormValues = z.infer<typeof schema>;

export default function SignupPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const redirectError = useAuthStore((state) => state.redirectError);
  const [remember, setRemember] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      displayName: '',
      email: '',
      password: '',
      confirmPassword: '',
      age: false as unknown as true,
      terms: false as unknown as true,
    },
  });

  const password = watch('password');
  const age = watch('age');
  const terms = watch('terms');
  const nextPath = sanitizeRedirect(params.get('next'), ROUTES.onboarding);

  async function onSubmit(values: FormValues) {
    setErrorKey(null);
    try {
      await signUpWithEmail({
        email: values.email,
        password: values.password,
        displayName: values.displayName,
        remember,
        nextPath,
      });
    } catch (error) {
      setErrorKey(authErrorKey(error));
    }
  }

  return (
    <>
      <Seo
        title={t('auth.signup.metaTitle')}
        description={t('auth.signup.metaDescription')}
        path={ROUTES.signup}
        noindex
      />
      <AuthCard
        title={t('auth.signup.title')}
        subtitle={t('auth.signup.subtitle')}
        footer={
          <>
            {t('auth.signup.haveAccount')}{' '}
            <Link to={ROUTES.login} className="font-semibold text-green-700 underline">
              {t('auth.signIn')}
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

        <form
          noValidate
          onSubmit={(event) => void handleSubmit(onSubmit)(event)}
          className="grid gap-4"
        >
          <TextField
            label={t('auth.fields.displayName')}
            hint={t('auth.hints.displayName')}
            autoComplete="name"
            iconStart={<User size={18} />}
            error={errors.displayName ? t('auth.validation.displayNameRequired') : undefined}
            {...register('displayName')}
          />
          <TextField
            label={t('auth.fields.email')}
            type="email"
            inputMode="email"
            autoComplete="email"
            iconStart={<Mail size={18} />}
            error={errors.email ? t('auth.validation.emailInvalid') : undefined}
            {...register('email')}
          />
          <div>
            <PasswordField
              label={t('auth.fields.password')}
              hint={t('auth.hints.password')}
              autoComplete="new-password"
              error={errors.password ? t('auth.validation.passwordWeak') : undefined}
              {...register('password')}
            />
            <PasswordStrength password={password} />
          </div>
          <PasswordField
            label={t('auth.fields.confirmPassword')}
            autoComplete="new-password"
            error={errors.confirmPassword ? t('auth.validation.passwordMismatch') : undefined}
            {...register('confirmPassword')}
          />

          <Switch
            checked={age === true}
            onCheckedChange={(checked) =>
              setValue('age', checked as true, { shouldValidate: true })
            }
            label={t('auth.signup.ageConfirm')}
          />
          {errors.age ? (
            <p role="alert" className="-mt-2 text-xs font-medium text-danger">
              {t('auth.validation.ageRequired')}
            </p>
          ) : null}

          <Switch
            checked={terms === true}
            onCheckedChange={(checked) =>
              setValue('terms', checked as true, { shouldValidate: true })
            }
            label={t('auth.signup.termsAccept')}
          />
          {errors.terms ? (
            <p role="alert" className="-mt-2 text-xs font-medium text-danger">
              {t('auth.validation.termsRequired')}
            </p>
          ) : null}

          <Switch checked={remember} onCheckedChange={setRemember} label={t('auth.rememberMe')} />

          <Button type="submit" block loading={isSubmitting} disabled={!isConfigured.firebase}>
            {t('auth.signUp')}
          </Button>
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
