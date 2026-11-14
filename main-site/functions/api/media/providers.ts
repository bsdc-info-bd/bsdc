/**
 * Cloudflare Pages Function — GET /api/media/providers
 *
 * Reports whether this deployment's edge ImgBB upload key is configured,
 * returning booleans only and never exposing any secret credential.
 */
import { availabilityOf, type MediaEnv } from '../../_media';
import { corsHeadersFor } from '../auth/claims-core';

export const onRequestOptions: PagesFunction<MediaEnv> = ({ request }) =>
  new Response(null, { status: 204, headers: corsHeadersFor(request.headers.get('origin')) });

export const onRequestGet: PagesFunction<MediaEnv> = async (context) => {
  const available = availabilityOf(context.env);
  const origin = context.request.headers.get('origin');

  return new Response(
    JSON.stringify({
      proxy: true,
      imgbb: available.imgbb,
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'private, max-age=60',
        ...corsHeadersFor(origin),
      },
    },
  );
};
