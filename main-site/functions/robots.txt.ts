/**
 * Cloudflare Pages Function — /robots.txt
 *
 * Served dynamically so the admin SEO centre can adjust rules without a
 * redeploy. Falls back to the static public/robots.txt if this function is
 * removed. No standalone Workers are used anywhere in BSDC.
 */
interface Env {
  SITE_URL?: string;
}

const DISALLOWED = [
  '/messages',
  '/settings',
  '/notifications',
  '/bookmarks',
  '/history',
  '/vendor',
  '/api/',
  '/auth/',
];

export const onRequestGet: PagesFunction<Env> = (context) => {
  const siteUrl = context.env.SITE_URL ?? 'https://www.bsdc.info.bd';
  const body = [
    '# Bangladesh Software Development Community',
    `# ${siteUrl}`,
    '',
    'User-agent: *',
    'Allow: /',
    '',
    ...DISALLOWED.map((path) => `Disallow: ${path}`),
    '',
    `Sitemap: ${siteUrl}/sitemap.xml`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
};
