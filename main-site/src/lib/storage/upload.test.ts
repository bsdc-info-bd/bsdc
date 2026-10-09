import { describe, expect, it } from 'vitest';
import {
  assertUploadable,
  chooseProvider,
  extensionFor,
  kindOf,
  MAX_BYTES,
  mediaObjectPath,
  MediaError,
  randomObjectId,
  resolveProvider,
  type ProviderAvailability,
} from './upload';

const NOTHING: ProviderAvailability = { supabase: false, cloudinary: false, imgbb: false };
const ONLY_STORAGE: ProviderAvailability = { supabase: true, cloudinary: false, imgbb: false };
const ONLY_THIRD_PARTIES: ProviderAvailability = {
  supabase: false,
  cloudinary: true,
  imgbb: true,
};

function file(type: string, size: number): File {
  return new File([new Uint8Array(size)], 'sample', { type });
}

describe('file extensions', () => {
  it('names the extension the mime type is stored under', () => {
    expect(extensionFor('image/jpeg')).toBe('jpg');
    expect(extensionFor('image/png')).toBe('png');
    expect(extensionFor('audio/mpeg')).toBe('mp3');
    expect(extensionFor('audio/mp4')).toBe('m4a');
    expect(extensionFor('audio/webm')).toBe('webm');
    expect(extensionFor('application/pdf')).toBe('pdf');
  });

  it('derives one for a type it has never seen, and never returns nothing', () => {
    expect(extensionFor('IMAGE/WEBP')).toBe('webp');
    expect(extensionFor('image/heic')).toBe('heic');
    // A subtype too long to be an extension is not guessed at.
    expect(extensionFor('image/x-photoshop')).toBe('bin');
    expect(extensionFor('nonsense')).toBe('bin');
    expect(extensionFor('')).toBe('bin');
    expect(extensionFor('application/')).toBe('bin');
  });
});

describe('where an object lives', () => {
  const now = new Date('2026-10-08T12:00:00.000Z');

  it('puts the member first, because that is what the storage policy checks', () => {
    const path = mediaObjectPath('uid-1', 'post-image', 'image/jpeg', { now, id: 'abc' });
    expect(path).toBe('uid-1/post-image/202610/abc.jpg');
    expect(path.split('/')[0]).toBe('uid-1');
  });

  it('files by purpose and month', () => {
    expect(mediaObjectPath('u', 'avatar', 'image/png', { now, id: 'x' })).toBe(
      'u/avatar/202610/x.png',
    );
    expect(
      mediaObjectPath('u', 'voice-note', 'audio/webm', {
        now: new Date('2027-01-02T00:00:00.000Z'),
        id: 'x',
      }),
    ).toBe('u/voice-note/202701/x.webm');
  });

  it('pads the month, because a folder named 20271 sorts oddly next to 202710', () => {
    expect(
      mediaObjectPath('u', 'cover', 'image/webp', {
        now: new Date('2027-01-02T00:00:00Z'),
        id: 'x',
      }),
    ).toContain('/202701/');
  });

  it('gives every upload its own id', () => {
    const ids = new Set(Array.from({ length: 200 }, () => randomObjectId()));
    expect(ids.size).toBe(200);
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{20}$/);
      expect(id.includes('/')).toBe(false);
    }
  });
});

describe('which provider carries an upload', () => {
  it('takes the platform own storage whenever it exists', () => {
    expect(resolveProvider('post-image', 'image', ONLY_STORAGE)).toBe('supabase');
    expect(resolveProvider('avatar', 'image', ONLY_STORAGE)).toBe('supabase');
    expect(resolveProvider('voice-note', 'audio', ONLY_STORAGE)).toBe('supabase');
    expect(resolveProvider('chat-document', 'document', ONLY_STORAGE)).toBe('supabase');
    expect(
      resolveProvider('post-image', 'image', { supabase: true, cloudinary: true, imgbb: true }),
    ).toBe('supabase');
  });

  it('keeps the old routing between the two third parties', () => {
    expect(resolveProvider('avatar', 'image', ONLY_THIRD_PARTIES)).toBe('cloudinary');
    expect(resolveProvider('post-image', 'image', ONLY_THIRD_PARTIES)).toBe('imgbb');
    expect(chooseProvider('post-image', 'image')).toBe('imgbb');
    expect(chooseProvider('voice-note', 'audio')).toBe('cloudinary');
  });

  it('puts the picture somewhere rather than nowhere when one host is missing', () => {
    expect(
      resolveProvider('post-image', 'image', { supabase: false, cloudinary: true, imgbb: false }),
    ).toBe('cloudinary');
    expect(
      resolveProvider('avatar', 'image', { supabase: false, cloudinary: false, imgbb: true }),
    ).toBe('imgbb');
    expect(
      resolveProvider('voice-note', 'audio', { supabase: false, cloudinary: false, imgbb: true }),
    ).toBe('imgbb');
  });

  it('says so honestly when a deployment has nowhere to put a byte', () => {
    expect(resolveProvider('post-image', 'image', NOTHING)).toBeNull();
    expect(resolveProvider('avatar', 'image', NOTHING)).toBeNull();
    expect(resolveProvider('chat-document', 'document', NOTHING)).toBeNull();
  });
});

describe('what may be uploaded at all', () => {
  it('classifies by mime type and refuses what it does not know', () => {
    expect(kindOf('image/avif')).toBe('image');
    expect(kindOf('video/mp4')).toBe('video');
    expect(kindOf('application/x-msdownload')).toBeNull();
    expect(() => assertUploadable(file('application/x-msdownload', 10))).toThrow(MediaError);
  });

  it('refuses an empty file and one over the limit for its kind', () => {
    expect(() => assertUploadable(file('image/png', 0))).toThrow(MediaError);
    expect(() => assertUploadable(file('image/png', MAX_BYTES.image + 1))).toThrow(MediaError);
    expect(assertUploadable(file('image/png', MAX_BYTES.image))).toBe('image');
  });
});
