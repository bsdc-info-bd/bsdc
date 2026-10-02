import { rpc, type RpcEnv } from './_rpc';

/**
 * Cloudflare Pages Function — /brand.css
 *
 * The live theme chosen in the branding studio, as custom properties. It is
 * served as an empty stylesheet rather than an error when no theme is set,
 * so the site simply keeps the colours it shipped with.
 */
export const onRequestGet: PagesFunction<RpcEnv> = async (context) => {
  const css = (await rpc<string>(context.env, 'brand_theme_css', {})) ?? '';
  return new Response(typeof css === 'string' ? css : '', {
    headers: {
      'content-type': 'text/css; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
};
