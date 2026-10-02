import { describe, expect, it } from 'vitest';
import {
  cardCheckDigit,
  formatCardCode,
  isStaffRole,
  isValidCardCode,
  normaliseCardCode,
  outranks,
  roleRank,
} from '@kit';
import {
  EMPTY_DRAFT,
  cardState,
  draftProblems,
  draftToArgs,
  headcount,
  mayEdit,
  rowToDraft,
  type StaffRow,
} from './model';

const row = (over: Partial<StaffRow> = {}): StaffRow => ({
  uid: 'u1',
  display_name: 'Ayesha Rahman',
  username: 'ayesha',
  role: 'moderator',
  staff_no: 'ENG-014',
  department: 'Engineering',
  designation: 'Reviewer',
  shift: 'general',
  card_code: null,
  joined_at: '2026-01-05',
  is_active: true,
  ...over,
});

/** Builds a code whose check digit is correct by construction. */
const code = (body: string): string => `BSDC-ID-${body}-${cardCheckDigit(body)}`;

describe('card codes', () => {
  it('computes a single decimal check digit, as the database does', () => {
    const digit = cardCheckDigit('4A7C21B9');
    expect(digit).toMatch(/^[0-9]$/);
    expect(cardCheckDigit('4A7C21B9')).toBe(digit);
  });

  it('accepts a correctly formed code', () => {
    expect(isValidCardCode(code('4A7C21B9'))).toBe(true);
  });

  it('rejects a code whose check digit does not match its body', () => {
    const good = code('4A7C21B9');
    const wrong = `${good.slice(0, 17)}${(Number(good.slice(17)) + 1) % 10}`;
    expect(isValidCardCode(wrong)).toBe(false);
  });

  it('notices a transposition, which is what the weighting is for', () => {
    const original = code('12345678');
    const swapped = code('12345678').replace('12345678', '21345678');
    expect(isValidCardCode(original)).toBe(true);
    expect(isValidCardCode(swapped)).toBe(false);
  });

  it('rejects anything that is not shaped like a code', () => {
    expect(isValidCardCode('')).toBe(false);
    expect(isValidCardCode('BSDC-ID-4A7C21B9')).toBe(false);
    expect(isValidCardCode('BSDC-ID-4A7C21B9-X')).toBe(false);
    expect(isValidCardCode('bsdc-4A7C21B9-1')).toBe(false);
  });

  it('repairs the characters people mistype from a printed card', () => {
    const valid = code('4A7C2189');
    const mistyped = valid.replace('4A7C2189', 'OA7C21I9').toLowerCase().replace('bsdc', 'bsdc ');
    expect(normaliseCardCode(mistyped.replace(' ', ''))).toBe(valid);
    expect(isValidCardCode(mistyped.replace(' ', ''))).toBe(true);
  });

  it('spaces a code out for printing without changing it', () => {
    const valid = code('4A7C21B9');
    expect(formatCardCode(valid)).toBe(`BSDC-ID 4A7C21B9 ${valid.slice(17)}`);
    expect(formatCardCode('nonsense')).toBe('NONSENSE');
  });

  it('describes what the directory should say about a card', () => {
    expect(cardState(row())).toBe('none');
    expect(cardState(row({ card_code: code('4A7C21B9') }))).toBe('valid');
    const good = code('4A7C21B9');
    const corrupt = `${good.slice(0, 17)}${(Number(good.slice(17)) + 1) % 10}`;
    expect(cardState(row({ card_code: corrupt }))).toBe('corrupt');
  });
});

describe('who may edit a record', () => {
  it('ranks roles the way the database does', () => {
    expect(roleRank('owner')).toBeGreaterThan(roleRank('admin'));
    expect(roleRank('moderator')).toBeGreaterThan(roleRank('vendor'));
    expect(roleRank('nonsense')).toBe(0);
    expect(outranks('admin', 'moderator')).toBe(true);
    expect(outranks('admin', 'admin')).toBe(false);
  });

  it('knows which roles are staff roles at all', () => {
    expect(isStaffRole('moderator')).toBe(true);
    expect(isStaffRole('creator')).toBe(false);
  });

  it('refuses an edit of somebody who is not outranked', () => {
    expect(mayEdit('admin', row())).toBe(true);
    expect(mayEdit('admin', row({ role: 'admin' }))).toBe(false);
    expect(mayEdit('moderator', row({ role: 'manager' }))).toBe(false);
    expect(mayEdit('owner', row({ role: 'member' }))).toBe(false);
  });
});

describe('the record form', () => {
  it('insists on a recognisable staff number', () => {
    const draft = { ...EMPTY_DRAFT, uid: 'u1', staffNo: '14' };
    expect(draftProblems(draft).some((problem) => problem.includes('ENG-014'))).toBe(true);
    expect(draftProblems({ ...draft, staffNo: 'eng-014' })).toEqual([]);
  });

  it('checks the optional fields only when they are filled in', () => {
    const base = { ...EMPTY_DRAFT, uid: 'u1', staffNo: 'ENG-014' };
    expect(draftProblems(base)).toEqual([]);
    expect(draftProblems({ ...base, workEmail: 'not-an-address' })).toHaveLength(1);
    expect(draftProblems({ ...base, cvUrl: 'http://insecure.example' })).toHaveLength(1);
    expect(draftProblems({ ...base, cvUrl: 'https://files.example/cv.pdf' })).toEqual([]);
  });

  it('tidies the draft on its way to the database', () => {
    const args = draftToArgs({
      ...EMPTY_DRAFT,
      uid: ' u1 ',
      staffNo: ' eng-014 ',
      department: ' Engineering ',
      shift: 'night',
    });
    expect(args['p_uid']).toBe('u1');
    expect(args['p_staff_no']).toBe('ENG-014');
    expect(args['p_department']).toBe('Engineering');
    expect(args['p_shift']).toBe('night');
  });

  it('loads an existing row into the form without inventing a shift', () => {
    expect(rowToDraft(row({ shift: 'nonsense' })).shift).toBe('general');
    expect(rowToDraft(row({ shift: 'evening' })).shift).toBe('evening');
  });
});

describe('headcount', () => {
  it('counts only active people and names the unassigned', () => {
    const rows = [
      row({ uid: '1', department: 'Engineering' }),
      row({ uid: '2', department: 'Engineering' }),
      row({ uid: '3', department: '' }),
      row({ uid: '4', department: 'Support', is_active: false }),
    ];
    expect(headcount(rows)).toEqual([
      { department: 'Engineering', count: 2 },
      { department: 'Unassigned', count: 1 },
    ]);
  });
});
