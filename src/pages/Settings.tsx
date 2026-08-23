/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  User, Lock, Palette, Bell, Keyboard, Download, Trash2, Languages, Moon, Sun, Save,
} from 'lucide-react';
import { auth, firebaseConfigured } from '@/config/firebase';
import {
  EmailAuthProvider, reauthenticateWithCredential, updatePassword, updateProfile as fbUpdateProfile,
} from 'firebase/auth';
import { COL, doc, fsDb, getDoc, updateDoc } from '@/lib/firestore';
import { checkUsernameAvailable, claimUsername, signOut } from '@/lib/auth';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { Input, Textarea } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { ImageUploader } from '@/components/ui/ImageUploader';
import { SEOHead } from '@/components/seo/SEOHead';
import { ConfirmDialog } from '@/components/ui/Modal';
import { USERNAME_PATTERN } from '@/config/constants';
import { downloadBlob } from '@/lib/utils';
import { promptPushPermission } from '@/config/onesignal';
import { fetchRecentPosts } from '@/lib/data';

export default function Settings() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const authUser = useAuthStore((s) => s.authUser);
  const patchProfile = useAuthStore((s) => s.patchProfile);
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  const language = useUIStore((s) => s.language);
  const setLanguage = useUIStore((s) => s.setLanguage);
  const soundEnabled = useUIStore((s) => s.soundEnabled);
  const setSoundEnabled = useUIStore((s) => s.setSoundEnabled);

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'ok' | 'taken'>('idle');
  const [bioTitle, setBioTitle] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [website, setWebsite] = useState('');
  const [github, setGithub] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [twitter, setTwitter] = useState('');
  const [skills, setSkills] = useState('');
  const [education, setEducation] = useState('');
  const [work, setWork] = useState('');
  const [avatar, setAvatar] = useState<{ url: string; name: string }[]>([]);
  const [cover, setCover] = useState<{ url: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.displayName);
    setUsername(profile.username);
    setBioTitle(profile.bioTitle);
    setBio(profile.bio);
    setLocation(profile.location);
    setWebsite(profile.website);
    setGithub(profile.github);
    setLinkedin(profile.linkedin);
    setTwitter(profile.twitter);
    setSkills(profile.skills.join(', '));
    setEducation(profile.education);
    setWork(profile.work);
    setAvatar(profile.avatar ? [{ url: profile.avatar, name: 'avatar' }] : []);
    setCover(profile.coverPhoto ? [{ url: profile.coverPhoto, name: 'cover' }] : []);
  }, [profile]);

  useEffect(() => {
    if (!profile || username === profile.username) {
      setUsernameStatus('idle');
      return;
    }
    if (!USERNAME_PATTERN.test(username)) {
      setUsernameStatus('taken');
      return;
    }
    setUsernameStatus('checking');
    const timer = setTimeout(async () => {
      const ok = await checkUsernameAvailable(username).catch(() => false);
      let reservedByMe = false;
      if (!ok) {
        const snap = await getDoc(doc(fsDb(), COL.usernames, username.toLowerCase())).catch(() => null);
        if (snap && snap.exists()) reservedByMe = snap.data().uid === profile.uid;
      }
      setUsernameStatus(ok || reservedByMe ? 'ok' : 'taken');
    }, 500);
    return () => clearTimeout(timer);
  }, [username, profile]);

  async function saveProfile() {
    if (!profile || !authUser) return;
    setSaving(true);
    try {
      if (username !== profile.username) {
        if (!USERNAME_PATTERN.test(username)) throw new Error('Username must be 3-20 characters: a-z, 0-9, _');
        if (usernameStatus !== 'ok') throw new Error(t('settings.usernameTaken'));
        await claimUsername(profile.uid, username, profile.username);
      }
      const skillsList = skills.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, 20);
      const patch = {
        displayName: displayName.trim() || profile.displayName,
        username: username.toLowerCase(),
        bioTitle,
        bio,
        location,
        website,
        github: github.replace('@', ''),
        linkedin: linkedin.replace('@', ''),
        twitter: twitter.replace('@', ''),
        skills: skillsList,
        education,
        work,
        avatar: avatar[0]?.url || '',
        coverPhoto: cover[0]?.url || '',
        profileCompleted: Boolean(avatar[0] && bioTitle && bio && skillsList.length > 0 && location),
        updatedAt: Date.now(),
      };
      await updateDoc(doc(fsDb(), COL.users, profile.uid), patch);
      if (displayName.trim() !== authUser.displayName) await fbUpdateProfile(authUser, { displayName: displayName.trim() });
      patchProfile(patch);
      if (!profile.profileCompleted && patch.profileCompleted) {
        const { earn } = await import('@/lib/points');
        await earn(profile.uid, 'complete_profile');
        toast.success('+50 BSDC points — profile completed!');
      }
      toast.success(t('settings.savedToast'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  async function changePassword() {
    if (!authUser || !authUser.email) return;
    setPasswordMsg('');
    if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setPasswordMsg(t('auth.passwordHint'));
      return;
    }
    try {
      if (currentPassword) {
        const cred = EmailAuthProvider.credential(authUser.email, currentPassword);
        await reauthenticateWithCredential(authUser, cred);
      }
      await updatePassword(authUser, newPassword);
      setPasswordMsg('Password updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
    } catch (e) {
      setPasswordMsg((e as Error).message || 'Could not update password');
    }
  }

  async function exportData(format: 'json' | 'csv') {
    if (!profile) return;
    try {
      const posts = await fetchRecentPosts(300).then((all) => all.filter((p) => p.authorId === profile.uid));
      const payload = {
        profile: { ...profile },
        exportedAt: new Date().toISOString(),
        posts: posts.map(({ authorName: _an, authorAvatar: _aa, ...rest }) => rest),
      };
      if (format === 'json') {
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        downloadBlob(blob, `bsdc-data-${profile.username}.json`);
      } else {
        const { unparse } = await import('papaparse');
        const csv = unparse(posts.map((p) => ({ id: p.id, title: p.title, type: p.type, createdAt: p.createdAt, reactions: p.reactionTotal, comments: p.commentCount })));
        downloadBlob(new Blob([csv], { type: 'text/csv' }), `bsdc-posts-${profile.username}.csv`);
      }
      toast.success('Export downloaded');
    } catch {
      toast.error('Export failed');
    }
  }

  if (!profile) return null;

  return (
    <>
      <SEOHead title={`${t('settings.title')} — BSDC`} description="Manage your BSDC account settings." path="/settings" noindex />
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-4 text-xl font-extrabold sm:text-2xl">{t('settings.title')}</h1>
        <Tabs defaultValue="profile">
          <div className="bsdc-surface mb-4 p-2">
            <TabsList>
              <TabsTrigger value="profile" icon={<User className="h-4 w-4" aria-hidden />}>{t('settings.profile')}</TabsTrigger>
              <TabsTrigger value="account" icon={<Lock className="h-4 w-4" aria-hidden />}>{t('settings.account')}</TabsTrigger>
              <TabsTrigger value="appearance" icon={<Palette className="h-4 w-4" aria-hidden />}>{t('settings.appearance')}</TabsTrigger>
              <TabsTrigger value="notifications" icon={<Bell className="h-4 w-4" aria-hidden />}>{t('settings.notificationsPrefs')}</TabsTrigger>
              <TabsTrigger value="keyboard" icon={<Keyboard className="h-4 w-4" aria-hidden />}>{t('settings.keyboard')}</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="profile">
            <div className="space-y-4">
              <div className="bsdc-surface p-4">
                <p className="mb-2 text-sm font-bold">Profile photo</p>
                <ImageUploader single images={avatar} onChange={setAvatar} folder="bsdc/avatars" compact />
              </div>
              <div className="bsdc-surface p-4">
                <p className="mb-2 text-sm font-bold">Cover photo</p>
                <ImageUploader single images={cover} onChange={setCover} folder="bsdc/covers" compact />
              </div>
              <div className="bsdc-surface space-y-3 p-4">
                <Input label={t('settings.displayName')} value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={50} />
                <Input
                  label={t('common.username')}
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  error={usernameStatus === 'taken' ? t('settings.usernameTaken') : undefined}
                  hint={usernameStatus === 'ok' ? t('settings.usernameAvailable') : '3-20 characters: a-z, 0-9, _'}
                />
                <Input label={t('settings.bioTitle')} value={bioTitle} onChange={(e) => setBioTitle(e.target.value)} maxLength={80} placeholder="Full-Stack Developer · Dhaka" />
                <Textarea label={t('settings.bio')} value={bio} onChange={(e) => setBio(e.target.value)} maxRows={5} maxLength={500} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input label={t('settings.location')} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Sylhet, Bangladesh" />
                  <Input label={t('settings.website')} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="rrc.cloud.bsdc.info.bd" />
                  <Input label={t('settings.github')} value={github} onChange={(e) => setGithub(e.target.value)} placeholder="username" />
                  <Input label={t('settings.linkedin')} value={linkedin} onChange={(e) => setLinkedin(e.target.value)} placeholder="username" />
                  <Input label={t('settings.twitter')} value={twitter} onChange={(e) => setTwitter(e.target.value)} placeholder="username" />
                </div>
                <Input label={t('settings.skills')} value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="react, firebase, python" />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input label={t('settings.education')} value={education} onChange={(e) => setEducation(e.target.value)} />
                  <Input label={t('settings.work')} value={work} onChange={(e) => setWork(e.target.value)} />
                </div>
                <Button loading={saving} onClick={() => void saveProfile()} icon={<Save className="h-4 w-4" aria-hidden />}>
                  {t('common.save')}
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="account">
            <div className="space-y-4">
              <div className="bsdc-surface space-y-3 p-4">
                <p className="text-sm font-bold">{t('settings.changePassword')}</p>
                {authUser?.providerData[0]?.providerId === 'password' ? (
                  <>
                    <Input label={`${t('common.password')} (current)`} type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />
                    <Input label="New password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} hint={t('auth.passwordHint')} autoComplete="new-password" />
                    {passwordMsg ? <p className="text-xs font-medium text-brand-600 dark:text-brand-400">{passwordMsg}</p> : null}
                    <Button variant="outline" onClick={() => void changePassword()}>
                      {t('settings.changePassword')}
                    </Button>
                  </>
                ) : (
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    You signed up with {authUser?.providerData[0]?.providerId === 'google.com' ? 'Google' : authUser?.providerData[0]?.providerId === 'github.com' ? 'GitHub' : 'Yahoo'} — your password is managed by that provider.
                  </p>
                )}
              </div>

              <div className="bsdc-surface space-y-3 p-4">
                <p className="text-sm font-bold">{t('settings.exportData')}</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">{t('settings.exportHint')}</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" icon={<Download className="h-4 w-4" aria-hidden />} onClick={() => void exportData('json')}>
                    JSON
                  </Button>
                  <Button variant="outline" size="sm" icon={<Download className="h-4 w-4" aria-hidden />} onClick={() => void exportData('csv')}>
                    CSV
                  </Button>
                </div>
              </div>

              <div className="rounded-2xl border border-red-200 bg-red-50/60 p-4 dark:border-red-900 dark:bg-red-950/30">
                <p className="mb-1 flex items-center gap-2 text-sm font-bold text-red-700 dark:text-red-300">
                  <Trash2 className="h-4 w-4" aria-hidden />
                  {t('settings.deleteAccount')}
                </p>
                <p className="mb-3 text-xs text-red-600 dark:text-red-400">{t('settings.deleteWarning')}</p>
                <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
                  {t('settings.deleteAccount')}
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="appearance">
            <div className="space-y-4">
              <div className="bsdc-surface p-4">
                <p className="mb-2 flex items-center gap-2 text-sm font-bold">
                  <Palette className="h-4 w-4 text-brand-600" aria-hidden />
                  {t('settings.themePref')}
                </p>
                <div className="flex gap-2">
                  <Button variant={theme === 'light' ? 'primary' : 'outline'} size="sm" icon={<Sun className="h-4 w-4" aria-hidden />} onClick={() => setTheme('light')}>
                    {t('common.lightMode')}
                  </Button>
                  <Button variant={theme === 'dark' ? 'primary' : 'outline'} size="sm" icon={<Moon className="h-4 w-4" aria-hidden />} onClick={() => setTheme('dark')}>
                    {t('common.darkMode')}
                  </Button>
                </div>
              </div>
              <div className="bsdc-surface p-4">
                <p className="mb-2 flex items-center gap-2 text-sm font-bold">
                  <Languages className="h-4 w-4 text-brand-600" aria-hidden />
                  {t('settings.languagePref')}
                </p>
                <div className="flex gap-2">
                  <Button variant={language === 'en' ? 'primary' : 'outline'} size="sm" onClick={() => setLanguage('en')}>
                    English
                  </Button>
                  <Button variant={language === 'bn' ? 'primary' : 'outline'} size="sm" onClick={() => setLanguage('bn')}>
                    বাংলা
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="notifications">
            <div className="bsdc-surface divide-y divide-surface-light-border p-4 dark:divide-surface-dark-border">
              <Switch label={t('settings.pushEnable')} description="Browser push via OneSignal for messages, mentions and announcements" checked={Notification.permission === 'granted'} onCheckedChange={() => void promptPushPermission()} />
              <Switch label={t('settings.soundEnable')} description="Play a soft chime for new notifications" checked={soundEnabled} onCheckedChange={setSoundEnabled} />
            </div>
          </TabsContent>

          <TabsContent value="keyboard">
            <div className="bsdc-surface p-4">
              <p className="mb-3 flex items-center gap-2 text-sm font-bold">
                <Keyboard className="h-4 w-4 text-brand-600" aria-hidden />
                {t('shortcuts.title')}
              </p>
              <ul className="space-y-2 text-sm">
                {[
                  ['Ctrl + K', t('shortcuts.palette')],
                  ['N', t('shortcuts.newPost')],
                  ['G then H', t('shortcuts.goHome')],
                  ['G then P', t('shortcuts.goProfile')],
                  ['G then M', t('shortcuts.goMessages')],
                  ['G then N', t('shortcuts.goNotifications')],
                  ['G then S', t('shortcuts.goSettings')],
                  ['J / K', t('shortcuts.navigate')],
                  ['?', t('shortcuts.help')],
                ].map(([keys, label]) => (
                  <li key={keys} className="flex items-center justify-between gap-4">
                    <span className="text-neutral-600 dark:text-neutral-300">{label}</span>
                    <kbd className="rounded-md border border-neutral-300 bg-neutral-50 px-2 py-1 text-xs font-bold dark:border-neutral-600 dark:bg-neutral-800">{keys}</kbd>
                  </li>
                ))}
              </ul>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('settings.deleteAccount')}
        body={t('settings.deleteWarning')}
        confirmLabel={t('settings.deleteAccount')}
        danger
        onConfirm={async () => {
          setDeleteOpen(false);
          await updateDoc(doc(fsDb(), COL.users, profile.uid), { role: 'banned', bio: '[account deleted]' }).catch(() => undefined);
          if (firebaseConfigured) await auth().currentUser?.delete().catch(async () => undefined);
          await signOut();
          toast.success('Account deletion requested');
          navigate('/');
        }}
      />
    </>
  );
}
