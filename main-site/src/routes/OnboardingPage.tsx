import { ArrowRight, AtSign, Check, Link2, RefreshCw, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AvatarUploader } from '@/components/media/AvatarUploader';
import { LocationField } from '@/components/profile/LocationField';
import { Seo } from '@/components/seo/Seo';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  PageSkeleton,
  SelectField,
  Stepper,
  TagInput,
  TextField,
  TextareaField,
} from '@/design-system';
import type { Language } from '@/i18n';
import { profileErrorKey } from '@/lib/profile/profile-errors';
import {
  isProfileOnboarded,
  isUsernameAvailable,
  saveProfile,
  usernameSchema,
  type ProfileDraft,
} from '@/lib/profile/profile-service';
import { profilePath, ROUTES } from '@/lib/site';
import { useAuthStore } from '@/store/auth-store';
import { useProfileStore } from '@/store/profile-store';

type Availability = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

const STEP_KEYS = ['identity', 'profile', 'interests', 'review'] as const;

const SKILL_SUGGESTIONS = [
  'javascript',
  'typescript',
  'react',
  'nodejs',
  'laravel',
  'php',
  'python',
  'django',
  'flutter',
  'android',
  'devops',
  'ui-design',
] as const;

const INTEREST_SUGGESTIONS = [
  'open-source',
  'freelancing',
  'startups',
  'ai',
  'security',
  'mobile',
  'web',
  'career',
] as const;

function suggestUsername(displayName: string, email: string): string {
  const base = (displayName || email.split('@')[0] || '').toLowerCase();
  const cleaned = base.replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned.slice(0, 24);
}

export default function OnboardingPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const profileLoaded = useAuthStore((state) => state.profileLoaded);
  const profile = useProfileStore((state) => state.profile);
  const profileError = useProfileStore((state) => state.error);
  const setProfile = useProfileStore((state) => state.setProfile);

  const [step, setStep] = useState(0);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const [username, setUsername] = useState(
    () => profile?.username ?? suggestUsername(user?.displayName ?? '', user?.email ?? ''),
  );
  const [displayName, setDisplayName] = useState(
    () => profile?.displayName ?? user?.displayName ?? '',
  );
  const [bio, setBio] = useState(() => profile?.bio ?? '');
  const [location, setLocation] = useState(() => profile?.location ?? '');
  const [website, setWebsite] = useState(() => profile?.website ?? '');
  const [avatarUrl, setAvatarUrl] = useState(() => profile?.avatarUrl ?? user?.photoURL ?? '');
  const [skills, setSkills] = useState<string[]>(() => profile?.skills ?? []);
  const [interests, setInterests] = useState<string[]>(() => profile?.interests ?? []);
  const [language, setLanguage] = useState<Language>(
    () => profile?.language ?? (i18n.language === 'en' ? 'en' : 'bn'),
  );
  const [availability, setAvailability] = useState<Availability>('idle');
  const hydratedStampRef = useRef<string | null>(
    profile ? `${profile.uid}:${profile.updatedAt}` : null,
  );

  // Sync late-arriving profile data without clobbering edits already entered.
  useEffect(() => {
    if (!profile) return;
    const stamp = `${profile.uid}:${profile.updatedAt}`;
    if (hydratedStampRef.current === stamp) return;
    hydratedStampRef.current = stamp;
    if (profile.username) setUsername(profile.username);
    if (profile.displayName) setDisplayName(profile.displayName);
    if (profile.bio) setBio(profile.bio);
    if (profile.location) setLocation(profile.location);
    if (profile.website) setWebsite(profile.website);
    if (profile.avatarUrl) setAvatarUrl(profile.avatarUrl);
    if (profile.skills.length > 0) setSkills(profile.skills);
    if (profile.interests.length > 0) setInterests(profile.interests);
    setLanguage(profile.language);
  }, [profile]);

  const usernameValid = usernameSchema.safeParse(username).success;

  // Debounced availability probe so each keystroke does not hit the database.
  useEffect(() => {
    if (!usernameValid) {
      setAvailability(username.length === 0 ? 'idle' : 'invalid');
      return;
    }
    if (profile?.username === username) {
      setAvailability('available');
      return;
    }
    setAvailability('checking');
    let active = true;
    const timer = window.setTimeout(() => {
      isUsernameAvailable(username)
        .then((free) => {
          if (active) setAvailability(free ? 'available' : 'taken');
        })
        .catch(() => {
          if (active) setAvailability('idle');
        });
    }, 450);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [username, usernameValid, profile?.username]);

  const steps = useMemo(() => STEP_KEYS.map((key) => t(`onboarding.steps.${key}`)), [t]);

  const websiteValid = website.length === 0 || /^https:\/\/\S+\.\S+/.test(website);
  const avatarValid = avatarUrl.length === 0 || /^https:\/\/\S+/.test(avatarUrl);

  const canContinue =
    step === 0
      ? usernameValid && availability === 'available' && displayName.trim().length >= 2
      : step === 1
        ? bio.length <= 280 && websiteValid && avatarValid
        : true;

  // A cover already on the row is carried through, never overwritten with ''.
  const coverUrl = profile?.coverUrl ?? '';

  const finish = useCallback(async () => {
    if (!user) return;
    setSaving(true);
    setErrorKey(null);
    const draft: ProfileDraft = {
      username,
      displayName: displayName.trim(),
      bio: bio.trim(),
      avatarUrl,
      // Onboarding edits a profile, it does not replace one: a cover the
      // member already has survives the walk through these steps.
      coverUrl,
      location: location.trim(),
      website,
      skills,
      interests,
      language,
      onboardingComplete: true,
    };
    try {
      const saved = await saveProfile(user.uid, draft);
      setProfile(saved);
      toast.success(t('onboarding.saved'));
      navigate(profilePath(saved.username), { replace: true });
    } catch (error) {
      if (error instanceof Error && error.message === 'profile/username-taken') {
        setAvailability('taken');
        setErrorKey('auth.errors.usernameTaken');
        setStep(0);
      } else {
        setErrorKey(profileErrorKey(error));
      }
    } finally {
      setSaving(false);
    }
  }, [
    avatarUrl,
    bio,
    coverUrl,
    displayName,
    interests,
    language,
    location,
    navigate,
    setProfile,
    skills,
    t,
    user,
    username,
    website,
  ]);

  if (!profileLoaded) {
    return <PageSkeleton label={t('common.loading')} />;
  }

  // Already-onboarded users never get stuck in setup even if navigated here directly.
  if (isProfileOnboarded(profile)) {
    const target =
      profile && profile.username.trim().length > 0 ? profilePath(profile.username) : ROUTES.home;
    return <Navigate to={target} replace />;
  }

  // If the profile read failed transiently, let the member retry syncing before showing setup.
  if (profileError && !profile) {
    return (
      <div className="bsdc-auth-stage min-h-[calc(100dvh-var(--bsdc-app-bar-h))] py-8 sm:py-12">
        <div className="fab-container flex justify-center">
          <Card className="bsdc-auth-card w-full max-w-md space-y-4">
            <Alert tone="warning" title={t('auth.profileSync.title')}>
              {t('auth.profileSync.body')}
            </Alert>
            <div className="grid gap-2">
              <Button
                block
                loading={retrying}
                iconStart={<RefreshCw size={16} />}
                onClick={() => {
                  setRetrying(true);
                  void import('@/lib/auth/session')
                    .then(({ retryProfileSync }) => retryProfileSync())
                    .finally(() => setRetrying(false));
                }}
              >
                {t('auth.profileSync.retry')}
              </Button>
              <Link to={ROUTES.home}>
                <Button variant="secondary" block>
                  {t('auth.profileSync.continueHome')}
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  const previewName = displayName.trim() || user?.displayName || t('auth.fields.displayName');

  return (
    <>
      <Seo
        title={t('onboarding.metaTitle')}
        description={t('onboarding.metaDescription')}
        path={ROUTES.onboarding}
        noindex
      />
      <div className="bsdc-auth-stage min-h-[calc(100dvh-var(--bsdc-app-bar-h))] py-6 sm:py-10">
        <div className="fab-container">
          <div className="mx-auto w-full max-w-2xl">
            <div className="bsdc-auth-card mb-5 flex flex-wrap items-center justify-between gap-4 rounded-sheet border border-border bg-surface p-4 sm:p-5">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar src={avatarUrl} name={previewName} size="lg" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="truncate text-xl font-semibold sm:text-2xl">
                      {t('onboarding.title')}
                    </h1>
                    <Badge tone="green">
                      {step + 1}/{STEP_KEYS.length}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-sm text-muted">
                    {username ? `@${username} — ` : ''}
                    {t('onboarding.subtitle')}
                  </p>
                </div>
              </div>
            </div>

            <Stepper steps={steps} current={step} label={t('onboarding.title')} className="mb-5" />

            {errorKey ? <Alert tone="danger" title={t(errorKey)} className="mb-4" /> : null}

            <Card className="bsdc-auth-card relative overflow-hidden p-5 sm:p-6">
              <div
                className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-green-500 via-green-300 to-blue"
                aria-hidden="true"
              />
              <div key={step} className="bsdc-step-pane pt-1">
                {step === 0 ? (
                  <div className="grid gap-4">
                    <p className="text-sm text-muted">{t('onboarding.identityHint')}</p>
                    <TextField
                      label={t('auth.fields.displayName')}
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      autoComplete="name"
                      error={
                        displayName.length > 0 && displayName.trim().length < 2
                          ? t('auth.validation.displayNameRequired')
                          : undefined
                      }
                    />
                    <div>
                      <TextField
                        label={t('auth.fields.username')}
                        hint={t('auth.hints.username')}
                        value={username}
                        onChange={(event) => setUsername(event.target.value.toLowerCase())}
                        iconStart={<AtSign size={18} />}
                        autoComplete="username"
                        error={
                          availability === 'invalid'
                            ? t('auth.validation.usernameInvalid')
                            : availability === 'taken'
                              ? t('onboarding.availability.taken')
                              : undefined
                        }
                      />
                      {availability === 'checking' ? (
                        <p className="mt-1.5 text-xs text-muted">
                          {t('onboarding.availability.checking')}
                        </p>
                      ) : null}
                      {availability === 'available' ? (
                        <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-green-500/12 px-2.5 py-0.5 text-xs font-medium text-green-700">
                          <Check size={14} aria-hidden="true" />
                          {t('onboarding.availability.available')}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {step === 1 ? (
                  <div className="grid gap-5">
                    {user ? (
                      <div className="rounded-card border border-border bg-bg p-3.5">
                        <p className="mb-2.5 text-sm font-medium text-text">
                          {t('onboarding.avatarUploadLabel')}
                        </p>
                        <AvatarUploader
                          uid={user.uid}
                          name={previewName}
                          value={avatarUrl}
                          onUploaded={setAvatarUrl}
                        />
                      </div>
                    ) : null}
                    <TextareaField
                      label={t('onboarding.bioLabel')}
                      hint={t('onboarding.bioHint')}
                      value={bio}
                      maxLength={280}
                      rows={4}
                      onChange={(event) => setBio(event.target.value)}
                      error={bio.length > 280 ? t('auth.validation.bioLong') : undefined}
                    />
                    <LocationField value={location} onChange={setLocation} />
                    <TextField
                      label={t('onboarding.websiteLabel')}
                      value={website}
                      inputMode="url"
                      placeholder="https://"
                      onChange={(event) => setWebsite(event.target.value)}
                      iconStart={<Link2 size={18} />}
                      error={websiteValid ? undefined : t('auth.validation.urlInvalid')}
                    />
                    <TextField
                      label={t('onboarding.avatarLabel')}
                      hint={t('onboarding.avatarHint')}
                      value={avatarUrl}
                      inputMode="url"
                      placeholder="https://"
                      onChange={(event) => setAvatarUrl(event.target.value)}
                      error={avatarValid ? undefined : t('auth.validation.urlInvalid')}
                    />
                  </div>
                ) : null}

                {step === 2 ? (
                  <div className="grid gap-5">
                    <TagInput
                      label={t('onboarding.skillsLabel')}
                      hint={t('onboarding.skillsHint')}
                      value={skills}
                      onChange={setSkills}
                      suggestions={SKILL_SUGGESTIONS}
                    />
                    <TagInput
                      label={t('onboarding.interestsLabel')}
                      hint={t('onboarding.interestsHint')}
                      value={interests}
                      onChange={setInterests}
                      suggestions={INTEREST_SUGGESTIONS}
                    />
                    <SelectField
                      label={t('onboarding.languageLabel')}
                      value={language}
                      onChange={(event) => setLanguage(event.target.value === 'en' ? 'en' : 'bn')}
                      options={[
                        { value: 'bn', label: 'বাংলা' },
                        { value: 'en', label: 'English' },
                      ]}
                    />
                  </div>
                ) : null}

                {step === 3 ? (
                  <div className="grid gap-5">
                    <div className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-bg p-4">
                      <Avatar src={avatarUrl} name={previewName} size="xl" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-lg font-semibold text-text">{previewName}</p>
                        <p className="truncate text-sm font-medium text-green-700">@{username}</p>
                        {location ? <p className="mt-0.5 text-xs text-muted">{location}</p> : null}
                      </div>
                      <Sparkles size={20} className="text-green-600" aria-hidden="true" />
                    </div>

                    <p className="text-sm text-muted">{t('onboarding.reviewNote')}</p>

                    <dl className="grid gap-3 text-sm sm:grid-cols-2">
                      <div className="rounded-card border border-border/70 bg-bg p-3 sm:col-span-2">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                          {t('onboarding.bioLabel')}
                        </dt>
                        <dd className="mt-1">{bio.length > 0 ? bio : t('profile.about.none')}</dd>
                      </div>
                      <div className="rounded-card border border-border/70 bg-bg p-3">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                          {t('onboarding.skillsLabel')}
                        </dt>
                        <dd className="mt-1">
                          {skills.length > 0 ? skills.join(', ') : t('profile.about.none')}
                        </dd>
                      </div>
                      <div className="rounded-card border border-border/70 bg-bg p-3">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                          {t('onboarding.interestsLabel')}
                        </dt>
                        <dd className="mt-1">
                          {interests.length > 0 ? interests.join(', ') : t('profile.about.none')}
                        </dd>
                      </div>
                    </dl>
                  </div>
                ) : null}
              </div>
            </Card>

            <div className="mt-5 flex items-center justify-between gap-3">
              <Button
                variant="secondary"
                disabled={step === 0 || saving}
                onClick={() => setStep((value) => Math.max(0, value - 1))}
              >
                {t('onboarding.back')}
              </Button>
              {step < STEP_KEYS.length - 1 ? (
                <Button
                  disabled={!canContinue}
                  iconEnd={<ArrowRight size={16} />}
                  onClick={() => setStep((value) => Math.min(STEP_KEYS.length - 1, value + 1))}
                >
                  {t('onboarding.next')}
                </Button>
              ) : (
                <Button
                  loading={saving}
                  iconEnd={<Check size={16} />}
                  onClick={() => void finish()}
                >
                  {t('onboarding.finish')}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
