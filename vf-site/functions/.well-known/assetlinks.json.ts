/**
 * Cloudflare Pages Function — GET /.well-known/assetlinks.json (vf-site)
 *
 * Binds `vf.main.bsdc.info.bd` and `vf.bsdc.info.bd` to the native Android app
 * (`bd.info.bsdc.app`) so QR verification links open natively without a WebView.
 */
interface Env {
  readonly ANDROID_CERT_FINGERPRINT?: string;
  readonly ANDROID_APP_ID?: string;
}

const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

export function onRequestGet(context: { readonly env: Env }): Response {
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
      'cache-control': 'public, max-age=3600',
      'access-control-allow-origin': '*',
    },
  });
}
