import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MediaError,
  planUpload,
  probeUploadCapabilities,
  setUploadCapabilities,
  uploadMedia,
  type UploadCapabilities,
} from './upload';

const getIdToken = vi.fn(() => Promise.resolve('member-id-token'));

vi.mock('@/lib/firebase', () => ({
  getFirebaseAuth: () => ({ currentUser: { getIdToken: () => getIdToken() } }),
}));

const PROXY = '/api/media/upload';
const IMGBB = 'https://api.imgbb.com/1/upload';

interface Sent {
  url: string;
  headers: Record<string, string>;
  body: XMLHttpRequestBodyInit | null;
}

const sent: Sent[] = [];

let answers: { match: string; status: number; body: unknown }[] = [];

class FakeXMLHttpRequest {
  upload: { onprogress: ((event: ProgressEvent<EventTarget>) => void) | null } = {
    onprogress: null,
  };
  responseType = '';
  response: unknown = null;
  status = 0;
  timeout = 0;
  onabort: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onload: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  private record: Sent = { url: '', headers: {}, body: null };

  open(_method: string, url: string) {
    this.record.url = url;
  }

  setRequestHeader(name: string, value: string) {
    this.record.headers[name.toLowerCase()] = value;
  }

  send(body: XMLHttpRequestBodyInit | null) {
    this.record.body = body;
    sent.push(this.record);
    const answer = answers.find((candidate) => this.record.url.includes(candidate.match));
    this.status = answer?.status ?? 200;
    this.response = answer?.body ?? null;
    queueMicrotask(() => this.onload?.());
  }

  abort() {
    this.onabort?.();
  }
}

const PROXY_OK = {
  ok: true,
  provider: 'imgbb',
  kind: 'image',
  url: 'https://i.ibb.co/edge/picture.webp',
  thumbUrl: 'https://i.ibb.co/edge/medium.webp',
  deleteToken: '',
  width: 4,
  height: 3,
  bytes: 4,
  mimeType: 'image/webp',
};

const IMGBB_OK = {
  data: {
    url: 'https://i.ibb.co/bundle/picture.png',
    display_url: 'https://i.ibb.co/bundle/picture.png',
    thumb: { url: 'https://i.ibb.co/bundle/thumb.png' },
    width: '4',
    height: '3',
    size: '4',
  },
};

const EDGE_UP: UploadCapabilities = {
  proxy: true,
  proxyImgbb: true,
};

const EDGE_DOWN: UploadCapabilities = {
  proxy: false,
  proxyImgbb: false,
};

function picture(): File {
  return new File([new Uint8Array([0, 1, 2, 255])], 'post.png', { type: 'image/png' });
}

beforeEach(() => {
  sent.length = 0;
  answers = [];
  getIdToken.mockClear();
  vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest as unknown as typeof XMLHttpRequest);
  setUploadCapabilities(EDGE_UP);
});

describe('choosing a transport', () => {
  it('routes every image purpose through the edge to ImgBB when configured', () => {
    for (const purpose of [
      'avatar',
      'cover',
      'project-cover',
      'project-image',
      'post-image',
      'comment-image',
      'product-image',
    ] as const) {
      expect(planUpload(purpose, 'image', EDGE_UP)).toEqual({
        route: 'proxy',
        provider: 'imgbb',
      });
    }
  });

  it('returns null when the edge endpoint or ImgBB key is unavailable', () => {
    expect(planUpload('post-image', 'image', EDGE_DOWN)).toBeNull();
    expect(planUpload('project-cover', 'image', { proxy: true, proxyImgbb: false })).toBeNull();
  });
});

describe('uploading through the edge', () => {
  it('sends the member token and purpose to /api/media/upload without exposing a host key', async () => {
    answers = [{ match: PROXY, status: 200, body: PROXY_OK }];
    const result = await uploadMedia(picture(), { purpose: 'post-image' });

    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe(PROXY);
    expect(sent[0]?.headers['authorization']).toBe('Bearer member-id-token');
    const body = sent[0]?.body as FormData;
    expect(body.get('purpose')).toBe('post-image');
    expect(body.get('file')).toBeInstanceOf(File);
    expect(sent[0]?.url).not.toContain('bundle-imgbb-key');
    expect(result).toMatchObject({ provider: 'imgbb', url: PROXY_OK.url, width: 4, height: 3 });
  });

  it('never contacts api.imgbb.com directly from the browser', async () => {
    answers = [{ match: PROXY, status: 200, body: PROXY_OK }];
    await uploadMedia(picture(), { purpose: 'post-image' });
    expect(sent.some((request) => request.url.includes('api.imgbb.com'))).toBe(false);
  });

  it('refuses an anonymous upload before sending any bytes', async () => {
    getIdToken.mockResolvedValueOnce('');
    await expect(uploadMedia(picture(), { purpose: 'post-image' })).rejects.toMatchObject({
      messageKey: 'media.errors.signInRequired',
    });
    expect(sent).toHaveLength(0);
  });

  it('surfaces the edge error and does not upload the file twice', async () => {
    answers = [
      { match: PROXY, status: 413, body: { ok: false, errorKey: 'media.errors.tooLarge' } },
      { match: IMGBB, status: 200, body: IMGBB_OK },
    ];

    const error = await uploadMedia(picture(), { purpose: 'post-image' }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(MediaError);
    expect((error as MediaError).messageKey).toBe('media.errors.tooLarge');
    expect(sent).toHaveLength(1);
  });

  it('invalidates cached capabilities and refuses when /api/media/upload returns 404', async () => {
    answers = [
      { match: PROXY, status: 404, body: null },
      { match: IMGBB, status: 200, body: IMGBB_OK },
    ];

    await expect(uploadMedia(picture(), { purpose: 'post-image' })).rejects.toMatchObject({
      messageKey: 'media.errors.notConfigured',
    });
    expect(sent.map((request) => request.url)).toEqual([PROXY]);
  });

  it('treats an application shell HTML answer as a missing endpoint, not as a picture', async () => {
    answers = [
      { match: PROXY, status: 200, body: null },
      { match: IMGBB, status: 200, body: IMGBB_OK },
    ];

    await expect(uploadMedia(picture(), { purpose: 'post-image' })).rejects.toMatchObject({
      messageKey: 'media.errors.notConfigured',
    });
    expect(sent.map((request) => request.url)).toEqual([PROXY]);
  });

  it('gives a readable reason when no transport is configured', async () => {
    setUploadCapabilities(EDGE_DOWN);
    await expect(uploadMedia(picture(), { purpose: 'post-image' })).rejects.toMatchObject({
      messageKey: 'media.errors.notConfigured',
    });
    expect(sent).toHaveLength(0);
  });

  it('rejects non-image files before any network request', async () => {
    const archive = new File([new Uint8Array([1, 2, 3])], 'app.exe', {
      type: 'application/x-msdownload',
    });
    await expect(uploadMedia(archive, { purpose: 'post-image' })).rejects.toMatchObject({
      messageKey: 'media.errors.unsupported',
    });
    expect(sent).toHaveLength(0);
  });
});

describe('asking the deployment what it can do', () => {
  it('reports ImgBB when /api/media/providers is live and configured', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ proxy: true, imgbb: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      ),
    );
    await expect(probeUploadCapabilities()).resolves.toEqual({
      proxy: true,
      proxyImgbb: true,
    });
  });

  it('answers "no edge" rather than throwing when the endpoint is absent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('not found', { status: 404 }))),
    );
    const capabilities = await probeUploadCapabilities();
    expect(capabilities).toEqual({ proxy: false, proxyImgbb: false });
  });

  it('answers "no edge" when the endpoint reports proxy: false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ proxy: false, imgbb: false }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      ),
    );
    expect((await probeUploadCapabilities()).proxy).toBe(false);
  });

  it('answers "no edge" when the network fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );
    expect((await probeUploadCapabilities()).proxy).toBe(false);
  });

  it('never mistakes an edge missing IMGBB_API_KEY for a working upload pipeline', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ proxy: true, imgbb: false }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      ),
    );
    const capabilities = await probeUploadCapabilities();
    expect(capabilities).toEqual({
      proxy: true,
      proxyImgbb: false,
    });
    expect(planUpload('project-cover', 'image', capabilities)).toBeNull();
    expect(planUpload('post-image', 'image', capabilities)).toBeNull();
  });
});
