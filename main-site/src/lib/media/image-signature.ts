/**
 * Whether a byte prefix is a picture, decided from the bytes.
 *
 * This file is deliberately free of DOM types. The edge media proxy
 * (`/media/i`) needs the same check as the service worker, and it compiles
 * against `@cloudflare/workers-types` rather than `lib.dom`, so a check that
 * mentions `Response` cannot live here. `cache-policy.ts` re-exports this for
 * the worker; the edge imports it directly.
 *
 * Why it exists at all: a host under load does not answer an image URL with an
 * image. It answers with a 200 and a small HTML page, and the header that says
 * so is the first thing a broken CDN gets wrong. Storing or forwarding that body
 * as the picture is the failure members reported as "the images stopped loading
 * and clearing the cache fixed it".
 */

const SIGNATURES: readonly { offset: number; bytes: readonly number[] }[] = [
  // JPEG: SOI, then the first marker.
  { offset: 0, bytes: [0xff, 0xd8, 0xff] },
  // PNG: the first four bytes of the eight-byte magic.
  { offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47] },
  // GIF87a / GIF89a.
  { offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] },
  // BMP.
  { offset: 0, bytes: [0x42, 0x4d] },
];

/** Whether a byte prefix is a WebP (`RIFF....WEBP`). */
function isWebp(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  return (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

/** Whether a byte prefix is an ISO base-media file (`ftyp` at offset 4): AVIF, HEIF. */
function isIsoMedia(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  return (
    bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70 // ftyp
  );
}

/** Whether a byte prefix is an SVG, which is text and has no binary signature. */
function isSvg(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length, 256);
  let text = '';
  for (let index = 0; index < limit; index += 1) {
    text += String.fromCharCode(bytes[index] as number);
  }
  const withoutBom = text.replace(/^\uFEFF/, '');
  const trimmed = withoutBom.trimStart().toLowerCase();
  if (trimmed.startsWith('<svg')) return true;
  return trimmed.startsWith('<?xml') && withoutBom.toLowerCase().includes('<svg');
}

/** How many leading bytes the check needs to be certain. */
export const IMAGE_SNIFF_BYTES = 64;

/**
 * Whether these bytes are a picture this platform will store or forward.
 *
 * Deliberately conservative: an unrecognised prefix is refused. A false refusal
 * costs one re-download at the next paint; a false acceptance costs a member
 * every paint until they clear their cache.
 */
export function looksLikeImageBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  const head = bytes.subarray(0, IMAGE_SNIFF_BYTES);
  for (const signature of SIGNATURES) {
    let matches = true;
    for (let index = 0; index < signature.bytes.length; index += 1) {
      if (head[signature.offset + index] !== signature.bytes[index]) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }
  return isWebp(head) || isIsoMedia(head) || isSvg(head);
}
