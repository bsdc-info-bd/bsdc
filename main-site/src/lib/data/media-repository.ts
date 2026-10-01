import { getSupabase } from '@/lib/supabase/client';
import { toDataError } from '@/lib/supabase/errors';
import type { MediaAssetRow } from '@/lib/supabase/types';
import type { UploadResult } from '@/lib/storage/upload';

/** Records an upload so moderation, quotas and clean-up have a trail. */
export async function recordMediaAsset(
  ownerUid: string,
  result: UploadResult,
): Promise<MediaAssetRow | null> {
  const { data, error } = await getSupabase()
    .from('media_assets')
    .insert({
      owner_uid: ownerUid,
      provider: result.provider,
      kind: result.kind,
      url: result.url,
      thumb_url: result.thumbUrl,
      delete_token: result.deleteToken,
      width: result.width,
      height: result.height,
      bytes: result.bytes,
      mime_type: result.mimeType,
      checksum: '',
    })
    .select('*')
    .maybeSingle();

  if (error) throw toDataError(error);
  return data;
}

export async function listMediaAssets(ownerUid: string, limit = 50): Promise<MediaAssetRow[]> {
  const { data, error } = await getSupabase()
    .from('media_assets')
    .select('*')
    .eq('owner_uid', ownerUid)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw toDataError(error);
  return data ?? [];
}
