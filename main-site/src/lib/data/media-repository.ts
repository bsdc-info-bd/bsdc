import { getSupabase } from '@/lib/supabase/client';
import { toDataError } from '@/lib/supabase/errors';
import type { DbMediaPurpose, MediaAssetRow } from '@/lib/supabase/types';
import type { MediaPurpose, UploadResult } from '@/lib/storage/upload';
import {
  cursorAfterPage,
  type GalleryCursor,
  type GalleryFilter,
  type GalleryImage,
  type GalleryPage,
} from '@/lib/media/gallery';

// Never request provider deletion credentials from the browser-facing table.
// `purpose` is in the list because 0132 granted it deliberately, and a row that
// cannot say what it was uploaded for cannot be filed in the library.
const DISPLAY_COLUMNS =
  'id, owner_uid, provider, kind, url, thumb_url, width, height, bytes, mime_type, checksum, purpose, created_at';

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
function buildAssetRow(
  id: string,
  ownerUid: string,
  result: UploadResult,
  purpose: MediaPurpose,
): MediaAssetRow {
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
    purpose: purpose as DbMediaPurpose,
    created_at: new Date().toISOString(),
  };
}

function coerceRpcAsset(
  data: unknown,
  ownerUid: string,
  result: UploadResult,
  purpose: MediaPurpose,
): MediaAssetRow | null {
  if (typeof data === 'string') {
    const id = data.trim();
    return id.length > 0 ? buildAssetRow(id, ownerUid, result, purpose) : null;
  }
  const row = Array.isArray(data) ? (data[0] as unknown) : data;
  if (row !== null && typeof row === 'object' && 'id' in row) {
    const record = row as Partial<MediaAssetRow>;
    if (typeof record.id === 'string' && record.id.trim().length > 0) {
      if (typeof record.url === 'string' && record.url.length > 0) {
        return {
          ...buildAssetRow(record.id.trim(), ownerUid, result, purpose),
          ...record,
          id: record.id.trim(),
        };
      }
      return buildAssetRow(record.id.trim(), ownerUid, result, purpose);
    }
  }
  return null;
}

function isMissingRpcError(error: { code?: string; message?: string }): boolean {
  return error.code === 'PGRST202' || error.code === '42883';
}

function isAuthRefreshableError(error: { code?: string; message?: string }): boolean {
  return (
    error.code === 'PGRST301' ||
    error.code === '28000' ||
    (typeof error.message === 'string' && error.message.includes('auth/required'))
  );
}

async function tryRefreshMemberToken(ownerUid: string): Promise<boolean> {
  try {
    const { getFirebaseAuth } = await import('@/lib/firebase');
    const auth = getFirebaseAuth() as {
      currentUser: {
        uid?: string;
        getIdToken?: (forceRefresh?: boolean) => Promise<string>;
      } | null;
      authStateReady?: () => Promise<void>;
    };
    await auth.authStateReady?.();
    const user = auth.currentUser;
    if (user === null || user.uid !== ownerUid || typeof user.getIdToken !== 'function') {
      return false;
    }
    const refreshed = await user.getIdToken(true);
    return refreshed.length > 0;
  } catch {
    return false;
  }
}

/**
 * `purpose` decides how the picture is filed in the member's own library.
 *
 * It defaults to 'other' rather than being required, because every caller written
 * before 0132 is still correct: their upload is recorded, and the library simply
 * cannot say what it was for. A caller that knows better should say — that is the
 * whole difference between a gallery and a pile.
 */
export async function recordMediaAsset(
  ownerUid: string,
  result: UploadResult,
  purpose: MediaPurpose = 'other',
): Promise<MediaAssetRow | null> {
  const rpcArgs = {
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
    p_purpose: purpose as DbMediaPurpose,
  };

  let { data, error } = await getSupabase().rpc('record_media_asset', rpcArgs);

  if (error && isAuthRefreshableError(error) && (await tryRefreshMemberToken(ownerUid))) {
    ({ data, error } = await getSupabase().rpc('record_media_asset', rpcArgs));
  }

  if (error) {
    // A deployment that has not applied 0073 has no such function. Fall back
    // to a direct table insert only when the RPC itself does not exist; real
    // validation or auth refusals (22023, 42501, 54000) must surface clearly.
    if (!isMissingRpcError(error)) throw toDataError(error);
  } else if (data !== null) {
    const coerced = coerceRpcAsset(data, ownerUid, result, purpose);
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
      purpose: purpose as DbMediaPurpose,
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

// `my_gallery` is typed in `supabase/types.ts`, but PostgREST hands back the rows of
// a `returns table (...)` function as an untyped array here; every field is read
// defensively because a tile that throws takes the dialog down with it.
type GalleryRow = Record<string, unknown>;

/**
 * One page of a member's own library.
 *
 * Read through `my_gallery` and not the table, which is the same choice 0073 made
 * for the write path: the answer depends on `owner_uid` matching the caller, on
 * purged rows being hidden, and on counts taken from other people's messages and
 * comments — three things a policy on `media_assets` can do none of. A direct
 * select would also leak the delete capability the moment the row is readable, and
 * it cannot say where a picture is used without reading tables the client has no
 * business reading.
 *
 * `cursor` is the pair the previous page ended on. Both halves or neither: the
 * function refuses a partial cursor with 22023 rather than returning page one a
 * second time and letting an infinite scroller spin.
 */
export async function listGallery(
  input: {
    limit?: number;
    purpose?: GalleryFilter;
    query?: string;
    cursor?: GalleryCursor | null;
  } = {},
): Promise<GalleryPage> {
  const { data, error } = await getSupabase().rpc('my_gallery', {
    p_limit: input.limit ?? 60,
    p_purpose: input.purpose ?? 'all',
    p_query: input.query ?? '',
    p_before: input.cursor?.before ?? null,
    p_before_id: input.cursor?.beforeId ?? null,
  });

  if (error) throw toDataError(error);

  const rows = (data ?? []) as unknown as GalleryRow[];
  const items: GalleryImage[] = rows.map((row) => ({
    id: String(row.id ?? ''),
    url: String(row.url ?? ''),
    thumbUrl: String(row.thumb_url ?? ''),
    purpose: String(row.purpose ?? 'other'),
    width: row.width === null || row.width === undefined ? null : Number(row.width),
    height: row.height === null || row.height === undefined ? null : Number(row.height),
    bytes: Number(row.bytes ?? 0),
    mimeType: String(row.mime_type ?? ''),
    createdAt: String(row.created_at ?? ''),
    expiresAt:
      row.expires_at === null || row.expires_at === undefined ? null : String(row.expires_at),
    inUse: row.in_use === true,
    uses: Number(row.uses ?? 0),
    surfaces: Array.isArray(row.surfaces) ? (row.surfaces as unknown[]).map(String) : [],
    altText: String(row.alt_text ?? ''),
  }));

  // The cursor is derived from what came back rather than handed to the caller to
  // build, so no page can be resumed from a position its own client miscounted.
  return { items, nextCursor: cursorAfterPage(items) };
}
