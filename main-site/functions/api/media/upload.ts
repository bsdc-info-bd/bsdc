import { BodyError, readBody } from '../../_body';
/**
 * Cloudflare Pages Function — POST /api/media/upload
 *
 * Uploads one file on a signed-in member's behalf, to the host that file's
 * purpose requires.
 *
 * Why this exists instead of letting the browser talk to ImgBB directly:
 *
 *   * The ImgBB API key is a secret. Compiled into a public bundle it is
 *     readable by anybody, and anybody can then spend this site's upload quota
 *     and fill its account with whatever they like.
 *   * The direct transport only works when the key was present at *build* time.
 *     A deployment that missed one variable answers "uploads are not
 *     configured", which on a phone looks exactly like nothing happening — the
 *     failure this platform has already had. Keys read here take effect on the
 *     next request, not the next rebuild.
 *   * The caller is identified. A Firebase ID token is verified before anything
 *     is sent anywhere, so every upload is attributable and the `media_assets`
 *     row the browser writes afterwards belongs to a real member.
 *
 * What this endpoint deliberately does not do: it does not write to the
 * database. The member's own client writes `media_assets` with their own token,
 * under the row-level policy that requires `owner_uid` to be them. An edge
 * function holding a write path into that table would be a public endpoint able
 * to insert a row on behalf of a member who never asked for one, and
 * `functions/` is never given the service key.
 *
 * Response shape — the browser's `ProxySuccessBody`/`ProxyErrorBody`:
 *   200 { ok: true, provider, kind, url, thumbUrl, deleteToken, width, height, bytes, mimeType }
 *   4xx/5xx { ok: false, errorKey }   where errorKey is an i18n key
 *
 * A refusal carries an i18n key and never a host's own error text, so the
 * member reads the same sentence they would have read had the browser made the
 * call, and the identity of the service behind this endpoint is not advertised.
 */
import { isMediaPurpose } from '../../../src/lib/storage/media-contract';
import { HostError, reject, rejectBytes, sendToHost, type MediaEnv } from '../../_media';
import { mediaUploaderOf, memberOf, type MemberEnv } from '../../_member-token';
import { corsHeadersFor } from '../auth/claims-core';

interface UploadEnv extends MediaEnv, MemberEnv {}

function json(body: unknown, status: number, origin: string | null = null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...corsHeadersFor(origin),
    },
  });
}

function failure(errorKey: string, status: number, origin: string | null = null): Response {
  return json({ ok: false, errorKey }, status, origin);
}

export const onRequestOptions: PagesFunction<UploadEnv> = ({ request }) =>
  new Response(null, { status: 204, headers: corsHeadersFor(request.headers.get('origin')) });

export const onRequestPost: PagesFunction<UploadEnv> = async (context) => {
  const origin = context.request.headers.get('origin');
  const member = await memberOf(context.request, context.env);
  const caller =
    member !== null
      ? await mediaUploaderOf(context.request, context.env, member)
      : await mediaUploaderOf(context.request, context.env);
  if (caller === null) return failure('media.errors.signInRequired', 401, origin);

  let form: FormData;
  try {
    const bytes = await readBody(context.request, 25 * 1024 * 1024 + 64 * 1024);
    form = await new Response(bytes, {
      headers: { 'content-type': context.request.headers.get('content-type') ?? '' },
    }).formData();
  } catch (error) {
    if (error instanceof BodyError && error.status === 413) {
      return failure('media.errors.tooLarge', 413, origin);
    }
    return failure('media.errors.failed', 400, origin);
  }

  // Read as `unknown` first: Workers' `FormDataEntryValue` is a union whose
  // string half makes a direct `instanceof File` a type error, and the check is
  // exactly the one that must happen — a text field where a file belongs is a
  // request this endpoint cannot carry out.
  const entry: unknown = form.get('file');
  if (!(entry instanceof File)) return failure('media.errors.empty', 400, origin);
  const file = entry;

  const rawPurpose = form.get('purpose');
  const purpose = typeof rawPurpose === 'string' ? rawPurpose.trim() : '';
  if (!isMediaPurpose(purpose)) return failure('media.errors.unsupported', 400, origin);
  if (purpose === 'ad-creative' && !caller.isStaff) {
    return failure('media.errors.signInRequired', 403, origin);
  }
  if (caller.project === 'second' && purpose !== 'ad-creative') {
    return failure('media.errors.signInRequired', 403, origin);
  }

  // Refused before a byte leaves this function: an unsupported type, an empty
  // file, one over the limit for its kind, or a host with no credentials.
  const refused = reject(file, purpose, context.env);
  if (refused !== null) return failure(refused.errorKey, refused.status, origin);

  // And refused on the evidence rather than the label: a declared image type
  // over bytes that are not an image is still not an image. The bytes are read
  // once here and handed on, so the signature check costs no extra copy.
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return failure('media.errors.empty', 400, origin);
  }
  const notAnImage = rejectBytes(bytes);
  if (notAnImage !== null) return failure(notAnImage.errorKey, notAnImage.status, origin);

  try {
    const result = await sendToHost(file, purpose, context.env, bytes);
    return json({ ok: true, ...result }, 200, origin);
  } catch (error) {
    // The host refused or was unreachable. Which host, and what it said, stays
    // here; the member gets a readable reason either way. A refused credential
    // is reported as `notConfigured` rather than as a generic failure, because
    // the two need different things done about them and only one of them is
    // worth asking the member to retry.
    if (error instanceof HostError) return failure(error.errorKey, error.status, origin);
    return failure('media.errors.failed', 502, origin);
  }
};
