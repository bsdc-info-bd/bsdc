import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCoverUpload, type CoverUpload } from './use-cover-upload';
import type { MediaPurpose, UploadOptions, UploadResult } from '@/lib/storage/upload';
import type * as MediaRepositoryModule from '@/lib/data/media-repository';
import type * as UploadModule from '@/lib/storage/upload';
import type * as I18nModule from 'react-i18next';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof I18nModule>();
  return {
    ...actual,
    // Keys come back as keys, so an assertion reads the same as the locale file.
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
  };
});

// Typed, and with a block body: an untyped `vi.fn()` returns `any`, and an
// arrow that hands that straight back out is an unsafe return the linter is
// right to refuse even inside a test.
const toastError = vi.fn<(key: string) => void>();
vi.mock('sonner', () => ({
  toast: {
    error: (key: string) => {
      toastError(key);
    },
    success: vi.fn(),
  },
}));

// Typed rather than `vi.fn()`: an untyped mock returns `any`, and the point of
// this suite is that the purpose reaching the transport is the one the surface
// chose, because that purpose is what decides which host holds the bytes.
const uploadMedia = vi.fn<(file: File, options: UploadOptions) => Promise<UploadResult>>();
vi.mock('@/lib/storage/upload', async (importOriginal) => {
  const actual = await importOriginal<typeof UploadModule>();
  return {
    ...actual,
    uploadMedia: (...args: Parameters<typeof uploadMedia>) => uploadMedia(...args),
  };
});

const recordMediaAsset =
  vi.fn<(ownerUid: string, result: UploadResult) => Promise<{ id: string } | null>>();
vi.mock('@/lib/data/media-repository', async (importOriginal) => {
  const actual = await importOriginal<typeof MediaRepositoryModule>();
  return {
    ...actual,
    recordMediaAsset: (...args: Parameters<typeof recordMediaAsset>) => recordMediaAsset(...args),
  };
});

const objectUrls: string[] = [];
const revokedUrls: string[] = [];
// Assigned onto the class rather than swapped for a plain object: code under
// test still needs `new URL(...)` to work.
URL.createObjectURL = vi.fn(() => {
  const url = `blob:mock/${objectUrls.length + 1}`;
  objectUrls.push(url);
  return url;
});
URL.revokeObjectURL = vi.fn((url: string) => {
  revokedUrls.push(url);
});

function picture(name = 'cover.png', type = 'image/png', size = 4096): File {
  return new File([new Uint8Array(size)], name, { type });
}

function result(url: string): UploadResult {
  return {
    url,
    thumbUrl: `${url}?thumb`,
    provider: 'cloudinary',
    kind: 'image',
    bytes: 4096,
    mimeType: 'image/png',
    width: 1600,
    height: 900,
    deleteToken: '',
  };
}

const latest: { current: CoverUpload | null } = { current: null };

function cover(): CoverUpload {
  if (latest.current === null) throw new Error('the harness has not rendered');
  return latest.current;
}

function Harness({ purpose = 'cover' }: { purpose?: MediaPurpose }) {
  const upload = useCoverUpload(purpose);
  latest.current = upload;
  return (
    <div>
      <output data-testid="file">{upload.file?.name ?? 'none'}</output>
      <output data-testid="preview">{upload.previewUrl}</output>
      <output data-testid="progress">{upload.progress === null ? 'idle' : upload.progress}</output>
    </div>
  );
}

function open(purpose: MediaPurpose = 'cover') {
  const view = render(<Harness purpose={purpose} />);
  return view;
}

/** Runs an async call the way a click handler would, so state settles. */
async function call<T>(run: () => Promise<T>): Promise<T> {
  let outcome: T | undefined;
  await act(async () => {
    outcome = await run();
  });
  return outcome as T;
}

beforeEach(() => {
  vi.clearAllMocks();
  objectUrls.length = 0;
  revokedUrls.length = 0;
  latest.current = null;
  uploadMedia.mockResolvedValue(result('https://res.cloudinary.com/bsdc/image/upload/cover.png'));
  recordMediaAsset.mockResolvedValue({ id: 'asset-1' });
});

describe('one cover picture, uploaded when the member commits', () => {
  it('previews a chosen picture locally before a single byte moves', async () => {
    open();
    act(() => cover().choose(picture('meghna.png')));

    await waitFor(() => expect(cover().previewUrl).toMatch(/^blob:mock\//));
    expect(cover().file?.name).toBe('meghna.png');
    // Choosing is not committing. A member who abandons the form leaves nothing
    // at a host they were never told about.
    expect(uploadMedia).not.toHaveBeenCalled();
  });

  it('refuses a document and says which rule refused it', () => {
    open();
    act(() => cover().choose(picture('notes.pdf', 'application/pdf')));

    expect(cover().file).toBeNull();
    expect(cover().previewUrl).toBe('');
    expect(toastError).toHaveBeenCalledWith('media.errors.unsupported');
    expect(uploadMedia).not.toHaveBeenCalled();
  });

  it('sends the purpose the surface chose, which is what picks the host', async () => {
    open('cover');
    act(() => cover().choose(picture()));
    await call(() => cover().ensureUploaded('member-1'));

    expect(uploadMedia).toHaveBeenCalledTimes(1);
    expect(uploadMedia.mock.calls[0]?.[1]).toMatchObject({ purpose: 'cover' });
  });

  it('resolves to null when no picture was chosen, so a caller cannot publish a stray URL', async () => {
    open();
    const url = await call(() => cover().ensureUploaded('member-1'));

    expect(url).toBeNull();
    expect(uploadMedia).not.toHaveBeenCalled();
    expect(recordMediaAsset).not.toHaveBeenCalled();
  });

  it('uploads once and keeps the result when the publish is retried', async () => {
    open();
    act(() => cover().choose(picture()));

    const first = await call(() => cover().ensureUploaded('member-1'));
    const second = await call(() => cover().ensureUploaded('member-1'));

    // A slow phone whose database briefly refused a row must not send the same
    // picture to a host a second time to get the row it was already owed.
    expect(first).toBe(second);
    expect(uploadMedia).toHaveBeenCalledTimes(1);
    expect(recordMediaAsset).toHaveBeenCalledTimes(1);
  });

  it('refuses to hand back a URL the database has no row for', async () => {
    recordMediaAsset.mockResolvedValueOnce(null);
    open();
    act(() => cover().choose(picture()));

    await expect(call(() => cover().ensureUploaded('member-1'))).rejects.toThrow(
      'media.errors.recordFailed',
    );
    expect(uploadMedia).toHaveBeenCalledTimes(1);

    // The retry records again but never uploads again.
    recordMediaAsset.mockResolvedValueOnce({ id: 'asset-2' });
    const url = await call(() => cover().ensureUploaded('member-1'));
    expect(url).toMatch(/^https:\/\//);
    expect(uploadMedia).toHaveBeenCalledTimes(1);
    expect(recordMediaAsset).toHaveBeenCalledTimes(2);
  });

  it('uploads afresh for a different picture, because the first one was not published', async () => {
    open();
    act(() => cover().choose(picture('first.png')));
    await call(() => cover().ensureUploaded('member-1'));

    act(() => cover().choose(picture('second.png')));
    const url = await call(() => cover().ensureUploaded('member-1'));

    expect(url).not.toBeNull();
    expect(uploadMedia).toHaveBeenCalledTimes(2);
    expect(uploadMedia.mock.calls[1]?.[0]?.name).toBe('second.png');
  });

  it('revokes the object URL it made for a picture that was replaced', async () => {
    open();
    act(() => cover().choose(picture('first.png')));
    await waitFor(() => expect(cover().previewUrl).toMatch(/^blob:mock\//));
    const first = cover().previewUrl;

    act(() => cover().choose(picture('second.png')));
    await waitFor(() => expect(revokedUrls).toContain(first));
  });

  it('clears everything on reset, so the next listing starts with no cover', async () => {
    open();
    act(() => cover().choose(picture()));
    await call(() => cover().ensureUploaded('member-1'));

    act(() => cover().reset());

    expect(cover().file).toBeNull();
    expect(cover().previewUrl).toBe('');
    expect(cover().progress).toBeNull();
    // A published project and a second one started in the same visit must not
    // share a cover: the prepared upload is gone with the picture it was for.
    act(() => cover().choose(picture('another.png')));
    await call(() => cover().ensureUploaded('member-1'));
    expect(uploadMedia).toHaveBeenCalledTimes(2);
  });

  it('reports progress while bytes move and is idle again afterwards', async () => {
    uploadMedia.mockImplementationOnce((_file, options) => {
      options.onProgress?.(42);
      return Promise.resolve(result('https://res.cloudinary.com/bsdc/image/upload/cover.png'));
    });
    open();
    act(() => cover().choose(picture()));

    await call(() => cover().ensureUploaded('member-1'));

    expect(cover().progress).toBeNull();
  });
});
