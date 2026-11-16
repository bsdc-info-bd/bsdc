import { describe, expect, it } from 'vitest';
import {
  PORTALS,
  accessiblePortals,
  canAccessPortal,
  portalById,
  portalsByCategory,
  resolvePortalHref,
  searchPortals,
} from './portals';

describe('portal federation registry', () => {
  it('registers all 14 web applications cleanly with https prod URLs', () => {
    expect(PORTALS.length).toBe(14);
    const ids = new Set(PORTALS.map((p) => p.id));
    expect(ids.size).toBe(14);
    for (const portal of PORTALS) {
      expect(portal.prodUrl.startsWith('https://')).toBe(true);
      expect(portal.devPort).toBeGreaterThan(5000);
    }
  });

  it('resolves local dev ports, e2b preview hosts, and canonical production URLs', () => {
    const admin = portalById('bsdc-admin')!;
    expect(resolvePortalHref(admin, null)).toBe('https://admin.corporate.main.bsdc.info.bd');
    expect(resolvePortalHref(admin, { protocol: 'http:', hostname: 'localhost' })).toBe(
      'http://localhost:5191',
    );
    expect(resolvePortalHref(admin, { protocol: 'https:', hostname: '5190-abc123.e2b.app' })).toBe(
      'https://5191-abc123.e2b.app',
    );
  });

  it('enforces minimum clearance when filtering portals', () => {
    const modPortals = accessiblePortals('moderator').map((p) => p.id);
    expect(modPortals).toContain('bsdc-cert');
    expect(modPortals).toContain('bsdc-mod');
    expect(modPortals).not.toContain('bsdc-uadmin');
    expect(modPortals).not.toContain('bsdc-admin');

    const anonPortals = accessiblePortals(null).map((p) => p.id);
    expect(anonPortals).toEqual(['bsdc-status', 'bsdc-vf', 'main-site']);

    expect(canAccessPortal(portalById('bsdc-uadmin')!, 'admin')).toBe(true);
    expect(canAccessPortal(portalById('bsdc-uadmin')!, 'manager')).toBe(false);
  });

  it('searches across names, keywords, and categories', () => {
    const certHits = searchPortals('reissue');
    expect(certHits.some((p) => p.id === 'bsdc-cert')).toBe(true);
    const cliHits = searchPortals('terminal');
    expect(cliHits.some((p) => p.id === 'bsdc-admin')).toBe(true);
    const groups = portalsByCategory(PORTALS);
    expect(groups.length).toBeGreaterThanOrEqual(6);
  });
});
