import { describe, expect, it } from 'vitest';
import { DataError, toDataError } from '@kit';
import { campaignLoadMessage, settleCampaignWorkspace } from './campaign-loader';

describe('the campaign workspace', () => {
  it('keeps the book and wallet usable when inventory alone fails', async () => {
    const workspace = await settleCampaignWorkspace('test', {
      campaigns: Promise.resolve([]),
      owners: Promise.resolve([]),
      inventory: Promise.reject(new DataError('missing', 'PGRST202', '')),
    });
    expect(workspace.search).toBe('test');
    expect(workspace.campaigns.ok).toBe(true);
    expect(workspace.owners.ok).toBe(true);
    expect(workspace.inventory.ok).toBe(false);
    if (!workspace.inventory.ok) {
      expect(workspace.inventory.message).toContain('ad_inventory');
      expect(workspace.inventory.message).toContain('0077–0079');
    }
  });

  it('does not mistake a database grant failure for a missing application permission', () => {
    const permission = toDataError({
      code: '42501',
      message: 'Permission ads.manage is required',
      details: '',
      hint: '',
      name: 'PostgrestError',
    } as unknown as Parameters<typeof toDataError>[0]);
    const grant = toDataError({
      code: '42501',
      message: 'permission denied for function campaign_owners',
      details: '',
      hint: '',
      name: 'PostgrestError',
    } as unknown as Parameters<typeof toDataError>[0]);
    expect(campaignLoadMessage('campaign_owners', permission)).toContain('ads.manage');
    expect(campaignLoadMessage('campaign_owners', grant)).toContain('database grants');
    expect(campaignLoadMessage('campaign_owners', grant)).not.toContain('ads.manage');
  });

  it('preserves other endpoints when the owner directory fails', async () => {
    const workspace = await settleCampaignWorkspace('', {
      campaigns: Promise.resolve([]),
      owners: Promise.reject(new Error('offline')),
      inventory: Promise.resolve([]),
    });
    expect(workspace.campaigns.ok).toBe(true);
    expect(workspace.inventory.ok).toBe(true);
    expect(workspace.owners.ok).toBe(false);
    if (!workspace.owners.ok) expect(workspace.owners.message).toContain('offline');
  });
});
