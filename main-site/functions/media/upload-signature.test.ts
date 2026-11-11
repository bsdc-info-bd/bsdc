import { describe, expect, it } from 'vitest';
import { rejectBytes } from '../_media';

/**
 * The upload endpoint trusts neither the browser nor the content type.
 *
 * `reject()` checks what the file says it is; this checks what it is. Both run
 * before a byte leaves the edge, and the same signature list guards the read
 * path (`/media/i`) and the service worker's cache, so a body cannot be a picture
 * in one place and not in another.
 */

const REFUSED = { errorKey: 'media.errors.unsupported', status: 415 };

function bytesOf(value: number[] | string): Uint8Array {
  return typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);
}

describe('the bytes a file actually carries', () => {
  it('accepts a real JPEG, PNG, GIF, WebP, AVIF, and SVG with an XML prolog', () => {
    expect(rejectBytes(bytesOf([0xff, 0xd8, 0xff, 0xe0]))).toBeNull();
    expect(rejectBytes(bytesOf([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toBeNull();
    expect(rejectBytes(bytesOf('GIF89a......'))).toBeNull();
    expect(rejectBytes(bytesOf('RIFF....WEBP'))).toBeNull();
    expect(rejectBytes(bytesOf('\u0000\u0000\u0000\u001cftypavif'))).toBeNull();
    expect(
      rejectBytes(
        bytesOf(
          '<?xml version="1.0" encoding="UTF-8" standalone="no"?><!-- long comment header --><svg xmlns="http://www.w3.org/2000/svg"></svg>',
        ),
      ),
    ).toBeNull();
  });

  it('refuses an HTML page wearing an image content type', () => {
    expect(rejectBytes(bytesOf('<!doctype html><html>not a picture</html>'))).toEqual(REFUSED);
  });

  it('refuses a zip, a script and an empty body', () => {
    expect(rejectBytes(bytesOf('PK\u0003\u0004rest of a zip'))).toEqual(REFUSED);
    expect(rejectBytes(bytesOf('#!/bin/sh\nrm -rf /'))).toEqual(REFUSED);
    expect(rejectBytes(bytesOf([]))).toEqual(REFUSED);
  });
});
