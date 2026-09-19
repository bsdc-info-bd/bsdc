/**
 * BSDC — src/tests/unit/mediaValidate.test.ts
 * Purpose : Proves the upload gate: no video, correct ceilings, correct provider per surface.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : LAW-05 and LAW-07 are enforced here, at the transport boundary, so no surface can
 *   re-enable video or send durable media to the bulk host by simply forgetting a check.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { describe, expect, it } from 'vitest';
import { MEDIA_LIMITS } from '@/core/config/limits';
import {
  IMAGE_MIME_TYPES,
  isVideo,
  planFor,
  validateMedia,
  type MediaCandidate,
} from '@/services/media/validate';

/**
 * Builds a candidate description.
 * @param overrides fields to change
 * @returns a candidate
 */
function candidate(overrides: Partial<MediaCandidate> = {}): MediaCandidate {
  return {
    name: 'photo.png',
    mimeType: 'image/png',
    bytes: 1024,
    width: 800,
    height: 600,
    ...overrides,
  };
}

describe('video prohibition (LAW-07)', () => {
  it('rejects video by mime type', () => {
    expect(isVideo(candidate({ mimeType: 'video/mp4' }))).toBe(true);
    expect(isVideo(candidate({ mimeType: 'video/webm' }))).toBe(true);
  });

  it('rejects video by extension even when the mime type lies', () => {
    expect(isVideo(candidate({ name: 'clip.mov', mimeType: 'application/octet-stream' }))).toBe(
      true,
    );
    expect(isVideo(candidate({ name: 'clip.mkv', mimeType: '' }))).toBe(true);
  });

  it('refuses video on every surface with the video error code', () => {
    for (const context of Object.keys(MEDIA_LIMITS) as (keyof typeof MEDIA_LIMITS)[]) {
      const result = validateMedia(candidate({ name: 'clip.mp4', mimeType: 'video/mp4' }), context);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('BSDC-MEDIA-003');
    }
  });
});

describe('provider routing (LAW-05)', () => {
  it('sends durable surfaces to Cloudinary', () => {
    expect(planFor('avatar').provider).toBe('cloudinary');
    expect(planFor('cover').provider).toBe('cloudinary');
    expect(planFor('productImage').provider).toBe('cloudinary');
    expect(planFor('adCreative').provider).toBe('cloudinary');
  });

  it('sends bulk non-critical surfaces to ImgBB', () => {
    expect(planFor('feedImage').provider).toBe('imgbb');
    expect(planFor('chatImage').provider).toBe('imgbb');
    expect(planFor('storyImage').provider).toBe('imgbb');
  });

  it('never routes ordinary user media to Firebase Storage', () => {
    const routed = Object.keys(MEDIA_LIMITS) as (keyof typeof MEDIA_LIMITS)[];
    for (const context of routed) {
      if (context === 'kycDocument') continue;
      expect(planFor(context).provider).not.toBe('firebase-storage');
    }
  });
});

describe('ceilings', () => {
  it('accepts a file inside every limit', () => {
    const result = validateMedia(candidate(), 'feedImage');
    expect(result.ok).toBe(true);
  });

  it('rejects a file over the byte ceiling', () => {
    const limit = MEDIA_LIMITS.feedImage.maxBytes;
    const result = validateMedia(candidate({ bytes: limit + 1 }), 'feedImage');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('BSDC-MEDIA-005');
  });

  it('rejects an image larger than the dimension ceiling', () => {
    const edge = MEDIA_LIMITS.feedImage.maxEdge;
    const result = validateMedia(candidate({ width: edge + 1, height: 100 }), 'feedImage');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('BSDC-MEDIA-006');
  });

  it('rejects an empty file', () => {
    const result = validateMedia(candidate({ bytes: 0 }), 'feedImage');
    expect(result.ok).toBe(false);
  });

  it('rejects a disallowed mime type', () => {
    const result = validateMedia(candidate({ mimeType: 'application/zip' }), 'feedImage');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('BSDC-MEDIA-007');
  });

  it('accepts a PDF only where documents are allowed', () => {
    const pdf = candidate({
      name: 'paper.pdf',
      mimeType: 'application/pdf',
      width: undefined,
      height: undefined,
    });
    expect(validateMedia(pdf, 'chatPdf').ok).toBe(true);
    expect(validateMedia(pdf, 'feedImage').ok).toBe(false);
  });

  it('accepts every declared image mime type', () => {
    for (const mimeType of IMAGE_MIME_TYPES) {
      expect(validateMedia(candidate({ mimeType }), 'avatar').ok).toBe(true);
    }
  });
});
