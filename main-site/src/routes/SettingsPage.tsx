import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AvatarUploader } from '@/components/media/AvatarUploader';
import { Seo } from '@/components/seo/Seo';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  PasswordField,
  PageSkeleton,
  SectionHeading,
  SelectField,
  Switch,
  Tabs,
  TagInput,
  TextField,
  TextareaField,
  type TabItem,
} from '@/design-system';
import { useFeedPreferences } from '@/hooks/use-feed';
import { changeLanguage, type Language } from '@/i18n';
import { changePassword, logout, updateDisplayName } from '@/lib/auth/auth-service';
import { authErrorKey } from '@/lib/auth/errors';
import type { FeedPreferences } from '@/lib/feed/ranking';
import { profileErrorKey } from '@/lib/profile/profile-errors';
import { formatAbsoluteDate } from '@/lib/format';
import {
  DEFAULT_NOTIFICATIONS,
  DEFAULT_PRIVACY,
  updateProfileFields,
  type NotificationPrefs,
  type PrivacyPrefs,
} from '@/lib/profile/profile-service';
import { ROUTES } from '@/lib/site';
import { useAuthStore } from '@/store/auth-store';
import { useProfileStore } from '@/store/profile-store';
import { useThemeStore, type ThemePreference } from '@/store/theme-store';

function AccountPanel() {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const profile = useProfileStore((state) => state.profile);
  const setProfile = useProfileStore((state) => state.setProfile);
  const [displayName, setDisplayName] = useState(profile?.displayName ?? user?.displayName ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [location, setLocation] = useState(profile?.location ?? '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatarUrl ?? user?.photoURL ?? '');
  const [saving, setSaving] = useState(false);

  async function onAvatarUploaded(url: string) {
    if (!user) return;
    setAvatarUrl(url);
    try {
      const { updatePhotoUrl } = await import('@/lib/auth/auth-service');
      await updatePhotoUrl(url);
      await updateProfileFields(user.uid, { avatarUrl: url });
      if (profile) setProfile({ ...profile, avatarUrl: url });
      toast.success(t('media.uploaded'));
    } catch (error) {
      toast.error(t(profileErrorKey(error)));
    }
  }

  async function save() {
    if (!user) return;
    setSaving(true);
    try {
      await updateDisplayName(displayName.trim());
      await updateProfileFields(user.uid, {
        displayName: displayName.trim(),
        bio: bio.trim(),
        location: location.trim(),
      });
      if (profile) {
        setProfile({
          ...profile,
          displayName: displayName.trim(),
          bio: bio.trim(),
          location: location.trim(),
        });
      }
      toast.success(t('settings.saved'));
    } catch (error) {
      toast.error(t(profileErrorKey(error)));
    } finally {
      setSaving(false);
    }
  }

  const providerId = user?.providerData[0]?.providerId ?? 'password';

  return (
    <div className="grid gap-4">
      <Card>
        <div className="flex items-center gap-3">
          <Avatar src={avatarUrl} name={displayName} size="lg" />
          <div className="min-w-0">
            <p className="fab-truncate font-semibold">{user?.email}</p>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
              <Badge tone={user?.emailVerified ? 'green' : 'warn'}>
                {user?.emailVerified
                  ? t('settings.account.emailVerified')
                  : t('settings.account.emailUnverified')}
              </Badge>
              <span>
                {t('settings.account.providerLabel')}: {providerId}
              </span>
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <div className="grid gap-4">
          {user ? (
            <AvatarUploader
              uid={user.uid}
              name={displayName}
              value={avatarUrl}
              onUploaded={(url) => void onAvatarUploaded(url)}
            />
          ) : null}
          <TextField
            label={t('auth.fields.displayName')}
            value={displayName}
            autoComplete="name"
            onChange={(event) => setDisplayName(event.target.value)}
          />
          <TextareaField
            label={t('onboarding.bioLabel')}
            value={bio}
            rows={4}
            maxLength={280}
            onChange={(event) => setBio(event.target.value)}
          />
          <TextField
            label={t('onboarding.locationLabel')}
            value={location}
            autoComplete="address-level2"
            onChange={(event) => setLocation(event.target.value)}
          />
          <div>
            <Button loading={saving} onClick={() => void save()}>
              {t('settings.save')}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function AppearancePanel() {
  const { t } = useTranslation();
  const preference = useThemeStore((state) => state.preference);
  const setPreference = useThemeStore((state) => state.setPreference);

  return (
    <Card>
      <p className="mb-3 text-sm text-muted">{t('settings.appearance.description')}</p>
      <SelectField
        label={t('settings.appearance.themeLabel')}
        value={preference}
        onChange={(event) => setPreference(event.target.value as ThemePreference)}
        options={[
          { value: 'light', label: t('theme.light') },
          { value: 'dark', label: t('theme.dark') },
          { value: 'system', label: t('theme.system') },
        ]}
      />
    </Card>
  );
}

function LanguagePanel() {
  const { t, i18n } = useTranslation();
  const current: Language = i18n.language === 'en' ? 'en' : 'bn';

  return (
    <Card>
      <p className="mb-3 text-sm text-muted">{t('settings.language.description')}</p>
      <SelectField
        label={t('settings.language.title')}
        value={current}
        onChange={(event) => void changeLanguage(event.target.value === 'en' ? 'en' : 'bn')}
        options={[
          { value: 'bn', label: t('language.bangla') },
          { value: 'en', label: t('language.english') },
        ]}
      />
    </Card>
  );
}

function NotificationsPanel() {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const profile = useProfileStore((state) => state.profile);
  const setProfile = useProfileStore((state) => state.setProfile);
  const [prefs, setPrefs] = useState<NotificationPrefs>(
    profile?.notifications ?? DEFAULT_NOTIFICATIONS,
  );

  async function update(key: keyof NotificationPrefs, value: boolean) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    if (!user) return;
    try {
      await updateProfileFields(user.uid, { notifications: next });
      if (profile) setProfile({ ...profile, notifications: next });
    } catch {
      setPrefs(prefs);
      toast.error(t('settings.saveFailed'));
    }
  }

  const rows: { key: keyof NotificationPrefs; label: string }[] = [
    { key: 'followers', label: t('settings.notifications.followers') },
    { key: 'comments', label: t('settings.notifications.comments') },
    { key: 'mentions', label: t('settings.notifications.mentions') },
    { key: 'messages', label: t('settings.notifications.messages') },
    { key: 'digest', label: t('settings.notifications.digest') },
  ];

  return (
    <Card>
      <p className="mb-3 text-sm text-muted">{t('settings.notifications.description')}</p>
      <div className="grid gap-3">
        {rows.map((row) => (
          <Switch
            key={row.key}
            label={row.label}
            checked={prefs[row.key]}
            onCheckedChange={(value) => void update(row.key, value)}
          />
        ))}
      </div>
    </Card>
  );
}

function PrivacyPanel() {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const profile = useProfileStore((state) => state.profile);
  const setProfile = useProfileStore((state) => state.setProfile);
  const [prefs, setPrefs] = useState<PrivacyPrefs>(profile?.privacy ?? DEFAULT_PRIVACY);

  async function update(key: keyof PrivacyPrefs, value: boolean) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    if (!user) return;
    try {
      await updateProfileFields(user.uid, { privacy: next });
      if (profile) setProfile({ ...profile, privacy: next });
    } catch {
      setPrefs(prefs);
      toast.error(t('settings.saveFailed'));
    }
  }

  const rows: { key: keyof PrivacyPrefs; label: string }[] = [
    { key: 'discoverable', label: t('settings.privacy.discoverable') },
    { key: 'showActivity', label: t('settings.privacy.showActivity') },
    { key: 'showEmail', label: t('settings.privacy.showEmail') },
  ];

  return (
    <Card>
      <p className="mb-3 text-sm text-muted">{t('settings.privacy.description')}</p>
      <div className="grid gap-3">
        {rows.map((row) => (
          <Switch
            key={row.key}
            label={row.label}
            checked={prefs[row.key]}
            onCheckedChange={(value) => void update(row.key, value)}
          />
        ))}
      </div>
    </Card>
  );
}

function SecurityPanel() {
  const { t, i18n } = useTranslation();
  const language: Language = i18n.language === 'en' ? 'en' : 'bn';
  const user = useAuthStore((state) => state.user);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const hasPassword = user?.providerData.some((entry) => entry.providerId === 'password') ?? false;

  async function submit() {
    setBusy(true);
    setErrorKey(null);
    try {
      await changePassword(current, next);
      setCurrent('');
      setNext('');
      toast.success(t('settings.security.passwordChanged'));
    } catch (error) {
      setErrorKey(authErrorKey(error));
    } finally {
      setBusy(false);
    }
  }

  const created = user?.metadata.creationTime;
  const lastSignIn = user?.metadata.lastSignInTime;

  return (
    <div className="grid gap-4">
      <Card>
        <h3 className="text-lg font-semibold">{t('settings.security.changePassword')}</h3>
        {hasPassword ? (
          <div className="mt-3 grid gap-4">
            {errorKey ? <Alert tone="danger" title={t(errorKey)} /> : null}
            <PasswordField
              label={t('auth.fields.currentPassword')}
              value={current}
              autoComplete="current-password"
              onChange={(event) => setCurrent(event.target.value)}
            />
            <PasswordField
              label={t('auth.fields.newPassword')}
              hint={t('auth.hints.password')}
              value={next}
              autoComplete="new-password"
              onChange={(event) => setNext(event.target.value)}
            />
            <div>
              <Button
                loading={busy}
                disabled={current.length === 0 || next.length < 8}
                onClick={() => void submit()}
              >
                {t('settings.security.changePassword')}
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">{t('settings.security.passwordOnly')}</p>
        )}
      </Card>

      <Card>
        <h3 className="text-lg font-semibold">{t('settings.security.sessionsTitle')}</h3>
        <ul className="mt-2 grid gap-1 text-sm text-muted">
          {created ? (
            <li>
              {t('settings.security.createdAt', {
                date: formatAbsoluteDate(new Date(created), language),
              })}
            </li>
          ) : null}
          {lastSignIn ? (
            <li>
              {t('settings.security.lastSignIn', {
                date: formatAbsoluteDate(new Date(lastSignIn), language),
              })}
            </li>
          ) : null}
        </ul>
        <div className="mt-3">
          <Button variant="danger" onClick={() => void logout()}>
            {t('settings.security.signOutEverywhere')}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function FeedPanel() {
  const { t } = useTranslation();
  const { preferences, save, isSaving } = useFeedPreferences();
  const [draft, setDraft] = useState<FeedPreferences | null>(null);
  const current = draft ?? preferences;

  function patch(next: Partial<FeedPreferences>) {
    setDraft({ ...current, ...next });
  }

  function toggleLanguage(code: string, enabled: boolean) {
    const languages = enabled
      ? [...new Set([...current.languages, code])]
      : current.languages.filter((item) => item !== code);
    patch({ languages: languages.length === 0 ? [code] : languages });
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeading
        title={t('feed.preferences.title')}
        description={t('feed.preferences.description')}
        level={2}
      />
      <Card>
        <SelectField
          label={t('feed.preferences.algorithm')}
          value={current.algorithm}
          onChange={(event) => {
            patch({ algorithm: event.target.value as FeedPreferences['algorithm'] });
          }}
          options={[
            { value: 'ranked', label: t('feed.tabs.ranked') },
            { value: 'following', label: t('feed.tabs.following') },
            { value: 'latest', label: t('feed.tabs.latest') },
          ]}
        />

        <fieldset className="mt-4">
          <legend className="text-sm font-semibold">{t('feed.preferences.languages')}</legend>
          <p className="mt-1 text-xs text-muted">{t('feed.preferences.languagesHint')}</p>
          <div className="mt-2 flex flex-col gap-2">
            <Switch
              checked={current.languages.includes('bn')}
              onCheckedChange={(checked) => {
                toggleLanguage('bn', checked);
              }}
              label={t('language.bangla')}
            />
            <Switch
              checked={current.languages.includes('en')}
              onCheckedChange={(checked) => {
                toggleLanguage('en', checked);
              }}
              label={t('language.english')}
            />
          </div>
        </fieldset>

        <div className="mt-4">
          <TagInput
            label={t('feed.preferences.mutedTags')}
            hint={t('feed.preferences.mutedTagsHint')}
            value={current.mutedTags}
            onChange={(mutedTags) => {
              patch({ mutedTags });
            }}
          />
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <Switch
            checked={current.showSensitive}
            onCheckedChange={(checked) => {
              patch({ showSensitive: checked });
            }}
            label={t('feed.preferences.showSensitive')}
            description={t('feed.preferences.showSensitiveHint')}
          />
          <Switch
            checked={current.hideSeen}
            onCheckedChange={(checked) => {
              patch({ hideSeen: checked });
            }}
            label={t('feed.preferences.hideSeen')}
            description={t('feed.preferences.hideSeenHint')}
          />
        </div>

        <Button
          className="mt-5"
          disabled={isSaving || draft === null}
          onClick={() => {
            if (draft === null) return;
            save(draft);
            setDraft(null);
            toast.success(t('feed.preferences.saved'));
          }}
        >
          {t('feed.preferences.save')}
        </Button>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  const { t } = useTranslation();
  const profileLoaded = useAuthStore((state) => state.profileLoaded);
  const profile = useProfileStore((state) => state.profile);
  const [tab, setTab] = useState('account');

  // The account panels write partial profile fields. Let the sign-in bootstrap
  // settle first and send a new member to the one place that can create their
  // complete profile, rather than attempting a partial write that the data
  // layer must reject.
  if (!profileLoaded) return <PageSkeleton label={t('common.loading')} />;
  if (!profile) return <Navigate to={ROUTES.onboarding} replace />;

  const items: TabItem[] = [
    { id: 'account', label: t('settings.tabs.account'), content: <AccountPanel /> },
    { id: 'appearance', label: t('settings.tabs.appearance'), content: <AppearancePanel /> },
    { id: 'language', label: t('settings.tabs.language'), content: <LanguagePanel /> },
    {
      id: 'notifications',
      label: t('settings.tabs.notifications'),
      content: <NotificationsPanel />,
    },
    { id: 'feed', label: t('settings.tabs.feed'), content: <FeedPanel /> },
    { id: 'privacy', label: t('settings.tabs.privacy'), content: <PrivacyPanel /> },
    { id: 'security', label: t('settings.tabs.security'), content: <SecurityPanel /> },
  ];

  return (
    <>
      <Seo
        title={t('settings.metaTitle')}
        description={t('settings.metaDescription')}
        path={ROUTES.settings}
        noindex
      />
      <div className="fab-container py-6 sm:py-10">
        <h1 className="text-2xl sm:text-3xl">{t('settings.title')}</h1>
        <div className="mt-5">
          <Tabs items={items} activeId={tab} onChange={setTab} label={t('settings.title')} />
        </div>
      </div>
    </>
  );
}
