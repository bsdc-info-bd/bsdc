/**
 * BSDC — src/tests/components/signIn.test.tsx
 * Purpose : Proves the sign-in surface offers every real path and that a device session is a real
 *   session, not a fabricated one.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The device path is asserted end to end because it is the path a person takes when the
 *   network is unavailable: it must produce a genuine profile with a name the person chose.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@/app/providers/I18nProvider';
import i18next from 'i18next';
import { stubLocaleFetch } from '../helpers/i18n';

beforeAll(() => {
  stubLocaleFetch();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Renders the sign-in surface inside the real i18n and session providers.
 * @returns the render result
 */
async function renderSignIn(): Promise<ReturnType<typeof render>> {
  const { SessionProvider, SignInCard } = await import('@/features/auth');
  await i18next.changeLanguage('bn');

  return render(
    <I18nProvider>
      <SessionProvider>
        <SignInCard />
      </SessionProvider>
    </I18nProvider>,
  );
}

describe('sign-in surface', () => {
  it('offers the email-link, password and device paths in Bangla', async () => {
    await renderSignIn();
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'ইমেইল লিংক' })).toBeTruthy();
    });
    expect(screen.getByRole('tab', { name: 'পাসওয়ার্ড' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'শুধু এই ডিভাইস' })).toBeTruthy();
  });

  it('refuses an email that is not an email', async () => {
    const user = userEvent.setup();
    await renderSignIn();
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'ইমেইল লিংক' })).toBeTruthy();
    });
    await user.type(screen.getByLabelText(/ইমেইল ঠিকানা/), 'not-an-email');
    await user.click(screen.getByRole('button', { name: /সাইন-ইন লিংক পাঠান/ }));
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('বৈধ ইমেইল');
    });
  });

  it('starts a real device session with the name the person chose', async () => {
    const user = userEvent.setup();
    const { SessionProvider, useSession } = await import('@/features/auth');
    const { SignInCard } = await import('@/features/auth');
    await i18next.changeLanguage('bn');

    /**
     * Reports the session state to the assertions below.
     * @returns a status line
     */
    function Probe(): React.ReactElement {
      const { session, profile } = useSession();
      return (
        <p data-testid="probe">{`${session.status}:${session.source}:${profile?.displayName ?? ''}`}</p>
      );
    }

    render(
      <I18nProvider>
        <SessionProvider>
          <Probe />
          <SignInCard />
        </SessionProvider>
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'শুধু এই ডিভাইস' })).toBeTruthy();
    });
    await user.click(screen.getByRole('tab', { name: 'শুধু এই ডিভাইস' }));
    await user.type(screen.getByLabelText(/^নাম/), 'রিজওয়ান');
    await user.click(screen.getByRole('button', { name: /এই ডিভাইসে শুরু করুন/ }));

    await waitFor(() => {
      expect(screen.getByTestId('probe').textContent).toContain('signed-in:device:রিজওয়ান');
    });
  });
});
