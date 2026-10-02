/**
 * Cloudflare Pages Function — GET /.well-known/assetlinks.json
 *
 * Android verifies an app link by fetching this file and checking that the
 * certificate the app was signed with is listed here. The fingerprint is
 * read from the environment rather than committed, because a fingerprint
 * baked into the repository is a fingerprint nobody rotates after a key is
 * replaced.
 *
 * With no fingerprint configured the file is still served, as an empty
 * list: an empty statement list means "this site vouches for no app", which
 * is the correct and safe answer before a release is signed. Serving a 404
 * instead would make Android cache the failure.
 */
interface Env {
  readonly ANDROID_CERT_FINGERPRINT?: string;
  readonly ANDROID_APP_ID?: string;
}

const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

export const onRequestGet: PagesFunction<Env> = (context) => {
  const raw = (context.env.ANDROID_CERT_FINGERPRINT ?? '').trim().toUpperCase();
  const packageName = (context.env.ANDROID_APP_ID ?? 'bd.info.bsdc.app').trim();

  const statements = FINGERPRINT.test(raw)
    ? [
        {
          relation: ['delegate_permission/common.handle_all_urls'],
          target: {
            namespace: 'android_app',
            package_name: packageName,
            sha256_cert_fingerprints: [raw],
          },
        },
      ]
    : [];

  return new Response(JSON.stringify(statements, null, 2), {
    headers: {
      'content-type': 'application/json',
      // Android re-checks periodically; an hour is long enough to spare the
      // origin and short enough that a rotated key takes effect the same day.
      'cache-control': 'public, max-age=3600',
      'access-control-allow-origin': '*',
    },
  });
};
