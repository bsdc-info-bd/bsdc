import { DataError, messageOf } from '@kit';
import { oldestFirst, type CampaignRow, type OwnerRow, type PlacementRow } from './campaigns';

export type CampaignSection<T> =
  | { readonly ok: true; readonly data: readonly T[] }
  | { readonly ok: false; readonly message: string };

export interface CampaignWorkspace {
  readonly search: string;
  readonly campaigns: CampaignSection<CampaignRow>;
  readonly owners: CampaignSection<OwnerRow>;
  readonly inventory: CampaignSection<PlacementRow>;
}

/** Name the failing endpoint and distinguish deployment, permission and network errors. */
export function campaignLoadMessage(endpoint: string, cause: unknown): string {
  if (cause instanceof DataError && cause.code === 'PGRST202') {
    return `${endpoint}: the database function is missing from the API schema. Deploy campaign migrations 0077–0079 and refresh the API schema cache, then retry.`;
  }
  if (cause instanceof DataError && cause.code === '42501') {
    return `${endpoint}: ${messageOf(cause)}`;
  }
  const code = cause instanceof DataError && cause.code !== 'unknown' ? ` (${cause.code})` : '';
  return `${endpoint}${code}: ${messageOf(cause)}`;
}

/** Independent sections stay available when one of the three RPCs fails. */
export async function settleCampaignWorkspace(
  search: string,
  requests: {
    readonly campaigns: Promise<readonly CampaignRow[]>;
    readonly owners: Promise<readonly OwnerRow[]>;
    readonly inventory: Promise<readonly PlacementRow[]>;
  },
): Promise<CampaignWorkspace> {
  const [campaigns, owners, inventory] = await Promise.allSettled([
    requests.campaigns,
    requests.owners,
    requests.inventory,
  ] as const);
  return {
    search,
    campaigns:
      campaigns.status === 'fulfilled'
        ? { ok: true, data: oldestFirst(campaigns.value) }
        : { ok: false, message: campaignLoadMessage('campaign_book', campaigns.reason) },
    owners:
      owners.status === 'fulfilled'
        ? { ok: true, data: owners.value }
        : { ok: false, message: campaignLoadMessage('campaign_owners', owners.reason) },
    inventory:
      inventory.status === 'fulfilled'
        ? { ok: true, data: inventory.value }
        : { ok: false, message: campaignLoadMessage('ad_inventory', inventory.reason) },
  };
}
