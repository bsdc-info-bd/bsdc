import { describe, expect, it } from 'vitest';
import { cardCheckDigit, isValidDocCode } from '@kit';
import {
  EMPTY_DRAFT,
  ackProgress,
  audienceLabel,
  draftProblems,
  draftToRow,
  liveState,
  liveStateTone,
  noticeFilename,
  paragraphs,
  rowToDraft,
  scheduleSummary,
  sortNotices,
  type NoticeRow,
} from './model';
import { buildNoticePdf, printFromRow } from './notice-pdf';

const code = `BSDC-NT-91B2C3D4-${cardCheckDigit('91B2C3D4')}`;

const row = (over: Partial<NoticeRow> = {}): NoticeRow => ({
  id: 'n1',
  code,
  title: 'Office closed for Eid',
  summary: 'The office is closed from the 20th to the 23rd.',
  body: 'The office will be closed for Eid.\n\nUrgent matters go to the on-call rota.',
  category: 'general',
  audience: 'public',
  priority: 'routine',
  status: 'published',
  pinned: false,
  requires_ack: false,
  publish_at: '2026-03-01T09:00:00Z',
  expires_at: null,
  updated_at: '2026-03-01T09:00:00Z',
  acknowledgements: 0,
  staff_total: 20,
  ...over,
});

const now = new Date('2026-03-10T00:00:00Z');

describe('the notice code', () => {
  it('is a valid ecosystem code, so the public desk can check it', () => {
    expect(isValidDocCode(code)).toBe(true);
  });
});

describe('drafting a notice', () => {
  const draft = {
    ...EMPTY_DRAFT,
    title: 'Office closed for Eid',
    summary: 'Closed from the 20th.',
    body: 'The office will be closed for Eid. Urgent matters go to the on-call rota.',
  };

  it('is happy with a complete draft', () => {
    expect(draftProblems(draft)).toEqual([]);
  });

  it('insists on a summary, because that is what a list shows', () => {
    expect(draftProblems({ ...draft, summary: '  ' })).toContain(
      'Write a one-line summary: it is what a reader sees in a list.',
    );
  });

  it('refuses to ask anonymous readers to acknowledge anything', () => {
    expect(draftProblems({ ...draft, requiresAck: true, audience: 'public' })).toContain(
      'A public notice cannot require an acknowledgement, because readers are anonymous.',
    );
    expect(draftProblems({ ...draft, requiresAck: true, audience: 'staff' })).toEqual([]);
  });

  it('refuses an expiry that is not a time', () => {
    expect(draftProblems({ ...draft, expiresAt: 'soon' })).toContain(
      'The expiry must be a date and time.',
    );
  });

  it('normalises the category and sends an absent expiry as null', () => {
    const mapped = draftToRow({ ...draft, category: '  HR  ' });
    expect(mapped['category']).toBe('hr');
    expect(mapped['expires_at']).toBeNull();
  });

  it('defaults an empty category rather than writing an empty string', () => {
    expect(draftToRow({ ...draft, category: '' })['category']).toBe('general');
  });

  it('round-trips a row back into the form', () => {
    const loaded = rowToDraft(row({ expires_at: '2026-04-01T10:00:00Z' }));
    expect(loaded.title).toBe('Office closed for Eid');
    expect(loaded.expiresAt).toBe('2026-04-01T10:00');
  });

  it('explains each audience in words rather than in jargon', () => {
    expect(audienceLabel('public')).toContain('not signed in');
    expect(audienceLabel('staff')).toBe('Staff only');
  });
});

describe('where a notice actually stands', () => {
  it('separates published from visible', () => {
    expect(liveState(row(), now)).toBe('live');
    expect(liveState(row({ publish_at: '2026-03-20T09:00:00Z' }), now)).toBe('scheduled');
  });

  it('treats a closed window as expired, not as live', () => {
    expect(liveState(row({ expires_at: '2026-03-05T00:00:00Z' }), now)).toBe('expired');
    expect(liveState(row({ expires_at: '2026-03-20T00:00:00Z' }), now)).toBe('live');
  });

  it('keeps drafts and archives out of the live states', () => {
    expect(liveState(row({ status: 'draft', publish_at: null }), now)).toBe('draft');
    expect(liveState(row({ status: 'archived' }), now)).toBe('archived');
    expect(liveState(row({ status: 'published', publish_at: null }), now)).toBe('draft');
  });

  it('colours the states the way the legend promises', () => {
    expect(liveStateTone('live')).toBe('ok');
    expect(liveStateTone('scheduled')).toBe('warn');
    expect(liveStateTone('expired')).toBe('neutral');
  });

  it('describes the schedule in a sentence', () => {
    expect(scheduleSummary(row({ status: 'draft', publish_at: null }), now)).toContain(
      'Only editors',
    );
    expect(scheduleSummary(row({ publish_at: '2026-03-20T09:00:00Z' }), now)).toContain(
      'visible from',
    );
    expect(scheduleSummary(row({ expires_at: '2026-03-05T00:00:00Z' }), now)).toContain(
      'window has closed',
    );
  });
});

describe('acknowledgements', () => {
  it('says nothing was asked for when nothing was', () => {
    expect(ackProgress(row())).toEqual({ percent: 0, label: 'No acknowledgement asked for' });
  });

  it('counts against the active staff headcount', () => {
    expect(ackProgress(row({ requires_ack: true, acknowledgements: 5, staff_total: 20 }))).toEqual({
      percent: 25,
      label: '5 of 20 acknowledged (25%)',
    });
  });

  it('never reports more than everybody, and copes with no headcount at all', () => {
    expect(
      ackProgress(row({ requires_ack: true, acknowledgements: 25, staff_total: 20 })).percent,
    ).toBe(100);
    expect(
      ackProgress(row({ requires_ack: true, acknowledgements: 3, staff_total: 0 })).label,
    ).toBe('3 acknowledged');
  });
});

describe('ordering the list', () => {
  it('pins first, then live, then scheduled, then drafts', () => {
    const rows = [
      row({ id: 'draft', status: 'draft', publish_at: null }),
      row({ id: 'scheduled', publish_at: '2026-03-20T09:00:00Z' }),
      row({ id: 'live' }),
      row({ id: 'pinned-draft', status: 'draft', publish_at: null, pinned: true }),
    ];
    expect(sortNotices(rows, now).map((item) => item.id)).toEqual([
      'pinned-draft',
      'live',
      'scheduled',
      'draft',
    ]);
  });

  it('breaks a tie with the most recently edited', () => {
    const rows = [
      row({ id: 'older', updated_at: '2026-03-01T00:00:00Z' }),
      row({ id: 'newer', updated_at: '2026-03-09T00:00:00Z' }),
    ];
    expect(sortNotices(rows, now)[0]?.id).toBe('newer');
  });
});

describe('the body', () => {
  it('splits on blank lines and joins wrapped lines back together', () => {
    expect(paragraphs('one line\nstill one\n\nsecond')).toEqual(['one line still one', 'second']);
  });

  it('drops empty blocks rather than printing a gap', () => {
    expect(paragraphs('\n\n  \n\nreal text\n\n')).toEqual(['real text']);
  });
});

describe('the printed notice', () => {
  const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

  it('produces a parseable PDF on A4 portrait', () => {
    const text = decode(buildNoticePdf(printFromRow(row(), 'https://vf.main.bsdc.info.bd')));
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('MediaBox [0 0 595.28 841.89]');
    const size = Number(/\/Size (\d+)/.exec(text)?.[1]);
    const entries = text.split('xref')[1]?.match(/\d{10} \d{5} [nf]/g)?.length ?? 0;
    expect(entries).toBe(size);
  });

  it('prints the notice number and the verification address', () => {
    const text = decode(buildNoticePdf(printFromRow(row(), 'https://vf.main.bsdc.info.bd')));
    expect(text).toContain(code);
    expect(text).toContain('vf.main.bsdc.info.bd');
  });

  it('says plainly when a notice has not been published yet', () => {
    const text = decode(
      buildNoticePdf(
        printFromRow(row({ status: 'draft', publish_at: null }), 'https://vf.main.bsdc.info.bd'),
      ),
    );
    expect(text).toContain('Not yet published');
  });

  it('builds a filename that still means something a year later', () => {
    expect(noticeFilename(code, 'Office closed for Eid')).toBe(`${code}-office-closed-for-eid.pdf`);
    expect(noticeFilename(code, '')).toBe(`${code}.pdf`);
  });
});
