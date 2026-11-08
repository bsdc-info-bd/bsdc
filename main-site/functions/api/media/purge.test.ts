import { describe, expect, it } from 'vitest';

import { deletionRequest } from './purge';

describe('the address a delete is sent to', () => {
  it('is the one ImgBB handed back at upload time', () => {
    const request = deletionRequest({
      provider: 'imgbb',
      delete_token: 'https://i.ibb.co/abc123/delete/xyz789',
    });
    expect(request).toEqual({ url: 'https://i.ibb.co/abc123/delete/xyz789', method: 'GET' });
  });

  it('accepts the regional ImgBB mirror host as well', () => {
    const request = deletionRequest({
      provider: 'imgbb',
      delete_token: 'https://i.ibb.co.com/abc123/delete/xyz789',
    });
    expect(request).toEqual({ url: 'https://i.ibb.co.com/abc123/delete/xyz789', method: 'GET' });
  });

  it('is refused when it points anywhere but ImgBB', () => {
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

  it('is nothing for a provider it does not support', () => {
    expect(
      deletionRequest({ provider: 'imgur', delete_token: 'https://api.imgur.com/3/image/abc' }),
    ).toBeNull();
  });
});
