import { AtSign, Check, Link2, MapPin } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Seo } from '@/components/seo/Seo';
import {
  Alert,
  Button,
  Card,
  SelectField,
  Stepper,
  TagInput,
  TextField,
  TextareaField,
} from '@/design-system';
import type { Language } from '@/i18n';
import {
  isUsernameAvailable,
  saveProfile,
  usernameSchema,
  type ProfileDraft,
} from '@/lib/profile/profile-service';
import { profileErrorKey } from '@/lib/profile/profile-errors';
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
  const profile = useProfileStore((state) => state.profile);
  const setProfile = useProfileStore((state) => state.setProfile);

  const [step, setStep] = useState(0);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

  const usernameValid = usernameSchema.safeParse(username).success;

  // Debounced availability probe so each keystroke does not hit Firestore.
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

  return (
    <>
      <Seo
        title={t('onboarding.metaTitle')}
        description={t('onboarding.metaDescription')}
        path={ROUTES.onboarding}
        noindex
      />
      <div className="fab-container py-6 sm:py-10">
        <div className="mx-auto w-full max-w-2xl">
          <h1 className="text-2xl sm:text-3xl">{t('onboarding.title')}</h1>
          <p className="mt-1 text-sm text-muted">{t('onboarding.subtitle')}</p>

          <Stepper steps={steps} current={step} label={t('onboarding.title')} className="my-5" />

          {errorKey ? <Alert tone="danger" title={t(errorKey)} className="mb-4" /> : null}

          <Card>
            {step === 0 ? (
              <div className="grid gap-4">
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
                    <p className="mt-1 text-xs text-muted">
                      {t('onboarding.availability.checking')}
                    </p>
                  ) : null}
                  {availability === 'available' ? (
                    <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-green-700">
                      <Check size={14} aria-hidden="true" />
                      {t('onboarding.availability.available')}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {step === 1 ? (
              <div className="grid gap-4">
                <TextareaField
                  label={t('onboarding.bioLabel')}
                  hint={t('onboarding.bioHint')}
                  value={bio}
                  maxLength={280}
                  rows={4}
                  onChange={(event) => setBio(event.target.value)}
                  error={bio.length > 280 ? t('auth.validation.bioLong') : undefined}
                />
                <TextField
                  label={t('onboarding.locationLabel')}
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  autoComplete="address-level2"
                  iconStart={<MapPin size={18} />}
                />
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
              <div className="grid gap-4">
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
              <dl className="grid gap-3 text-sm">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted">
                    {t('auth.fields.username')}
                  </dt>
                  <dd className="font-semibold">@{username}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted">
                    {t('auth.fields.displayName')}
                  </dt>
                  <dd>{displayName}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted">
                    {t('onboarding.bioLabel')}
                  </dt>
                  <dd>{bio.length > 0 ? bio : t('profile.about.none')}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted">
                    {t('onboarding.skillsLabel')}
                  </dt>
                  <dd>{skills.length > 0 ? skills.join(', ') : t('profile.about.none')}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted">
                    {t('onboarding.interestsLabel')}
                  </dt>
                  <dd>{interests.length > 0 ? interests.join(', ') : t('profile.about.none')}</dd>
                </div>
              </dl>
            ) : null}
          </Card>

          <div className="mt-4 flex items-center justify-between gap-3">
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
                onClick={() => setStep((value) => Math.min(STEP_KEYS.length - 1, value + 1))}
              >
                {t('onboarding.next')}
              </Button>
            ) : (
              <Button loading={saving} onClick={() => void finish()}>
                {t('onboarding.finish')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
