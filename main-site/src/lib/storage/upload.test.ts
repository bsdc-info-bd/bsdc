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
  const BOTH = { cloudinary: true, imgbb: true } as const;

  it('sends ordinary post and comment images to imgbb', () => {
    expect(chooseProvider('post-image', 'image')).toBe('imgbb');
    expect(chooseProvider('comment-image', 'image')).toBe('imgbb');
    expect(chooseProvider('chat-document', 'image')).toBe('imgbb');
    expect(resolveProvider('post-image', 'image', BOTH)).toBe('imgbb');
    expect(resolveProvider('comment-image', 'image', BOTH)).toBe('imgbb');
  });

  it('sends profile, project and product covers to Cloudinary', () => {
    for (const purpose of [
      'avatar',
      'cover',
      'project-cover',
      'project-image',
      'product-image',
    ] as const) {
      expect(chooseProvider(purpose, 'image')).toBe('cloudinary');
      expect(resolveProvider(purpose, 'image', BOTH)).toBe('cloudinary');
    }
  });

  it('never substitutes the other host when the required one is missing', () => {
    expect(resolveProvider('post-image', 'image', { cloudinary: true, imgbb: false })).toBeNull();
    expect(
      resolveProvider('project-cover', 'image', { cloudinary: false, imgbb: true }),
    ).toBeNull();
  });

  it('keeps documents and audio on Cloudinary', () => {
    expect(chooseProvider('chat-document', 'document')).toBe('cloudinary');
    expect(chooseProvider('voice-note', 'audio')).toBe('cloudinary');
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
  it('classifies by mime type and refuses what it does not know', () => {
    expect(kindOf('image/avif')).toBe('image');
    expect(kindOf('video/mp4')).toBeNull();
    expect(kindOf('application/x-msdownload')).toBeNull();
    expect(() => assertUploadable(file('application/x-msdownload', 10))).toThrow(MediaError);
    expect(() => assertUploadable(file('video/mp4', 10))).toThrow(MediaError);
  });

  it('refuses an empty file and one over the limit for its kind', () => {
    expect(() => assertUploadable(file('image/png', 0))).toThrow(MediaError);
    expect(() => assertUploadable(file('image/png', MAX_BYTES.image + 1))).toThrow(MediaError);
    expect(assertUploadable(file('image/png', MAX_BYTES.image))).toBe('image');
  });
});
