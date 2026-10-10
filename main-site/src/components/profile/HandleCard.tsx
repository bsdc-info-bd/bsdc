import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { Alert, Button, Card, TextField } from '@/design-system';
import { dataErrorKey } from '@/lib/supabase/errors';
import {
  HANDLE_COOLDOWN_DAYS,
  HANDLE_ISSUE_KEYS,
  HANDLE_LIMITS,
  changeUsername,
  fetchNextUsernameChange,
  handleIssue,
  normaliseHandle,
} from '@/lib/profile/username';
import { profilePath } from '@/lib/site';
import { useProfileStore } from '@/store/profile-store';

/**
 * The handle, and what changing one costs.
 *
 * Two things are said out loud here that a form usually leaves to be discovered.
 * The address other people already hold keeps working, because the change writes
 * a permanent redirect behind itself — so this is not the destructive thing it
 * looks like. And the wait is shown with a date rather than found out by pressing
 * the button, because a refusal with no date on it is an argument.
 */
export function HandleCard() {
  const { t, i18n } = useTranslation();
  const profile = useProfileStore((state) => state.profile);
  const setProfile = useProfileStore((state) => state.setProfile);
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const current = profile?.username ?? null;
  const uid = profile?.uid ?? null;

  const window = useQuery({
    queryKey: ['username-change-window', uid],
    queryFn: fetchNextUsernameChange,
    enabled: uid !== null,
    staleTime: 60_000,
  });

  // `null` is the routine saying "now". While the answer has not arrived, the
  // button stays put rather than guessing which way the rule fell.
  const waitsUntil = window.data ?? null;
  const mayChangeNow = window.isSuccess && waitsUntil === null;

  const issue = handleIssue(draft, current);
  const typed = normaliseHandle(draft).length > 0;
  const errorKey = issue !== null && typed ? HANDLE_ISSUE_KEYS[issue] : null;

  async function change() {
    if (uid === null || profile === null) return;
    setBusy(true);
    try {
      const handle = await changeUsername(draft);
      setDraft('');
      setProfile({ ...profile, username: handle });
      void queryClient.invalidateQueries({ queryKey: ['username-change-window', uid] });
      void queryClient.invalidateQueries({ queryKey: ['profile', uid] });
      toast.success(t('handle.changed', { handle }));
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    } finally {
      setBusy(false);
    }
  }

  const date =
    waitsUntil !== null
      ? new Date(waitsUntil).toLocaleDateString(i18n.language === 'en' ? 'en-US' : 'bn-BD', {
          dateStyle: 'long',
        })
      : '';

  return (
    <Card>
      <div className="grid gap-4">
        <div>
          <h2 className="text-base font-semibold">{t('handle.title')}</h2>
          <p className="mt-1 text-body-sm text-ink-2">{t('handle.body')}</p>
        </div>

        {current !== null ? (
          <p className="text-sm text-ink-2">
            {t('handle.current')}{' '}
            <Link to={profilePath(current)} className="font-semibold hover:underline">
              @{current}
            </Link>
          </p>
        ) : (
          <Alert tone="info" title={t('handle.none.title')}>
            {t('handle.none.body')}
          </Alert>
        )}

        {waitsUntil !== null ? (
          <Alert tone="warning" title={t('handle.waitUntil', { date })}>
            {t('handle.waitBody', { days: HANDLE_COOLDOWN_DAYS })}
          </Alert>
        ) : null}

        <TextField
          label={current !== null ? t('handle.newLabel') : t('handle.firstLabel')}
          hint={t('handle.hint')}
          value={draft}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={HANDLE_LIMITS.max}
          error={errorKey !== null ? t(errorKey) : undefined}
          onChange={(event) => setDraft(event.target.value)}
        />

        <div>
          <Button
            loading={busy}
            disabled={!mayChangeNow || issue !== null || !typed}
            onClick={() => void change()}
          >
            {current !== null ? t('handle.change') : t('handle.claim')}
          </Button>
        </div>
      </div>
    </Card>
  );
}
