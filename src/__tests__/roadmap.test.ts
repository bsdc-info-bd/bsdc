import { describe, expect, it } from 'vitest';
import { localized, PHASES } from '@/lib/roadmap';

describe('roadmap', () => {
  it('defines all ten phases 0-9', () => {
    expect(PHASES.map((p) => p.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('marks only Phase 0 as shipped (no fabricated completion)', () => {
    const shipped = PHASES.filter((p) => p.status === 'shipped');
    expect(shipped.map((p) => p.id)).toEqual([0]);
  });

  it('carries non-empty Bangla and English names and summaries', () => {
    for (const phase of PHASES) {
      expect(localized(phase.name, 'en').length).toBeGreaterThan(0);
      expect(localized(phase.name, 'bn').length).toBeGreaterThan(0);
      expect(localized(phase.summary, 'en').length).toBeGreaterThan(0);
      expect(localized(phase.summary, 'bn').length).toBeGreaterThan(0);
    }
  });
});
