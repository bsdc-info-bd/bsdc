/**
 * Cloudflare Pages Function — GET /api/media/providers
 *
 * What this deployment can upload through, asked at runtime rather than
 * compiled in.
 *
 * The browser needs this before it chooses a transport. Without it there are
 * only two bad options: assume the edge works and fail on a static host, or
 * assume it does not and keep the ImgBB key in the public bundle forever. So
 * the endpoint answers three booleans and no secret — never a key, never a
 * preset name, never a cloud name, because a cloud name plus a preset is enough
 * for a stranger to spend this site's upload quota.
 *
 * Anonymous by design. It describes the deployment, not a member, and it is
 * read before an upload begins, which is sometimes before a token exists.
 */
import { availabilityOf, type MediaEnv } from '../../_media';

export const onRequestGet: PagesFunction<MediaEnv> = async (context) => {
  const available = availabilityOf(context.env);

  // "proxy: true" means this endpoint is live and will accept a POST. Whether
  // it can actually carry a given file depends on the two flags beside it, so
  // the browser can still plan a fallback when only one host is configured.
  return new Response(
    JSON.stringify({
      proxy: true,
      imgbb: available.imgbb,
      cloudinary: available.cloudinary,
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        // Short-lived: a key added in Pages should be picked up by an open tab
        // without a reload, but this is not worth a request per upload.
        'cache-control': 'private, max-age=60',
      },
    },
  );
};
