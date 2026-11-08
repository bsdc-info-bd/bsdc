import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setUploadCapabilities, uploadMedia } from './upload';

const getIdToken = vi.fn(() => Promise.resolve('member-id-token'));

vi.mock('@/lib/firebase', () => ({
  getFirebaseAuth: () => ({ currentUser: { getIdToken: () => getIdToken() } }),
}));

interface RequestRecord {
  method: string;
  url: string;
  body: XMLHttpRequestBodyInit | null;
}

const requests: RequestRecord[] = [];

class FakeXMLHttpRequest {
  upload: { onprogress: ((event: ProgressEvent<EventTarget>) => void) | null } = {
    onprogress: null,
  };
  responseType = '';
  response: unknown;
  status = 0;
  timeout = 0;
  onabort: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onload: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  private record: RequestRecord = { method: '', url: '', body: null };

  open(method: string, url: string) {
    this.record.method = method;
    this.record.url = url;
  }

  setRequestHeader(_name: string, _value: string) {}

  send(body: XMLHttpRequestBodyInit | null) {
    this.record.body = body;
    requests.push(this.record);
    this.status = 200;
    this.response = {
      ok: true,
      provider: 'imgbb',
      kind: 'image',
      url: 'https://i.ibb.co/full/picture.webp',
      thumbUrl: 'https://i.ibb.co/medium/picture.webp',
      deleteToken: 'https://i.ibb.co/delete/xyz',
      width: 4,
      height: 3,
      bytes: 4,
      mimeType: 'image/webp',
    };
    queueMicrotask(() => this.onload?.());
  }

  abort() {
    this.onabort?.();
  }
}

beforeEach(() => {
  requests.length = 0;
  vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest as unknown as typeof XMLHttpRequest);
});

describe('provider transport', () => {
  it('never sends any image directly to ImgBB or Supabase from the client bundle when the edge is down', async () => {
    setUploadCapabilities({ proxy: false, proxyImgbb: false });
    const file = new File([new Uint8Array([0, 1, 2, 255])], 'post.png', {
      type: 'image/png',
    });

    await expect(uploadMedia(file, { purpose: 'post-image' })).rejects.toMatchObject({
      messageKey: 'media.errors.notConfigured',
    });
    expect(requests).toHaveLength(0);
  });

  it('sends both feed images and project covers exclusively through /api/media/upload to ImgBB', async () => {
    setUploadCapabilities({ proxy: true, proxyImgbb: true });
    const file = new File([new Uint8Array([0, 1, 2, 255])], 'cover.png', {
      type: 'image/png',
    });
    const result = await uploadMedia(file, { purpose: 'project-cover' });
    const body = requests[0]?.body as FormData | null;

    expect(requests.map((request) => request.url)).toEqual(['/api/media/upload']);
    expect(body?.get('purpose')).toBe('project-cover');
    expect((body?.get('file') as File).name).toBe(file.name);
    expect(result.provider).toBe('imgbb');
  });
});
