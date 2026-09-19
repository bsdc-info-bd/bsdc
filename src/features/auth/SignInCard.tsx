/**
 * BSDC — src/features/auth/SignInCard.tsx
 * Purpose : The sign-in surface: email link, password, new account, or this device only.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Three honest paths are offered side by side. Email link is first because it needs no
 *   password to leak and works on a shared phone. "Use this device" is last and labelled plainly:
 *   it creates a real profile on this device, syncs nothing, and can be upgraded to a full
 *   account at any time without losing what was written.
 *   No path invents a session: if Firebase is unreachable the email paths fail with a real error,
 *   and the device path remains available, which is exactly the difference between the two.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardBody, CardHeader, CardTitle } from '@/shared/ui/Card';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Input';
import { Tabs, type TabItem } from '@/shared/ui/Tabs';
import { Text } from '@/shared/ui/Typography';
import { isEmail } from '@/shared/lib/validators';
import { USERNAME } from '@/core/config/limits';
import { useSession } from './useSession';

/** Why the sign-in surface appeared. */
export type SignInReason = 'default' | 'messenger' | 'notifications' | 'settings' | 'saved';

/** Props for the sign-in card. */
export interface SignInCardProps {
  readonly reason?: SignInReason | undefined;
  readonly className?: string | undefined;
}

/** Which credential path the person has chosen. */
type SignInMode = 'link' | 'password' | 'device';

/**
 * Renders the sign-in surface.
 * @param props reason and optional class name
 * @returns the sign-in card
 */
export function SignInCard({ reason = 'default', className }: SignInCardProps): React.ReactElement {
  const { t } = useTranslation('auth');
  const {
    sendSignInLink,
    signInWithPassword,
    createAccount,
    startDeviceSession,
    session,
    lastError,
    clearError,
  } = useSession();

  const [mode, setMode] = useState<SignInMode>('link');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const suspended = session.claims.suspended;

  /**
   * Runs an action with busy and error state managed.
   * @param action the action to run
   */
  async function run(action: () => Promise<void>, success: string): Promise<void> {
    setBusy(true);
    setLocalError(null);
    setNotice(null);
    clearError();
    try {
      await action();
      setNotice(success);
    } catch {
      setLocalError(t('errors.generic'));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Handles the email-link form.
   * @param event form submit event
   */
  function onSubmitLink(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!isEmail(email)) {
      setLocalError(t('errors.invalidEmail'));
      return;
    }
    void run(async () => sendSignInLink(email), t('link.sent'));
  }

  /**
   * Handles the password form.
   * @param event form submit event
   */
  function onSubmitPassword(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!isEmail(email)) {
      setLocalError(t('errors.invalidEmail'));
      return;
    }
    if (password.length < 8) {
      setLocalError(t('errors.shortPassword'));
      return;
    }
    void run(async () => signInWithPassword(email, password), t('password.signedIn'));
  }

  /**
   * Handles the create-account form.
   * @param event form submit event
   */
  function onCreateAccount(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!isEmail(email)) {
      setLocalError(t('errors.invalidEmail'));
      return;
    }
    if (password.length < 8) {
      setLocalError(t('errors.shortPassword'));
      return;
    }
    if (displayName.trim().length < USERNAME.minLength) {
      setLocalError(t('errors.shortName'));
      return;
    }
    void run(async () => createAccount(email, password, displayName), t('create.created'));
  }

  /**
   * Handles the device-only form.
   * @param event form submit event
   */
  function onSubmitDevice(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (displayName.trim().length < USERNAME.minLength) {
      setLocalError(t('errors.shortName'));
      return;
    }
    void run(async () => startDeviceSession(displayName), t('device.started'));
  }

  const items: readonly TabItem[] = [
    {
      value: 'link',
      label: t('tabs.link'),
      content: (
        <form className="bsdc-form" onSubmit={onSubmitLink} noValidate>
          <Input
            label={t('fields.email')}
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Button type="submit" loading={busy} fullWidth>
            {t('link.submit')}
          </Button>
        </form>
      ),
    },
    {
      value: 'password',
      label: t('tabs.password'),
      content: (
        <div className="bsdc-stack">
          <form className="bsdc-form" onSubmit={onSubmitPassword} noValidate>
            <Input
              label={t('fields.email')}
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <Input
              label={t('fields.password')}
              type="password"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <Button type="submit" loading={busy} fullWidth>
              {t('password.submit')}
            </Button>
          </form>
          <form className="bsdc-form" onSubmit={onCreateAccount} noValidate>
            <Input
              label={t('fields.displayName')}
              name="displayName"
              autoComplete="name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
            <Button type="submit" variant="outline" loading={busy} fullWidth>
              {t('create.submit')}
            </Button>
          </form>
        </div>
      ),
    },
    {
      value: 'device',
      label: t('tabs.device'),
      content: (
        <form className="bsdc-form" onSubmit={onSubmitDevice} noValidate>
          <Text as="p" className="bsdc-signin__note">
            {t('device.explanation')}
          </Text>
          <Input
            label={t('fields.displayName')}
            name="deviceName"
            autoComplete="name"
            required
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
          <Button type="submit" variant="secondary" loading={busy} fullWidth>
            {t('device.submit')}
          </Button>
        </form>
      ),
    },
  ];

  return (
    <Card className={className} padding="lg">
      <CardHeader>
        <CardTitle>{t(`reason.${reason}`)}</CardTitle>
        {suspended ? (
          <Text as="p" role="alert" className="bsdc-signin__suspended">
            {t('suspended')}
          </Text>
        ) : null}
      </CardHeader>
      <CardBody>
        {notice !== null ? (
          <Text as="p" className="bsdc-signin__note" role="status">
            {notice}
          </Text>
        ) : null}
        {localError !== null || lastError !== null ? (
          <Text as="p" role="alert" className="bsdc-signin__error">
            {localError ?? lastError?.messageBn() ?? ''}
          </Text>
        ) : null}
        <Tabs
          items={items}
          value={mode}
          onValueChange={(next) => setMode(next as SignInMode)}
          label={t('tabs.label')}
        />
      </CardBody>
    </Card>
  );
}
