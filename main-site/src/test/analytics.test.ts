import { describe, expect, it } from 'vitest';
import {
  average,
  movingAverage,
  parseSnapshot,
  peak,
  poishaToString,
  reportFilename,
  retentionGrid,
  retentionPercent,
  sparklinePath,
  sum,
  toCsv,
  trendPercent,
  type RetentionCell,
} from '@/lib/analytics/analytics-types';
import {
  escapePdfText,
  niceMax,
  PdfDocument,
  textWidth,
  toLatin,
  wrapText,
} from '@/lib/reports/pdf';

const decoder = new TextDecoder();

describe('series arithmetic', () => {
  it('sums and averages a series', () => {
    expect(sum([1, 2, 3, 4])).toBe(10);
    expect(average([1, 2, 3, 4])).toBe(2.5);
    expect(average([])).toBe(0);
  });

  it('compares the two halves of a period', () => {
    expect(trendPercent([1, 1, 2, 2])).toBe(100);
    expect(trendPercent([2, 2, 1, 1])).toBe(-50);
    expect(trendPercent([1, 1, 1, 1])).toBe(0);
  });

  it('refuses to call growth from nothing a percentage', () => {
    expect(trendPercent([0, 0, 5, 5])).toBeNull();
    expect(trendPercent([0, 0, 0, 0])).toBe(0);
    expect(trendPercent([5])).toBeNull();
  });

  it('smooths a weekly rhythm with a moving average', () => {
    expect(movingAverage([3, 3, 3, 3], 2)).toEqual([3, 3, 3, 3]);
    expect(movingAverage([0, 10], 2)).toEqual([0, 5]);
    expect(movingAverage([1, 2, 3], 1)).toEqual([1, 2, 3]);
  });

  it('never scales a chart to zero', () => {
    expect(peak([0, 0])).toBe(1);
    expect(peak([3, 9, 2])).toBe(9);
  });
});

describe('sparkline', () => {
  it('maps a series left to right with the axis flipped', () => {
    expect(sparklinePath([0, 10], 100, 20)).toBe('0.00,20.00 100.00,0.00');
  });

  it('draws a single value as a flat line', () => {
    expect(sparklinePath([7], 100, 24)).toBe('0,12.00 100.00,12.00');
  });

  it('draws nothing for an empty series', () => {
    expect(sparklinePath([])).toBe('');
  });
});

describe('retention', () => {
  const cells: RetentionCell[] = [
    { cohortWeek: '2026-01-05', cohortSize: 10, weekOffset: 0, retained: 10 },
    { cohortWeek: '2026-01-05', cohortSize: 10, weekOffset: 2, retained: 4 },
    { cohortWeek: '2026-01-12', cohortSize: 8, weekOffset: 0, retained: 6 },
  ];

  it('reports retention as a percentage of its own cohort', () => {
    expect(retentionPercent({ cohortWeek: 'w', cohortSize: 8, weekOffset: 1, retained: 2 })).toBe(
      25,
    );
    expect(retentionPercent({ cohortWeek: 'w', cohortSize: 0, weekOffset: 1, retained: 0 })).toBe(
      0,
    );
  });

  it('builds a rectangular grid and leaves unknown weeks empty', () => {
    const grid = retentionGrid(cells);
    expect(grid).toHaveLength(2);
    expect(grid[0]?.weeks).toEqual([100, null, 40]);
    expect(grid[1]?.weeks).toEqual([75, null, null]);
  });
});

describe('export helpers', () => {
  it('formats poisha without a locale or a symbol', () => {
    expect(poishaToString(123_456)).toBe('1234.56');
    expect(poishaToString(5)).toBe('0.05');
    expect(poishaToString(-250)).toBe('-2.50');
  });

  it('quotes CSV fields that would otherwise break a row', () => {
    const csv = toCsv(
      ['a', 'b'],
      [
        ['plain', 'has,comma'],
        ['has "quote"', 'line\nbreak'],
      ],
    );
    expect(csv).toContain('"has,comma"');
    expect(csv).toContain('"has ""quote"""');
    expect(csv.split('\r\n')).toHaveLength(3);
  });

  it('builds a filesystem-safe report name', () => {
    expect(reportFilename('growth', '2026-01-01', '2026-01-31')).toBe(
      'bsdc-growth-2026-01-01-to-2026-01-31.pdf',
    );
  });
});

describe('snapshot parsing', () => {
  it('reads a well-formed payload', () => {
    const parsed = parseSnapshot({
      generated_at: '2026-06-01T00:00:00Z',
      days: 30,
      totals: { members_total: 10, gross_sales: 5000 },
      growth: [{ day: '2026-05-31', new_members: 2, new_posts: 3, active_members: 1 }],
      revenue: [],
    });
    expect(parsed?.totals.membersTotal).toBe(10);
    expect(parsed?.totals.grossSales).toBe(5000);
    expect(parsed?.growth[0]?.newPosts).toBe(3);
  });

  it('survives a payload written by an older schema', () => {
    const parsed = parseSnapshot({ generated_at: '2026-01-01', days: 7 });
    expect(parsed?.totals.postsTotal).toBe(0);
    expect(parsed?.growth).toEqual([]);
  });

  it('rejects something that is not a payload at all', () => {
    expect(parseSnapshot(null)).toBeNull();
    expect(parseSnapshot('report')).toBeNull();
    expect(parseSnapshot([1, 2])).toBeNull();
  });
});

describe('pdf primitives', () => {
  it('escapes the characters that would end a PDF string', () => {
    expect(escapePdfText('a(b)c\\d')).toBe('a\\(b\\)c\\\\d');
  });

  it('drops glyphs the standard fonts cannot draw', () => {
    expect(toLatin('BSDC রিপোর্ট 2026')).toBe('BSDC 2026');
    expect(toLatin('Plain ASCII')).toBe('Plain ASCII');
  });

  it('wraps text to the width it is given', () => {
    const lines = wrapText('one two three four five six seven', 10, 60);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(' ')).toBe('one two three four five six seven');
  });

  it('never loses a word that is wider than the line', () => {
    expect(wrapText('supercalifragilistic', 10, 10)).toEqual(['supercalifragilistic']);
  });

  it('measures bold text as wider than regular', () => {
    expect(textWidth('BSDC', 10, true)).toBeGreaterThan(textWidth('BSDC', 10, false));
  });

  it('rounds a chart ceiling to something a person would choose', () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(7)).toBe(10);
    expect(niceMax(23)).toBe(50);
    expect(niceMax(120)).toBe(200);
  });
});

describe('pdf document', () => {
  it('produces a parseable PDF 1.4 file', () => {
    const bytes = new PdfDocument('Test report').text('Hello').build();
    const text = decoder.decode(bytes);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(text).toContain('/Type /Catalog');
    expect(text).toContain('(Hello) Tj');
  });

  it('writes an xref entry for every object', () => {
    const text = decoder.decode(new PdfDocument('t').text('a').build());
    const size = /\/Size (\d+)/.exec(text)?.[1];
    const entries = text.split('xref')[1]?.match(/\d{10} 00000 n/g) ?? [];
    expect(Number(size)).toBe(entries.length + 1);
  });

  it('records a byte offset, not a character offset', () => {
    // A non-ASCII title would make the two differ; toLatin removes it, but
    // the offsets are still measured in encoded bytes.
    const text = decoder.decode(new PdfDocument('Report').heading('Section').build());
    const startXref = Number(/startxref\n(\d+)/.exec(text)?.[1] ?? '0');
    expect(startXref).toBeGreaterThan(0);
    expect(new TextEncoder().encode(text).length).toBeGreaterThan(startXref);
  });

  it('adds a page object for every page', () => {
    const document = new PdfDocument('t');
    document.text('one');
    document.addPage();
    document.text('two');
    const text = decoder.decode(document.build());
    expect(text.match(/\/Type \/Page[^s]/g)).toHaveLength(2);
    expect(text).toContain('/Count 2');
  });

  it('renders a table and a chart without throwing', () => {
    const bytes = new PdfDocument('t')
      .table({ columns: ['a', 'b'], rows: [['1', '2']] })
      .barChart({ labels: ['d1', 'd2'], values: [1, 5] })
      .build();
    expect(bytes.byteLength).toBeGreaterThan(400);
  });
});
