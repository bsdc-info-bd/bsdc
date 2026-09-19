/**
 * BSDC — src/tests/unit/saved.test.ts
 * Purpose : Proves the bookmark model and the settings document it travels with.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The bookmark list is the one place a person's own shortcuts meet five different kinds
 *   of content, so the tests here are about the two things that can quietly go wrong: two rows for
 *   the same thing, and a row that carries more of somebody else's content than the rules allow.
 *   The ceilings asserted below are the ceilings in firestore.rules. They are asserted here as well
 *   because a rule that silently truncates is a rule that loses the end of a title, and the only
 *   way to notice is to check both sides.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { describe, expect, it } from 'vitest';
import {
  SAVED_KIND_LABEL_KEYS,
  SAVED_KINDS,
  isSavedKind,
  newSavedItem,
  savedItemId,
  savedTitle,
} from '@/entities/saved/model';
import { SETTINGS_KINDS } from '@/entities/settings/repository';
import { defaultPreferences, serialisePreferences } from '@/services/notifications/preferences';

/** Ceilings duplicated from firestore.rules. */
const LIMITS = { title: 140, subtitle: 120, entityId: 128, settingsValue: 8000 } as const;

describe('a bookmark id', () => {
  it('is one row per kind and entity, so saving twice cannot disagree with itself', () => {
    expect(savedItemId('post', 'p1')).toBe('post:p1');
    expect(savedItemId('post', 'p1')).toBe(savedItemId('post', 'p1'));
    expect(savedItemId('gig', 'p1')).not.toBe(savedItemId('post', 'p1'));
  });

  it('names every kind it accepts, and refuses everything else', () => {
    expect(SAVED_KINDS.every((kind) => isSavedKind(kind))).toBe(true);
    expect(isSavedKind('post')).toBe(true);
    expect(isSavedKind('story')).toBe(false);
    expect(isSavedKind('')).toBe(false);
  });
});

describe('a bookmark', () => {
  it('stores the title in the language its author wrote it in', () => {
    const item = newSavedItem('u1', {
      kind: 'event',
      entityId: 'e1',
      title: 'বাংলাদেশ ডেভেলপার সম্মেলন',
      titleLang: 'bn',
      href: '/events/e1',
    });
    expect(item.titleLang).toBe('bn');
    expect(item.title).toBe('বাংলাদেশ ডেভেলপার সম্মেলন');
    expect(item.id).toBe('event:e1');
    expect(item.deletedAt).toBeNull();
  });

  it('collapses whitespace and cuts a title to the ceiling the rules enforce', () => {
    expect(savedTitle('  too    many   spaces  ')).toBe('too many spaces');
    const long = 'a'.repeat(LIMITS.title + 50);
    expect(savedTitle(long).length).toBeLessThanOrEqual(LIMITS.title);
    expect(savedTitle(long).endsWith('…')).toBe(true);
  });

  it('never carries more of another member than the rules allow', () => {
    const item = newSavedItem('u1', {
      kind: 'gig',
      entityId: 'g1',
      title: 'x'.repeat(400),
      titleLang: 'en',
      subtitle: 'y'.repeat(400),
      href: '/market?gig=g1',
    });
    expect(item.title.length).toBeLessThanOrEqual(LIMITS.title);
    expect(item.subtitle.length).toBeLessThanOrEqual(LIMITS.subtitle);
    expect(item.entityId.length).toBeLessThanOrEqual(LIMITS.entityId);
    expect(item.href.startsWith('/')).toBe(true);
  });

  it('has a label key for every kind, so the list can name what it is holding', () => {
    for (const kind of SAVED_KINDS) {
      expect(SAVED_KIND_LABEL_KEYS[kind]).toBe(`kind.${kind}`);
    }
  });
});

describe('a settings document', () => {
  it('only ever holds the three kinds the rules accept', () => {
    expect(SETTINGS_KINDS).toEqual(['notifications', 'privacy', 'appearance']);
  });

  it('fits the notification preferences inside the value ceiling', () => {
    const value = JSON.stringify({
      preferences: serialisePreferences(defaultPreferences()),
      quiet: { enabled: true, startHour: 22, endHour: 7 },
    });
    expect(value.length).toBeLessThanOrEqual(LIMITS.settingsValue);
  });
});
