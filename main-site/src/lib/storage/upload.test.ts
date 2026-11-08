import { describe, expect, it } from 'vitest';
import {
  assertUploadable,
  chooseProvider,
  fileToBase64,
  kindOf,
  MAX_BYTES,
  MediaError,
  resolveProvider,
} from './upload';

function file(type: string, size: number): File {
  return new File([new Uint8Array(size)], 'sample', { type });
}

describe('where images go', () => {
  it('routes every image purpose exclusively to ImgBB', () => {
    for (const purpose of [
      'avatar',
      'cover',
      'project-cover',
      'project-image',
      'post-image',
      'comment-image',
      'product-image',
    ] as const) {
      expect(chooseProvider(purpose, 'image')).toBe('imgbb');
      expect(resolveProvider(purpose, 'image', { imgbb: true })).toBe('imgbb');
    }
  });

  it('refuses when ImgBB is not configured', () => {
    expect(resolveProvider('post-image', 'image', { imgbb: false })).toBeNull();
    expect(resolveProvider('project-cover', 'image', { imgbb: false })).toBeNull();
    expect(resolveProvider('avatar', 'image', { imgbb: false })).toBeNull();
  });
});

describe('ImgBB request encoding', () => {
  it('encodes the actual bytes as base64 without a data-url prefix', async () => {
    const image = new File([new Uint8Array([0, 1, 2, 255])], 'pixel.png', {
      type: 'image/png',
    });
    await expect(fileToBase64(image)).resolves.toBe('AAEC/w==');
  });

  it('honours cancellation while preparing a large base64 request', async () => {
    const controller = new AbortController();
    const image = new File([new Uint8Array([1, 2, 3])], 'pixel.png', {
      type: 'image/png',
    });
    const pending = fileToBase64(image, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ messageKey: 'media.errors.cancelled' });
  });
});

describe('what may be uploaded at all', () => {
  it('accepts only image MIME types and rejects documents, audio, video and executables', () => {
    expect(kindOf('image/avif')).toBe('image');
    expect(kindOf('image/webp')).toBe('image');
    expect(kindOf('application/pdf')).toBeNull();
    expect(kindOf('audio/webm')).toBeNull();
    expect(kindOf('video/mp4')).toBeNull();
    expect(kindOf('application/x-msdownload')).toBeNull();
    expect(() => assertUploadable(file('application/pdf', 10))).toThrow(MediaError);
    expect(() => assertUploadable(file('audio/webm', 10))).toThrow(MediaError);
    expect(() => assertUploadable(file('application/x-msdownload', 10))).toThrow(MediaError);
    expect(() => assertUploadable(file('video/mp4', 10))).toThrow(MediaError);
  });

  it('refuses an empty file and one over the limit for its kind', () => {
    expect(() => assertUploadable(file('image/png', 0))).toThrow(MediaError);
    expect(() => assertUploadable(file('image/png', MAX_BYTES.image + 1))).toThrow(MediaError);
    expect(assertUploadable(file('image/png', MAX_BYTES.image))).toBe('image');
  });
});
