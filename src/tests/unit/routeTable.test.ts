/**
 * BSDC — src/tests/unit/routeTable.test.ts
 * Purpose : Proves the route table is consistent: every live route is translatable, indexable
 *   routes are public, and private routes are kept out of search.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : ADR-005 makes routes data, which is what allows this test to exist at all: the router,
 *   the sitemap builder and the navigation model read the same table, so a mistake here would show
 *   up in three places at once. The rules tested are the ones that leak: an authenticated route that
 *   reaches a crawler, or a live route whose title nobody wrote.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ROUTES, findRouteMeta, indexableRoutes, liveRoutes } from '@/core/config/routes';

const navBn = JSON.parse(readFileSync('public/locales/bn/nav.json', 'utf8')) as Record<
  string,
  string
>;
const navEn = JSON.parse(readFileSync('public/locales/en/nav.json', 'utf8')) as Record<
  string,
  string
>;

describe('the route table', () => {
  it('never repeats a path', () => {
    const paths = ROUTES.map((route) => route.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('gives every live route a nav key that exists in both dictionaries', () => {
    for (const route of liveRoutes()) {
      expect(navBn[route.titleKey], `bn:${route.titleKey}`).toBeTruthy();
      expect(navEn[route.titleKey], `en:${route.titleKey}`).toBeTruthy();
    }
  });

  it('keeps routes that need an account out of the sitemap', () => {
    for (const route of indexableRoutes()) {
      expect(route.requiresAuth ?? false).toBe(false);
    }
    for (const route of ROUTES) {
      if (route.requiresAuth === true) expect(route.noindex).toBe(true);
    }
  });

  it('marks the routes that are genuinely public as indexable', () => {
    for (const path of ['/', '/events', '/jobs', '/projects', '/freelancer', '/leaderboard']) {
      const route = findRouteMeta(path);
      expect(route, path).toBeDefined();
      expect(route?.noindex ?? false, path).toBe(false);
    }
  });

  it('keeps search and moderation away from crawlers', () => {
    expect(findRouteMeta('/search')?.noindex).toBe(true);
    expect(findRouteMeta('/moderation')?.noindex).toBe(true);
  });

  it('leaves planned routes out of navigation until their module lands', () => {
    for (const route of liveRoutes()) {
      expect(route.status).toBe('live');
    }
  });

  it('gives every indexable route a change frequency and a priority', () => {
    for (const route of indexableRoutes()) {
      expect(route.changeFrequency, route.path).toBeDefined();
      expect(route.priority, route.path).toBeGreaterThan(0);
    }
  });
});
