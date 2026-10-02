/**
 * Types for the build script. The script itself is plain JavaScript because
 * it runs with bare node before anything is compiled; this declaration is
 * what lets the test suite hold it to the same assertions as the engine.
 */
export interface PrerenderRoute {
  readonly path: string;
  readonly title: string;
  readonly description: string;
  readonly changefreq: string;
  readonly priority: number;
  readonly heading: string;
  readonly summary: string;
  readonly type: string;
}

export function escapeHtml(value: string): string;
export function escapeXml(value: string): string;
export function absoluteUrl(path: string, origin?: string): string;
export function renderHead(route: PrerenderRoute, origin?: string): string;
export function renderJsonLd(route: PrerenderRoute, origin?: string): string;
export function renderShell(route: PrerenderRoute, routes: readonly PrerenderRoute[]): string;
export function stripTemplateHead(template: string): string;
export function renderPage(
  template: string,
  route: PrerenderRoute,
  routes: readonly PrerenderRoute[],
  origin?: string,
): string;
export function renderSitemap(routes: readonly PrerenderRoute[], origin?: string): string;
export function renderRobots(disallow: readonly string[], origin?: string): string;
