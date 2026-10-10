import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MediaError,
  planUpload,
  probeUploadCapabilities,
  setUploadCapabilities,
  uploadMedia,
  type UploadCapabilities,
} from './upload';

vi.mock('@/lib/env', () => ({
  env: {
    cloudinary: { cloudName: 'bsdctest', unsignedPreset: 'unsigned-test' },
    imgbbApiKey: 'bundle-imgbb-key',
  },
  isConfigured: { cloudinary: true, imgbb: true, supabase: true },
}));

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

/**
 * One scripted answer per URL substring, so a case can say "the endpoint is not
 * deployed" (404) separately from "the host refused the picture" (ok:false) —
 * the two must behave differently and a single canned 200 cannot prove that.
 */
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
  url: 'https://i.ibb.co/edge/picture.png',
  thumbUrl: 'https://i.ibb.co/edge/thumb.png',
  deleteToken: '',
  width: 4,
  height: 3,
  bytes: 4,
  mimeType: 'image/png',
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
  proxyCloudinary: true,
  localImgbb: true,
  localCloudinary: true,
};

const EDGE_ONLY: UploadCapabilities = {
  proxy: true,
  proxyImgbb: true,
  proxyCloudinary: true,
  localImgbb: false,
  localCloudinary: false,
};

const EDGE_DOWN: UploadCapabilities = {
  proxy: false,
  proxyImgbb: false,
  proxyCloudinary: false,
  localImgbb: true,
  localCloudinary: true,
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
  it('prefers the edge whenever the edge can carry that provider', () => {
    expect(planUpload('post-image', 'image', EDGE_UP)).toEqual({
      route: 'proxy',
      provider: 'imgbb',
    });
    expect(planUpload('project-cover', 'image', EDGE_UP)).toEqual({
      route: 'proxy',
      provider: 'cloudinary',
    });
    expect(planUpload('voice-note', 'audio', EDGE_UP)).toEqual({
      route: 'proxy',
      provider: 'cloudinary',
    });
  });

  it('uses the bundle\u2019s keys when there is no edge endpoint', () => {
    expect(planUpload('post-image', 'image', EDGE_DOWN)).toEqual({
      route: 'direct',
      provider: 'imgbb',
    });
  });

  it('falls back for the one provider the edge is missing, not for both', () => {
    const imgbbOnly = { ...EDGE_UP, proxyCloudinary: false };
    // A cover the edge cannot carry still goes to Cloudinary through the bundle,
    // and never to ImgBB: the routing table does not bend to availability.
    expect(planUpload('project-cover', 'image', imgbbOnly)).toEqual({
      route: 'direct',
      provider: 'cloudinary',
    });
    expect(planUpload('post-image', 'image', imgbbOnly)).toEqual({
      route: 'proxy',
      provider: 'imgbb',
    });
  });

  it('refuses rather than sending a cover to the wrong host', () => {
    const noCloudinaryAnywhere = { ...EDGE_UP, proxyCloudinary: false, localCloudinary: false };
    expect(planUpload('project-cover', 'image', noCloudinaryAnywhere)).toBeNull();
    // The ordinary image is unaffected by Cloudinary being absent.
    expect(planUpload('post-image', 'image', noCloudinaryAnywhere)).toEqual({
      route: 'proxy',
      provider: 'imgbb',
    });
  });

  it('has nowhere to go when no host is configured at all', () => {
    expect(
      planUpload('post-image', 'image', {
        proxy: false,
        proxyImgbb: false,
        proxyCloudinary: false,
        localImgbb: false,
        localCloudinary: false,
      }),
    ).toBeNull();
  });

  it('believes the edge only when the edge says it is configured', () => {
    // A live endpoint holding no ImgBB key must not be trusted with an ImgBB
    // upload just because it answered; the bundle's own key carries it instead.
    expect(planUpload('post-image', 'image', { ...EDGE_UP, proxyImgbb: false })).toEqual({
      route: 'direct',
      provider: 'imgbb',
    });
    // With no key on either side, there is nothing left to fall back to and the
    // caller must be told rather than handed an upload that cannot happen.
    expect(
      planUpload('post-image', 'image', { ...EDGE_ONLY, proxyImgbb: false, localImgbb: false }),
    ).toBeNull();
  });
});

describe('uploading through the edge', () => {
  it('sends the member\u2019s token and the purpose, and never a host key', async () => {
    answers = [{ match: PROXY, status: 200, body: PROXY_OK }];
    const result = await uploadMedia(picture(), { purpose: 'post-image' });

    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe(PROXY);
    expect(sent[0]?.headers['authorization']).toBe('Bearer member-id-token');
    const body = sent[0]?.body as FormData;
    expect(body.get('purpose')).toBe('post-image');
    expect(body.get('file')).toBeInstanceOf(File);
    // The secret never leaves the bundle for the edge, and the edge is never
    // told a key it already holds.
    expect(sent[0]?.url).not.toContain('bundle-imgbb-key');
    expect(result).toMatchObject({ provider: 'imgbb', url: PROXY_OK.url, width: 4, height: 3 });
  });

  it('does not reach for a host directly once the edge has carried the file', async () => {
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

  it('surfaces the edge\u2019s own reason, and does not upload the file twice', async () => {
    answers = [
      { match: PROXY, status: 413, body: { ok: false, errorKey: 'media.errors.tooLarge' } },
      { match: IMGBB, status: 200, body: IMGBB_OK },
    ];

    const error = await uploadMedia(picture(), { purpose: 'post-image' }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(MediaError);
    expect((error as MediaError).messageKey).toBe('media.errors.tooLarge');
    // Exactly one attempt. A refusal from the host is not a reason to spend the
    // member's data sending the same picture somewhere else.
    expect(sent).toHaveLength(1);
  });

  it('falls back to the bundle when the endpoint is not deployed', async () => {
    answers = [
      { match: PROXY, status: 404, body: null },
      { match: IMGBB, status: 200, body: IMGBB_OK },
    ];

    const result = await uploadMedia(picture(), { purpose: 'post-image' });
    expect(sent).toHaveLength(2);
    expect(sent[0]?.url).toBe(PROXY);
    expect(sent[1]?.url).toContain('api.imgbb.com');
    expect(result).toMatchObject({ provider: 'imgbb', url: IMGBB_OK.data.url });
  });

  it('treats an application shell answer as a missing endpoint, not as a picture', async () => {
    // A static host answers an unknown path with index.html: status 200 and a
    // body that is not JSON. Reading that as a success would give the post an
    // image whose src is a web page.
    answers = [
      { match: PROXY, status: 200, body: null },
      { match: IMGBB, status: 200, body: IMGBB_OK },
    ];

    const result = await uploadMedia(picture(), { purpose: 'post-image' });
    expect(result.url).toBe(IMGBB_OK.data.url);
    expect(sent.map((request) => request.url)).toEqual([PROXY, expect.stringContaining(IMGBB)]);
  });

  it('gives a readable reason when no transport is left', async () => {
    setUploadCapabilities({
      proxy: false,
      proxyImgbb: false,
      proxyCloudinary: false,
      localImgbb: false,
      localCloudinary: false,
    });
    await expect(uploadMedia(picture(), { purpose: 'post-image' })).rejects.toMatchObject({
      messageKey: 'media.errors.notConfigured',
    });
    expect(sent).toHaveLength(0);
  });

  it('still rejects a file no host would take, before any request', async () => {
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
  it('reports both hosts when the endpoint is live and configured', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ proxy: true, imgbb: true, cloudinary: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      ),
    );
    await expect(probeUploadCapabilities()).resolves.toMatchObject({
      proxy: true,
      proxyImgbb: true,
      proxyCloudinary: true,
    });
  });

  it('answers "no edge" rather than throwing when the endpoint is absent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('not found', { status: 404 }))),
    );
    const capabilities = await probeUploadCapabilities();
    expect(capabilities.proxy).toBe(false);
    // The bundle's own keys are still reported, so a static host keeps working.
    expect(capabilities.localImgbb).toBe(true);
  });

  it('answers "no edge" when the endpoint will not say it is configured', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ proxy: false, imgbb: false, cloudinary: false }), {
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

  it('never mistakes a half-configured edge for a working one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ proxy: true, imgbb: false, cloudinary: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      ),
    );
    const capabilities = await probeUploadCapabilities();
    expect(capabilities).toMatchObject({
      proxy: true,
      proxyImgbb: false,
      proxyCloudinary: true,
    });
    // A cover can ride the edge; an ordinary image cannot, and must not be
    // planned onto a host that is not there.
    expect(planUpload('project-cover', 'image', capabilities)).toEqual({
      route: 'proxy',
      provider: 'cloudinary',
    });
    expect(planUpload('post-image', 'image', capabilities)).toEqual({
      route: 'direct',
      provider: 'imgbb',
    });
  });
});
