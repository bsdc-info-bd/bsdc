import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setUploadCapabilities, uploadMedia } from './upload';

vi.mock('@/lib/env', () => ({
  env: {
    cloudinary: { cloudName: 'bsdctest', unsignedPreset: 'unsigned-test' },
  },
  // Supabase being configured must not change where any file's bytes go.
  isConfigured: { cloudinary: true, supabase: true },
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

  send(body: XMLHttpRequestBodyInit | null) {
    this.record.body = body;
    requests.push(this.record);
    this.status = 200;
    this.response = this.record.url.includes('api.imgbb.com')
      ? {
          data: {
            url: 'https://i.ibb.co/full/picture.png',
            display_url: 'https://i.ibb.co/full/picture.png',
            thumb: { url: 'https://i.ibb.co/thumb/picture.png' },
            width: '4',
            height: '3',
            size: '4',
          },
        }
      : {
          secure_url: 'https://res.cloudinary.com/bsdctest/image/upload/v1/project-cover.png',
          width: 4,
          height: 3,
          bytes: 4,
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
  // Pin the transport. These two cases are about the *direct* path, so the edge
  // endpoint is declared absent rather than left to a probe that would fail for
  // an unrelated reason and pass the test by accident.
  setUploadCapabilities({
    proxy: false,
    proxyImgbb: false,
    proxyCloudinary: false,
    localCloudinary: true,
  });
});

describe('provider transport', () => {
  it('never sends an ordinary picture to ImgBB or Supabase from the bundle', async () => {
    const file = new File([new Uint8Array([0, 1, 2, 255])], 'post.png', {
      type: 'image/png',
    });

    await expect(uploadMedia(file, { purpose: 'post-image' })).rejects.toMatchObject({
      messageKey: 'media.errors.notConfigured',
    });
    // No request left the page: the ImgBB key is not in the bundle, and no
    // storage bucket is an acceptable destination for image bytes.
    expect(requests).toHaveLength(0);
  });

  it('sends a project cover only to the unsigned Cloudinary image endpoint', async () => {
    const file = new File([new Uint8Array([0, 1, 2, 255])], 'cover.png', {
      type: 'image/png',
    });
    const result = await uploadMedia(file, { purpose: 'project-cover' });
    const body = requests[0]?.body as FormData | null;

    expect(requests[0]?.url).toBe('https://api.cloudinary.com/v1_1/bsdctest/image/upload');
    expect(body?.get('upload_preset')).toBe('unsigned-test');
    expect(body?.get('folder')).toBe('bsdc/project-cover');
    expect(body?.get('file')).toBe(file);
    expect(result.provider).toBe('cloudinary');
  });
});
