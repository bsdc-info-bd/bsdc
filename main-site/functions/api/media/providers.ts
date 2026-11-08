/**
 * Cloudflare Pages Function — GET /api/media/providers
 *
 * Reports whether this deployment's edge ImgBB upload key is configured,
 * returning booleans only and never exposing any secret credential.
 */
import { availabilityOf, type MediaEnv } from '../../_media';

export const onRequestGet: PagesFunction<MediaEnv> = async (context) => {
  const available = availabilityOf(context.env);

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
      },
    },
  );
};
