#!/usr/bin/env node
/**
 * Is the picture pipeline actually working on this deployment?
 *
 * The failure this answers existed for months while every unit test passed,
 * because every unit test ran against a mock and the question — "can this
 * deployment accept a picture, and can it serve one back?" — can only be asked
 * of the deployment.
 *
 * It asks four things, in the order a member would hit them:
 *
 *   1. Does `/api/health` answer, and does it say this deployment holds an
 *      ImgBB key? (`media.upload`)
 *   2. Is `/api/media/upload` *deployed at all*? An anonymous POST must answer
 *      `401` with a JSON body. A `404`, a `200 text/html` or the app shell means
 *      the Pages Functions were not uploaded with the site — which is exactly
 *      the state that produced "uploads are not configured for this deployment"
 *      on a deployment whose key was set.
 *   3. Does `/api/media/providers` agree?
 *   4. Does `/media/i` hand back real picture bytes from ImgBB, and is it
 *      cacheable? (Correct headers are what stop a picture being re-downloaded
 *      on every paint, and what stops a failure being remembered for a week.)
 *
 * Usage:
 *   node scripts/verify-media.mjs                      # production
 *   node scripts/verify-media.mjs https://bsdc.pages.dev
 *   node scripts/verify-media.mjs http://localhost:8788 # wrangler pages dev
 *
 * Exit code: 0 when every check passes, 1 when any of them does not. It is safe
 * to run from CI: it sends no credentials and writes nothing.
 */

const base = (process.argv[2] ?? 'https://www.bsdc.info.bd').replace(/\/+$/, '');

const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function json(path) {
  const response = await fetch(`${base}${path}`, {
    headers: { accept: 'application/json' },
    redirect: 'follow',
  });
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return { status: response.status, body, text, contentType: response.headers.get('content-type') ?? '' };
}

/** The first bytes of a body, for the signature check. */
function signature(bytes) {
  const at = (offset) => bytes[offset] ?? 0;
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'jpeg';
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return 'png';
  if (at(0) === 0x47 && at(1) === 0x49 && at(2) === 0x46) return 'gif';
  if (bytes.length >= 12 && at(0) === 0x52 && at(8) === 0x57 && at(11) === 0x50) return 'webp';
  if (bytes.length >= 12 && at(4) === 0x66 && at(5) === 0x74 && at(6) === 0x79 && at(7) === 0x70) {
    return 'avif';
  }
  return '';
}

async function main() {
  console.log(`Verifying the BSDC picture pipeline against ${base}\n`);

  // 1. Health, and the one boolean that separates "broken" from "unconfigured".
  try {
    const health = await json('/api/health');
    const ok = health.status === 200 && health.body?.status === 'ok';
    record('GET /api/health', ok, ok ? `commit ${health.body?.commit ?? 'unknown'}` : `HTTP ${health.status}`);
    const upload = health.body?.media?.upload;
    record(
      'the edge holds an ImgBB key',
      upload === true,
      upload === true
        ? 'media.upload = true'
        : 'media.upload is false — set IMGBB_API_KEY in Cloudflare Pages → Settings → Environment Variables (Production *and* Preview)',
    );
  } catch (error) {
    record('GET /api/health', false, String(error));
  }

  // 2. The upload endpoint itself. 401 without a token is the *working* answer:
  //    it proves the function was deployed and refused an anonymous caller.
  try {
    const response = await fetch(`${base}/api/media/upload`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    const text = await response.text();
    const isJson = (response.headers.get('content-type') ?? '').includes('application/json');
    let errorKey = '';
    try {
      errorKey = JSON.parse(text)?.errorKey ?? '';
    } catch {
      errorKey = '';
    }
    const deployed = response.status === 401 && isJson && errorKey.length > 0;
    record(
      'POST /api/media/upload is deployed and refuses anonymous callers',
      deployed,
      deployed
        ? `HTTP 401 ${errorKey}`
        : `HTTP ${response.status} ${isJson ? 'json' : (response.headers.get('content-type') ?? 'no content type')} — the Pages Functions are not deployed with this site, so no upload can succeed`,
    );
  } catch (error) {
    record('POST /api/media/upload', false, String(error));
  }

  // 3. The probe the browser reads. Advisory only, but it should agree.
  try {
    const providers = await json('/api/media/providers');
    record(
      'GET /api/media/providers',
      providers.status === 200 && providers.body?.imgbb === true,
      `HTTP ${providers.status} ${JSON.stringify(providers.body)}`,
    );
  } catch (error) {
    record('GET /api/media/providers', false, String(error));
  }

  // 4. Real bytes through the repair endpoint, and the headers that make them fast.
  const sample = 'https://i.ibb.co/6P0b1cS/bsdc-sample.jpg';
  try {
    const response = await fetch(`${base}/media/i?u=${encodeURIComponent(sample)}`, {
      headers: { accept: 'image/avif,image/webp,image/*,*/*;q=0.5' },
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    const format = signature(bytes);
    const type = response.headers.get('content-type') ?? '';
    record(
      'GET /media/i serves a real picture',
      response.status === 200 && format !== '' && type.startsWith('image/'),
      `HTTP ${response.status} ${type} ${format || 'not a picture'} ${bytes.byteLength} bytes`,
    );
    const cache = response.headers.get('cache-control') ?? '';
    record(
      '/media/i marks verified bytes cacheable',
      /max-age=\d{3,}/.test(cache) && !/no-store/.test(cache),
      cache || 'no cache-control — every paint will re-download the picture',
    );

    const refused = await fetch(`${base}/media/i?u=${encodeURIComponent('https://evil.example/a.jpg')}`);
    record(
      '/media/i refuses a host it does not own',
      refused.status >= 400,
      `HTTP ${refused.status}`,
    );
  } catch (error) {
    record('GET /media/i', false, String(error));
  }

  const failed = results.filter((result) => !result.ok);
  console.log(
    `\n${results.length - failed.length}/${results.length} checks passed.` +
      (failed.length === 0
        ? ' The picture pipeline works on this deployment.'
        : ' This deployment cannot serve or accept pictures until the failures above are fixed.'),
  );
  process.exitCode = failed.length === 0 ? 0 : 1;
}

await main();
