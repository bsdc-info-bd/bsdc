import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Uploading is two operations, and the second one is silent.
 *
 * `uploadMedia` puts bytes on ImgBB and returns a URL. `recordMediaAsset` writes
 * the row that says who the URL belongs to. Nothing in the upload response says
 * whether that row exists, and three features depend on it: a comment with a
 * picture is refused without it (0120), the sweeper cannot reclaim it, and the
 * upload cannot be attributed to anybody afterwards.
 */

const uploadMedia = vi.fn<(file: File, options: unknown) => Promise<unknown>>();
vi.mock('./upload', () => ({
  uploadMedia: (file: File, options: unknown) => uploadMedia(file, options),
  MediaError: class MediaError extends Error {
    readonly messageKey: string;
    constructor(messageKey: string) {
      super(messageKey);
      this.messageKey = messageKey;
    }
  },
}));

const recordMediaAsset = vi.fn<(uid: string, result: unknown) => Promise<unknown>>();
vi.mock('@/lib/data/media-repository', () => ({
  recordMediaAsset: (uid: string, result: unknown) => recordMediaAsset(uid, result),
}));

const { uploadAndRecord } = await import('./upload-and-record');

const RESULT = {
  provider: 'imgbb',
  kind: 'image',
  url: 'https://i.ibb.co/ada111/crack.jpg',
  thumbUrl: 'https://i.ibb.co/ada111/crack-medium.jpg',
  deleteToken: 'token',
  width: 1200,
  height: 900,
  bytes: 48000,
  mimeType: 'image/webp',
  expiresAt: null,
};

const file = () => new File(['x'], 'crack.png', { type: 'image/png' });

beforeEach(() => {
  uploadMedia.mockReset();
  recordMediaAsset.mockReset();
});

describe('uploadAndRecord', () => {
  it('records the upload against the member and returns the upload', async () => {
    uploadMedia.mockResolvedValue(RESULT);
    recordMediaAsset.mockResolvedValue({ id: 'asset-1', url: RESULT.url });

    const result = await uploadAndRecord(file(), { purpose: 'comment-image' }, 'member-1');

    expect(result).toEqual(RESULT);
    expect(recordMediaAsset).toHaveBeenCalledWith('member-1', RESULT);
  });

  it('does not upload at all for a signed-out caller', async () => {
    // Spending an upload on a row that cannot be written costs the member their
    // data allowance and leaves an orphan at the host.
    await expect(uploadAndRecord(file(), { purpose: 'comment-image' }, '')).rejects.toMatchObject({
      messageKey: 'data.errors.signInRequired',
    });
    expect(uploadMedia).not.toHaveBeenCalled();
    expect(recordMediaAsset).not.toHaveBeenCalled();
  });

  it('fails when the row cannot be written, rather than returning an unusable URL', async () => {
    uploadMedia.mockResolvedValue(RESULT);
    recordMediaAsset.mockResolvedValue(null);

    await expect(
      uploadAndRecord(file(), { purpose: 'comment-image' }, 'member-1'),
    ).rejects.toMatchObject({ messageKey: 'media.errors.recordFailed' });
  });

  it('passes the upload failure through untouched', async () => {
    uploadMedia.mockRejectedValue(
      Object.assign(new Error('media.errors.tooLarge'), { messageKey: 'media.errors.tooLarge' }),
    );

    await expect(
      uploadAndRecord(file(), { purpose: 'comment-image' }, 'member-1'),
    ).rejects.toMatchObject({ messageKey: 'media.errors.tooLarge' });
    expect(recordMediaAsset).not.toHaveBeenCalled();
  });
});
