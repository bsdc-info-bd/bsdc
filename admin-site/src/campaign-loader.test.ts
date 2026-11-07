import { describe, expect, it } from 'vitest';
import { DataError } from '@kit';
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

  it('identifies a permission failure without claiming it is a migration issue', () => {
    const message = campaignLoadMessage('campaign_owners', new DataError('no', '42501', ''));
    expect(message).toContain('ads.manage');
    expect(message).not.toContain('migration');
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
