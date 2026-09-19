/**
 * BSDC — src/tests/components/reactionBar.test.tsx
 * Purpose : Proves the reaction row is tappable, announces itself, and reacts optimistically.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The remote write is mocked so the test exercises rendering and the optimistic state
 *   machine rather than the network. The picker is asserted by accessible name, because a reaction
 *   row that only works with a mouse excludes most of the people this product is for.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { stubLocaleFetch } from '../helpers/i18n';

const setReaction = vi.fn(
  (
    _postId: string,
    _uid: string,
    _type: string | null,
  ): Promise<{ synced: boolean; queued: boolean; error: null }> =>
    Promise.resolve({ synced: false, queued: true, error: null }),
);

vi.mock('@/entities/reaction/repository', () => ({
  setReaction: (
    postId: string,
    uid: string,
    type: string | null,
  ): Promise<{ synced: boolean; queued: boolean; error: null }> => setReaction(postId, uid, type),
  peekReactionSummary: (): Promise<{ counts: Record<string, number>; total: number; mine: null }> =>
    Promise.resolve({ counts: {}, total: 0, mine: null }),
  watchReactions: (): (() => void) => () => undefined,
}));

beforeAll(() => {
  stubLocaleFetch();
});

afterEach(() => {
  setReaction.mockClear();
});

/**
 * Builds a reaction summary.
 * @param mine the viewer's reaction
 * @param total total count
 * @returns the summary
 */
function summary(mine: 'like' | null, total: number) {
  const counts = {
    like: mine === 'like' ? total : 0,
    love: 0,
    care: 0,
    haha: 0,
    wow: 0,
    sad: 0,
    angry: 0,
    clap: 0,
    fire: 0,
    mindblown: 0,
  };
  return { counts, total, mine };
}

/**
 * Renders the reaction bar.
 * @param props overrides for the bar
 * @returns the render result
 */
async function renderBar(
  props: { readonly mine?: 'like' | null; readonly viewerUid?: string | null } = {},
) {
  const { I18nProvider } = await import('@/app/providers/I18nProvider');
  const { ReactionBar } = await import('@/features/reactions');
  const i18next = (await import('i18next')).default;
  await i18next.changeLanguage('bn');

  return render(
    <I18nProvider>
      <ReactionBar
        postId="p1"
        summary={summary(props.mine ?? null, (props.mine ?? null) === null ? 3 : 4)}
        locale="bn"
        viewerUid={props.viewerUid === undefined ? 'u1' : props.viewerUid}
      />
    </I18nProvider>,
  );
}

describe('reaction bar', () => {
  it('shows the count and labels the default reaction', async () => {
    await renderBar();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /পছন্দ/ })).toBeTruthy();
    });
    const { formatCompact } = await import('@/shared/lib/number.bn');
    expect(screen.getByText(formatCompact(3, 'bn'))).toBeTruthy();
  });

  it('opens the chooser and applies the picked reaction', async () => {
    const user = userEvent.setup();
    await renderBar();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /রিঅ্যাকশন/ })).toBeTruthy();
    });
    await user.click(screen.getByRole('button', { name: /রিঅ্যাকশন/ }));

    const picker = await screen.findByRole('group', { name: /একটি রিঅ্যাকশন বেছে নিন/ });
    expect(picker).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'ভালোবাসা' }));

    await waitFor(() => {
      expect(setReaction).toHaveBeenCalledWith('p1', 'u1', 'love');
    });
  });

  it('disables the row for a signed-out visitor', async () => {
    await renderBar({ viewerUid: null });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /পছন্দ/ })).toBeDisabled();
    });
  });

  it("marks the viewer's own reaction as pressed", async () => {
    await renderBar({ mine: 'like' });
    await waitFor(() => {
      const button = screen.getByRole('button', { name: /পছন্দ/ });
      expect(button.getAttribute('aria-pressed')).toBe('true');
    });
  });
});
