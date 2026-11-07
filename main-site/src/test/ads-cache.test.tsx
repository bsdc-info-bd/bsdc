import type { User } from 'firebase/auth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCampaignDetail } from '@/hooks/use-ads';
import type { CampaignCreative } from '@/lib/ads/ads-types';
import { DEFAULT_CLAIMS, useAuthStore } from '@/store/auth-store';

const mocks = vi.hoisted(() => ({
  auth: { currentUser: null as { uid: string } | null },
  creatives: vi.fn(),
  daily: vi.fn(),
}));
vi.mock('@/lib/firebase', () => ({ getFirebaseAuth: () => mocks.auth }));
vi.mock('@/lib/ads/ads-repository', () => ({
  fetchCreatives: mocks.creatives,
  fetchDaily: mocks.daily,
}));

const creative = (headline: string): CampaignCreative => ({
  id: 'same-id',
  placement: 'feed',
  headline,
  body: '',
  imageUrl: '',
  ctaLabel: '',
  targetUrl: 'https://example.test/',
  isEnabled: true,
  impressions: 0,
  clicks: 0,
  spend: 0,
});
function signIn(uid: string): void {
  mocks.auth.currentUser = { uid };
  useAuthStore.getState().setSession({ uid } as User, DEFAULT_CLAIMS);
}
function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    client,
    Wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  };
}
beforeEach(() => {
  useAuthStore.getState().reset();
  mocks.auth.currentUser = null;
  mocks.creatives.mockReset();
  mocks.daily.mockReset().mockResolvedValue([]);
});

describe('campaign detail cache isolation', () => {
  it('separates creative and daily answers by Firebase UID', async () => {
    mocks.creatives.mockImplementation(() =>
      Promise.resolve([creative(mocks.auth.currentUser?.uid ?? '')]),
    );
    signIn('advertiser-a');
    const { client, Wrapper } = wrapper();
    const { result } = renderHook(() => useCampaignDetail('campaign-shared'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.creatives[0]?.headline).toBe('advertiser-a'));
    act(() => signIn('advertiser-b'));
    expect(result.current.creatives.some((row) => row.headline === 'advertiser-a')).toBe(false);
    await waitFor(() => expect(result.current.creatives[0]?.headline).toBe('advertiser-b'));
    expect(client.getQueryData(['creatives', 'advertiser-a', 'campaign-shared'])).toEqual([
      creative('advertiser-a'),
    ]);
    expect(client.getQueryData(['creatives', 'advertiser-b', 'campaign-shared'])).toEqual([
      creative('advertiser-b'),
    ]);
    await waitFor(() =>
      expect(client.getQueryData(['campaign-daily', 'advertiser-b', 'campaign-shared'])).toEqual(
        [],
      ),
    );
  });

  it('discards a result if Firebase changes before the auth store catches up', async () => {
    let finish: ((rows: CampaignCreative[]) => void) | undefined;
    mocks.creatives.mockImplementation(
      () =>
        new Promise<CampaignCreative[]>((resolve) => {
          finish = resolve;
        }),
    );
    signIn('advertiser-a');
    const { client, Wrapper } = wrapper();
    const { result } = renderHook(() => useCampaignDetail('campaign-shared'), { wrapper: Wrapper });
    await waitFor(() => expect(finish).toBeDefined());
    mocks.auth.currentUser = { uid: 'advertiser-b' };
    act(() => finish?.([creative('advertiser-b private copy')]));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.getQueryData(['creatives', 'advertiser-a', 'campaign-shared'])).toBeUndefined();
    expect(result.current.creatives).toEqual([]);
  });
});
