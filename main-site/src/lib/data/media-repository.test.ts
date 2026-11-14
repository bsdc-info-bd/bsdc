import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UploadResult } from '@/lib/storage/upload';
import { DataError } from '@/lib/supabase/errors';

const rpcMock = vi.fn();
const maybeSingleMock = vi.fn();
const selectMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }));
const insertMock = vi.fn(() => ({ select: selectMock }));
const limitMock = vi.fn();
const orderMock = vi.fn(() => ({ limit: limitMock }));
const eqMock = vi.fn(() => ({ order: orderMock }));
const listSelectMock = vi.fn(() => ({ eq: eqMock }));
const fromMock = vi.fn(() => ({
  insert: insertMock,
  select: listSelectMock,
}));

vi.mock('@/lib/supabase/client', () => ({
  getSupabase: () => ({
    rpc: rpcMock,
    from: fromMock,
  }),
}));

import { listMediaAssets, recordMediaAsset } from './media-repository';

const SAMPLE_UPLOAD: UploadResult = {
  url: 'https://i.ibb.co/sample/photo.webp',
  thumbUrl: 'https://i.ibb.co/sample/photo-thumb.webp',
  provider: 'imgbb',
  kind: 'image',
  bytes: 12_345,
  mimeType: 'image/webp',
  expiresAt: null,
  width: 1200,
  height: 800,
  deleteToken: 'del-secret-token',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('recordMediaAsset', () => {
  it('coerces a scalar uuid returned by the record_media_asset RPC into a MediaAssetRow', async () => {
    rpcMock.mockResolvedValueOnce({
      data: '00000000-0000-4000-8000-000000000042',
      error: null,
    });

    const row = await recordMediaAsset('member-1', SAMPLE_UPLOAD);

    expect(rpcMock).toHaveBeenCalledWith('record_media_asset', {
      p_provider: 'imgbb',
      p_kind: 'image',
      p_url: SAMPLE_UPLOAD.url,
      p_thumb_url: SAMPLE_UPLOAD.thumbUrl,
      p_delete_token: SAMPLE_UPLOAD.deleteToken,
      p_width: 1200,
      p_height: 800,
      p_bytes: 12_345,
      p_mime_type: 'image/webp',
      p_expires_at: null,
    });
    expect(fromMock).not.toHaveBeenCalled();
    expect(row).toMatchObject({
      id: '00000000-0000-4000-8000-000000000042',
      owner_uid: 'member-1',
      provider: 'imgbb',
      kind: 'image',
      url: SAMPLE_UPLOAD.url,
      thumb_url: SAMPLE_UPLOAD.thumbUrl,
      width: 1200,
      height: 800,
      bytes: 12_345,
      mime_type: 'image/webp',
    });
    expect('delete_token' in (row ?? {})).toBe(false);
  });

  it('accepts an array row mock such as [{ id }] returned by E2E harnesses', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [{ id: 'asset-browser' }],
      error: null,
    });

    const row = await recordMediaAsset('member-2', SAMPLE_UPLOAD);

    expect(fromMock).not.toHaveBeenCalled();
    expect(row).toMatchObject({
      id: 'asset-browser',
      owner_uid: 'member-2',
      url: SAMPLE_UPLOAD.url,
    });
  });

  it('falls back to a table insert only when the RPC does not exist (PGRST202 / 42883)', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function public.record_media_asset' },
    });
    const fallbackRow = {
      id: 'fallback-1',
      owner_uid: 'member-1',
      provider: 'imgbb',
      kind: 'image',
      url: SAMPLE_UPLOAD.url,
      thumb_url: SAMPLE_UPLOAD.thumbUrl,
      width: 1200,
      height: 800,
      bytes: 12_345,
      mime_type: 'image/webp',
      checksum: '',
      created_at: '2026-11-11T00:00:00.000Z',
    };
    maybeSingleMock.mockResolvedValueOnce({ data: fallbackRow, error: null });

    const row = await recordMediaAsset('member-1', SAMPLE_UPLOAD);

    expect(fromMock).toHaveBeenCalledWith('media_assets');
    expect(row).toEqual(fallbackRow);
  });

  it('throws DataError immediately without falling back when Postgres rejects validation or permission', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { code: '22023', message: 'invalid parameter value' },
    });

    await expect(recordMediaAsset('member-1', SAMPLE_UPLOAD)).rejects.toBeInstanceOf(DataError);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('queries listMediaAssets using safe display columns without delete_token', async () => {
    limitMock.mockResolvedValueOnce({ data: [], error: null });

    const rows = await listMediaAssets('member-1', 25);

    expect(rows).toEqual([]);
    expect(fromMock).toHaveBeenCalledWith('media_assets');
    const selectedColumns = (listSelectMock.mock.calls[0] as unknown[] | undefined)?.[0];
    expect(typeof selectedColumns).toBe('string');
    expect(selectedColumns).not.toContain('delete_token');
    expect(limitMock).toHaveBeenCalledWith(25);
  });
});
