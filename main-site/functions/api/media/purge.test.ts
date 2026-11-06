import { describe, expect, it } from 'vitest';

import { deletionRequest } from './purge';

/**
 * The sweeper is the one place this platform makes an HTTP request to an address
 * that came out of a database column. A `delete_token` is written by the upload
 * path and its column is not readable or writable by any client role, but "the
 * column is protected" is a statement about today's grants — the endpoint has to
 * be safe against the column containing anything at all.
 *
 * So each refusal below is a request that must not leave the edge: a different
 * host, a plaintext scheme, an embedded credential, a port, a value that is not
 * an address, and a provider whose delete API needs a signature this platform
 * does not have.
 */

describe('the address a delete is sent to', () => {
  it('is the one ImgBB handed back at upload time', () => {
    const request = deletionRequest({
      provider: 'imgbb',
      delete_token: 'https://i.ibb.co/abc123/delete/xyz789',
    });
    expect(request).toEqual({ url: 'https://i.ibb.co/abc123/delete/xyz789', method: 'GET' });
  });

  it('is refused when it points anywhere but the provider', () => {
    for (const token of [
      'https://evil.test/delete/xyz',
      'https://i.ibb.co.evil.test/delete/xyz',
      'https://evil-i.ibb.co/delete/xyz',
      'https://googleusercontent.com/delete/xyz',
    ]) {
      expect(deletionRequest({ provider: 'imgbb', delete_token: token })).toBeNull();
    }
  });

  it('is refused in plaintext, with a credential, or with a port', () => {
    for (const token of [
      'http://i.ibb.co/delete/xyz',
      'https://user:pass@i.ibb.co/delete/xyz',
      'https://i.ibb.co:8443/delete/xyz',
      'ftp://i.ibb.co/delete/xyz',
    ]) {
      expect(deletionRequest({ provider: 'imgbb', delete_token: token })).toBeNull();
    }
  });

  it('is refused when the value is not an address at all', () => {
    for (const token of ['', '   ', 'xyz789', '/delete/xyz789', 'javascript:alert(1)']) {
      expect(deletionRequest({ provider: 'imgbb', delete_token: token })).toBeNull();
    }
  });

  it('is nothing for a provider whose delete needs a signature we do not have', () => {
    // Cloudinary deletes are signed with the API secret. The unsigned preset used
    // for uploads cannot produce that signature, and a wrong attempt would target
    // the wrong asset. The platform relies on the preset's own schedule instead,
    // which is why `expiresAt` is null for every Cloudinary upload.
    expect(
      deletionRequest({
        provider: 'cloudinary',
        delete_token: 'delete_token_from_unsigned_upload',
      }),
    ).toBeNull();
  });

  it('is nothing for a provider it has never heard of', () => {
    expect(
      deletionRequest({ provider: 'imgur', delete_token: 'https://api.imgur.com/3/image/abc' }),
    ).toBeNull();
  });
});
