import { getSupabase } from '@/lib/supabase/client';
import { toDataError } from '@/lib/supabase/errors';
import type { MediaAssetRow } from '@/lib/supabase/types';
import type { UploadResult } from '@/lib/storage/upload';

// Never request provider deletion credentials from the browser-facing table.
const DISPLAY_COLUMNS =
  'id, owner_uid, provider, kind, url, thumb_url, width, height, bytes, mime_type, checksum, created_at';

/**
 * Records an upload so moderation, quotas and clean-up have a trail.
 *
 * Written through `record_media_asset` rather than an insert. The difference is
 * not stylistic: the expiry and the delete capability are the two fields that
 * decide whether a file on somebody else's disk ever goes away, and a table
 * policy cannot stop a client from writing a later date than the host was given.
 * The definer function validates both, counts the member's live uploads against
 * a ceiling, and owns the row's owner.
 *
 * An upload that is not recorded still exists at the host. That is a leak, so the
 * failure to record is thrown rather than swallowed: a caller that cannot record
 * should tell the member, not pretend the picture is safely stored.
 */
function buildAssetRow(id: string, ownerUid: string, result: UploadResult): MediaAssetRow {
  return {
    id,
    owner_uid: ownerUid,
    provider: result.provider,
    kind: result.kind,
    url: result.url,
    thumb_url: result.thumbUrl,
    width: result.width,
    height: result.height,
    bytes: result.bytes,
    mime_type: result.mimeType,
    checksum: '',
    created_at: new Date().toISOString(),
  };
}

function coerceRpcAsset(
  data: unknown,
  ownerUid: string,
  result: UploadResult,
): MediaAssetRow | null {
  if (typeof data === 'string') {
    const id = data.trim();
    return id.length > 0 ? buildAssetRow(id, ownerUid, result) : null;
  }
  const row = Array.isArray(data) ? (data[0] as unknown) : data;
  if (row !== null && typeof row === 'object' && 'id' in row) {
    const record = row as Partial<MediaAssetRow>;
    if (typeof record.id === 'string' && record.id.trim().length > 0) {
      if (typeof record.url === 'string' && record.url.length > 0) {
        return {
          ...buildAssetRow(record.id.trim(), ownerUid, result),
          ...record,
          id: record.id.trim(),
        };
      }
      return buildAssetRow(record.id.trim(), ownerUid, result);
    }
  }
  return null;
}

function isMissingRpcError(error: { code?: string; message?: string }): boolean {
  return error.code === 'PGRST202' || error.code === '42883';
}

export async function recordMediaAsset(
  ownerUid: string,
  result: UploadResult,
): Promise<MediaAssetRow | null> {
  const { data, error } = await getSupabase().rpc('record_media_asset', {
    p_provider: result.provider,
    p_kind: result.kind,
    p_url: result.url,
    p_thumb_url: result.thumbUrl,
    p_delete_token: result.deleteToken,
    p_width: result.width,
    p_height: result.height,
    p_bytes: result.bytes,
    p_mime_type: result.mimeType,
    p_expires_at: result.expiresAt,
  });

  if (error) {
    // A deployment that has not applied 0073 has no such function. Fall back
    // to a direct table insert only when the RPC itself does not exist; real
    // validation or auth refusals (22023, 42501, 54000) must surface clearly.
    if (!isMissingRpcError(error)) throw toDataError(error);
  } else if (data !== null) {
    const coerced = coerceRpcAsset(data, ownerUid, result);
    if (coerced !== null) return coerced;
  }

  const { data: fallback, error: fallbackError } = await getSupabase()
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
    .select(DISPLAY_COLUMNS)
    .maybeSingle();
  if (fallbackError) throw toDataError(fallbackError);
  return fallback;
}

export async function listMediaAssets(ownerUid: string, limit = 50): Promise<MediaAssetRow[]> {
  const { data, error } = await getSupabase()
    .from('media_assets')
    .select(DISPLAY_COLUMNS)
    .eq('owner_uid', ownerUid)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw toDataError(error);
  return data ?? [];
}
