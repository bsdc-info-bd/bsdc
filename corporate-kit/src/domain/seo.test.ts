import { describe, expect, it } from 'vitest';
import {
  BANGLA_WIDTH_FACTOR,
  MAX_CHAIN,
  chainFrom,
  collapseSuggestion,
  describePlan,
  exportRedirects,
  explainLoop,
  parseRedirects,
  planRedirectImport,
  DESCRIPTION_CUT,
  SOCIAL_DESCRIPTION_CUT,
  SOCIAL_TITLE_CUT,
  TITLE_CUT,
  canonicalCollisions,
  coverage,
  cutToWidth,
  displayLength,
  previewOverride,
  type OverrideDraft,
  type RedirectRow,
} from './seo';

function draft(over: Partial<OverrideDraft> = {}): OverrideDraft {
  return {
    path: '/about',
    title: 'About BSDC',
    description: 'Who we are and what we do, in both languages.',
    canonical: '',
    robots: 'index',
    inSitemap: true,
    ...over,
  };
}

describe('displayLength', () => {
  it('leaves a Latin string at its own length, so nothing already correct moves', () => {
    expect(displayLength('hello')).toBe(5);
  });

  it('counts Bangla wider than Latin at the same code point count', () => {
    expect(displayLength('বাংলাদেশ')).toBeGreaterThan(displayLength('abcdefgh'));
  });

  it('returns an integer, because a fractional width is not a thing to compare', () => {
    expect(Number.isInteger(displayLength('বাংলা'))).toBe(true);
  });

  it('is zero for an empty string', () => {
    expect(displayLength('')).toBe(0);
  });
});

describe('cutToWidth', () => {
  it('leaves text that fits alone and says so', () => {
    const result = cutToWidth('Short title', TITLE_CUT);
    expect(result.shown).toBe('Short title');
    expect(result.cut).toBe(false);
    expect(result.hidden).toBe(0);
  });

  it('cuts text that does not fit and counts what was hidden', () => {
    const result = cutToWidth('a'.repeat(70), TITLE_CUT);
    expect(result.cut).toBe(true);
    expect(result.shown.endsWith('…')).toBe(true);
    expect(result.hidden).toBeGreaterThan(0);
  });

  it('never severs a word: everything shown is in the source, in order', () => {
    const source = 'The quick brown fox jumps over the lazy dog and keeps running onward';
    const result = cutToWidth(source, TITLE_CUT);
    const head = result.shown.replace(/…$/, '');
    expect(source.startsWith(head)).toBe(true);
  });

  it('cuts where the source resumes with a space, not mid-word', () => {
    const source = 'The quick brown fox jumps over the lazy dog and keeps running onward';
    const result = cutToWidth(source, TITLE_CUT);
    const head = result.shown.replace(/…$/, '');
    // "keeps" is a whole word that happens to end where the budget ran out, so
    // the source continues with a space. "…and keep…" would fail here.
    expect(source[head.length]).toBe(' ');
  });

  it('cuts mid-token only when the text has no space at all', () => {
    const result = cutToWidth('x'.repeat(200), 20);
    expect(result.shown).toMatch(/^x+…$/);
    expect(result.shown.length).toBeGreaterThan(1);
  });

  it('returns nothing for blank input rather than an ellipsis', () => {
    const result = cutToWidth('   ', TITLE_CUT);
    expect(result.shown).toBe('');
    expect(result.cut).toBe(false);
  });

  it('cuts a Bangla string earlier than a Latin one of the same length', () => {
    const bangla = cutToWidth('ব'.repeat(70), TITLE_CUT);
    const latin = cutToWidth('b'.repeat(70), TITLE_CUT);
    expect(bangla.hidden).toBeGreaterThan(latin.hidden);
  });

  it('reports the width it judged at, which is what the caller renders next to the cut', () => {
    expect(cutToWidth('a'.repeat(50), TITLE_CUT).counted).toBe(50);
  });
});

describe('previewOverride — what a reader sees', () => {
  it('prints the domain and the path as a breadcrumb', () => {
    expect(previewOverride(draft()).breadcrumb).toBe('bsdc.info.bd/about');
  });

  it('normalises the path before printing it', () => {
    expect(previewOverride(draft({ path: '/About//' })).breadcrumb).toBe('bsdc.info.bd/about');
  });

  it('leaves the root without a trailing slash, as a result list prints it', () => {
    expect(previewOverride(draft({ path: '/' })).breadcrumb).toBe('bsdc.info.bd');
  });

  it('honours an origin other than the default', () => {
    expect(previewOverride(draft(), 'staging.bsdc.info.bd').breadcrumb).toBe('staging.bsdc.info.bd/about');
  });

  it('cuts the share card shorter than the result row, because the card is narrower', () => {
    // 74 characters: past the card's 55, short of the result row's 60 … which is
    // false, so the fixture is deliberately past both, and the assertion that
    // matters is that the card hides strictly more than the row does.
    const text = 'A title long enough to fill a result row and then run well past a share card too';
    const preview = previewOverride(draft({ title: text }));
    expect(SOCIAL_TITLE_CUT).toBeLessThan(TITLE_CUT);
    expect(preview.title.cut).toBe(true);
    expect(preview.socialTitle.cut).toBe(true);
    expect(preview.socialTitle.hidden).toBeGreaterThan(preview.title.hidden);
  });

  it('cuts the social description shorter than the search description', () => {
    expect(SOCIAL_DESCRIPTION_CUT).toBeLessThan(DESCRIPTION_CUT);
  });
});

describe('previewOverride — notes', () => {
  it('says nothing about a clean draft', () => {
    expect(previewOverride(draft()).notes).toEqual([]);
  });

  it('explains a description with no title rather than refusing it', () => {
    const preview = previewOverride(draft({ title: '' }));
    expect(preview.notes.join(' ')).toContain('no title');
    expect(preview.blocker).toBeNull();
  });

  it('explains a title with no description', () => {
    expect(previewOverride(draft({ description: '' })).notes.join(' ')).toContain('no description');
  });

  it('flags a noindex page that is also in the sitemap', () => {
    const preview = previewOverride(draft({ robots: 'noindex', inSitemap: true }));
    expect(preview.notes.join(' ')).toContain('sitemap');
  });

  it('says nothing about the sitemap when the page is not in it', () => {
    const preview = previewOverride(draft({ robots: 'noindex', inSitemap: false }));
    expect(preview.notes.join(' ')).not.toContain('sitemap');
  });
});

describe('previewOverride — blockers', () => {
  it('allows a clean draft to publish', () => {
    expect(previewOverride(draft()).blocker).toBeNull();
  });

  it('blocks a page that is in the sitemap and noindex at once', () => {
    const preview = previewOverride(draft({ robots: 'noindex', inSitemap: true }));
    expect(preview.blocker).toContain('sitemap');
  });

  it('blocks a canonical that names its own path', () => {
    const preview = previewOverride(draft({ canonical: '/about' }));
    expect(preview.blocker).toContain('itself');
  });

  it('blocks a self-canonical written in non-canonical form, because the database stores it normalised', () => {
    const preview = previewOverride(draft({ canonical: '/About/' }));
    expect(preview.blocker).toContain('itself');
  });

  it('allows a canonical that points somewhere else', () => {
    expect(previewOverride(draft({ canonical: '/company' })).blocker).toBeNull();
  });

  it('allows a missing title: that is a note, not a wall', () => {
    expect(previewOverride(draft({ title: '' })).blocker).toBeNull();
  });
});

describe('canonicalCollisions', () => {
  it('is empty when every canonical is its own page', () => {
    expect(canonicalCollisions([{ path: '/a', canonical: '' }])).toEqual([]);
  });

  it('finds two overrides claiming one canonical', () => {
    const collisions = canonicalCollisions([
      { path: '/a', canonical: '/target' },
      { path: '/b', canonical: '/target' },
    ]);
    expect(collisions).toHaveLength(1);
    expect(collisions[0]?.canonical).toBe('/target');
    expect(collisions[0]?.paths).toEqual(['/a', '/b']);
  });

  it('matches canonicals that differ only in how they were typed', () => {
    const collisions = canonicalCollisions([
      { path: '/a', canonical: '/Target/' },
      { path: '/b', canonical: '/target' },
    ]);
    expect(collisions).toHaveLength(1);
  });

  it('does not count a page pointing at itself as a collision with itself', () => {
    expect(canonicalCollisions([{ path: '/a', canonical: '/a' }])).toEqual([]);
  });
});

describe('coverage', () => {
  it('lists a route with no override as missing both fields', () => {
    const rows = coverage(['/blog'], []);
    expect(rows).toEqual([{ path: '/blog', missing: ['title', 'description'] }]);
  });

  it('lists only the field that is missing', () => {
    const rows = coverage(
      ['/blog'],
      [{ path: '/blog', title: 'The blog', description: '' }],
    );
    expect(rows).toEqual([{ path: '/blog', missing: ['description'] }]);
  });

  it('omits a route that has both', () => {
    const rows = coverage(['/blog'], [{ path: '/blog', title: 'The blog', description: 'Posts.' }]);
    expect(rows).toEqual([]);
  });

  it('treats a whitespace-only title as missing, because a title of spaces is not a title', () => {
    const rows = coverage(['/blog'], [{ path: '/blog', title: '   ', description: 'Posts.' }]);
    expect(rows[0]?.missing).toEqual(['title']);
  });

  it('matches routes and overrides regardless of how the path was typed', () => {
    const rows = coverage(['/Blog/'], [{ path: '/blog', title: 'The blog', description: 'Posts.' }]);
    expect(rows).toEqual([]);
  });

  it('sorts the list so two people reading it see the same order', () => {
    const rows = coverage(['/z', '/a'], []);
    expect(rows.map((r) => r.path)).toEqual(['/a', '/z']);
  });
});

describe('the width factor', () => {
  it('is above one, because Bangla is wider than Latin in the same box', () => {
    expect(BANGLA_WIDTH_FACTOR).toBeGreaterThan(1);
  });

  it('is below two, because a factor that warns about everything is ignored', () => {
    expect(BANGLA_WIDTH_FACTOR).toBeLessThan(2);
  });
});

// ---------------------------------------------------------------------------
// Redirects
// ---------------------------------------------------------------------------

function redirect(over: Partial<RedirectRow> = {}): RedirectRow {
  return {
    from_path: '/old',
    to_path: '/new',
    status: 301,
    note: '',
    hits: 0,
    last_hit: null,
    is_enabled: true,
    ...over,
  };
}

describe('chainFrom', () => {
  it('ends at a path that is not itself redirected', () => {
    const walk = chainFrom('/a', [redirect({ from_path: '/a', to_path: '/b' })]);
    expect(walk.trail).toEqual(['/a', '/b']);
    expect(walk.finalTarget).toBe('/b');
    expect(walk.loop).toBe(false);
  });

  it('follows a chain to its end, so a collapse can name the final page', () => {
    const rows = [
      redirect({ from_path: '/a', to_path: '/b' }),
      redirect({ from_path: '/b', to_path: '/c' }),
      redirect({ from_path: '/c', to_path: '/d' }),
    ];
    const walk = chainFrom('/a', rows);
    expect(walk.trail).toEqual(['/a', '/b', '/c', '/d']);
    expect(walk.finalTarget).toBe('/d');
  });

  it('reports a two-step loop, and names both rows that caused it', () => {
    const rows = [
      redirect({ from_path: '/a', to_path: '/b' }),
      redirect({ from_path: '/b', to_path: '/a' }),
    ];
    const walk = chainFrom('/a', rows);
    expect(walk.loop).toBe(true);
    expect(walk.finalTarget).toBeNull();
    expect(walk.trail).toEqual(['/a', '/b', '/a']);
  });

  it('does not follow a disabled redirect', () => {
    const rows = [redirect({ from_path: '/a', to_path: '/b', is_enabled: false })];
    const walk = chainFrom('/a', rows);
    expect(walk.trail).toEqual(['/a']);
    expect(walk.finalTarget).toBe('/a');
  });

  it('stops at an off-site destination rather than trying to follow it', () => {
    const rows = [redirect({ from_path: '/a', to_path: 'https://example.com/x' })];
    const walk = chainFrom('/a', rows);
    expect(walk.finalTarget).toBe('https://example.com/x');
    expect(walk.loop).toBe(false);
  });

  it('reports tooLong rather than pretending a twenty-step chain is fine', () => {
    const rows = Array.from({ length: 25 }, (_, i) =>
      redirect({ from_path: `/p${i}`, to_path: `/p${i + 1}` }),
    );
    const walk = chainFrom('/p0', rows);
    expect(walk.tooLong).toBe(true);
    expect(walk.finalTarget).toBeNull();
    expect(walk.trail.length).toBeLessThanOrEqual(MAX_CHAIN + 1);
  });

  it('normalises the path it starts from, so a hand-typed path still walks', () => {
    const walk = chainFrom('/A/', [redirect({ from_path: '/a', to_path: '/b' })]);
    expect(walk.finalTarget).toBe('/b');
  });
});

describe('collapseSuggestion', () => {
  it('names the final target when the destination is itself redirected', () => {
    const rows = [
      redirect({ from_path: '/old', to_path: '/older' }),
      redirect({ from_path: '/older', to_path: '/newest' }),
    ];
    expect(collapseSuggestion('/older', rows)?.finalTarget).toBe('/newest');
  });

  it('shows the path that led there, so the suggestion is checkable', () => {
    const rows = [
      redirect({ from_path: '/older', to_path: '/mid' }),
      redirect({ from_path: '/mid', to_path: '/newest' }),
    ];
    expect(collapseSuggestion('/older', rows)?.trail).toEqual(['/older', '/mid', '/newest']);
  });

  it('has nothing to suggest when the destination is already final', () => {
    expect(collapseSuggestion('/newest', [redirect({ from_path: '/old', to_path: '/newest' })])).toBeNull();
  });

  it('has nothing to suggest for an off-site destination', () => {
    expect(collapseSuggestion('https://example.com', [])).toBeNull();
  });

  it('has nothing to suggest when following the destination loops', () => {
    const rows = [
      redirect({ from_path: '/older', to_path: '/a' }),
      redirect({ from_path: '/a', to_path: '/older' }),
    ];
    expect(collapseSuggestion('/older', rows)).toBeNull();
  });
});

describe('explainLoop', () => {
  it('writes the whole cycle as one line', () => {
    expect(explainLoop(['/a', '/b', '/a'])).toContain('/a → /b → /a');
  });

  it('says a loop would send a visitor round forever, which is the consequence', () => {
    expect(explainLoop(['/a', '/b', '/a'])).toContain('forever');
  });

  it('says how to break it rather than only that it exists', () => {
    expect(explainLoop(['/a', '/b', '/a'])).toContain('Break it');
  });
});

describe('exportRedirects', () => {
  it('writes a header, so the file says what it is', () => {
    expect(exportRedirects([])).toBe('from_path,to_path,status,note\n');
  });

  it('writes a row unquoted when it needs no quoting', () => {
    expect(exportRedirects([redirect()])).toContain('/old,/new,301,');
  });

  it('quotes a note with a comma in it rather than corrupting the row', () => {
    const text = exportRedirects([redirect({ note: 'moved, permanently' })]);
    expect(text).toContain('"moved, permanently"');
  });

  it('escapes a quote in a note by doubling it', () => {
    expect(exportRedirects([redirect({ note: 'he said "go"' })])).toContain('"he said ""go"""');
  });

  it('sorts, so two exports of one table are the same bytes', () => {
    const rows = [redirect({ from_path: '/z' }), redirect({ from_path: '/a' })];
    const first = exportRedirects(rows);
    expect(exportRedirects([...rows].reverse())).toBe(first);
    expect(first.indexOf('/a') < first.indexOf('/z')).toBe(true);
  });
});

describe('parseRedirects', () => {
  it('reads back an export with no change', () => {
    const rows = [redirect({ note: 'moved, permanently' }), redirect({ from_path: '/x', to_path: '/y', status: 302, note: '' })];
    const result = parseRedirects(exportRedirects(rows));
    expect(result.problems).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[1]).toEqual({ line: 3, from: '/x', to: '/y', status: 302, note: '' });
  });

  it('reads a comma inside a quoted note as part of the note', () => {
    const result = parseRedirects('from_path,to_path,status,note\n/a,/b,301,"one, two, three"\n');
    expect(result.rows[0]?.note).toBe('one, two, three');
  });

  it('accepts a file with no header, because a spreadsheet export may not have one', () => {
    const result = parseRedirects('/a,/b,301,\n');
    expect(result.rows).toHaveLength(1);
    expect(result.problems).toEqual([]);
  });

  it('defaults the status when the column is empty', () => {
    expect(parseRedirects('/a,/b\n').rows[0]?.status).toBe(301);
  });

  it('reports a bad status with its line number rather than dropping the row', () => {
    const result = parseRedirects('from_path,to_path,status,note\n/a,/b,410,\n');
    expect(result.rows).toHaveLength(0);
    expect(result.problems[0]?.line).toBe(2);
    expect(result.problems[0]?.message).toContain('410');
  });

  it('reports a missing destination with its line number', () => {
    const result = parseRedirects('/a,,\n');
    expect(result.problems[0]?.message).toContain('no destination');
  });

  it('reports a duplicate from path rather than silently keeping the last', () => {
    const result = parseRedirects('/a,/b,301,\n/a,/c,301,\n');
    expect(result.problems[0]?.message).toContain('also appears on line 1');
    expect(result.problems[0]?.line).toBe(2);
  });

  it('ignores blank lines, which every spreadsheet adds', () => {
    expect(parseRedirects('/a,/b,301,\n\n\n').problems).toEqual([]);
  });

  it('round-trips: export, parse, export again is the same bytes', () => {
    const rows = [redirect({ note: 'a "quoted", note' }), redirect({ from_path: '/x', to_path: '/y', status: 308 })];
    const once = exportRedirects(rows);
    const parsed = parseRedirects(once);
    expect(parsed.problems).toEqual([]);
    const rebuilt = exportRedirects(
      parsed.rows.map((row, i) => redirect({ from_path: row.from, to_path: row.to, status: row.status, note: row.note, hits: i })),
    );
    expect(rebuilt).toBe(once);
  });
});

describe('planRedirectImport', () => {
  const current = [redirect({ from_path: '/a', to_path: '/b', note: 'kept' })];

  it('counts a new row as created', () => {
    const plan = planRedirectImport(current, [{ line: 2, from: '/c', to: '/d', status: 301, note: '' }]);
    expect(plan.created).toBe(1);
    expect(plan.rows[0]?.change).toBe('created');
  });

  it('calls an identical row unchanged, which is what makes a round trip reassuring', () => {
    const plan = planRedirectImport(current, [{ line: 2, from: '/a', to: '/b', status: 301, note: 'kept' }]);
    expect(plan.unchanged).toBe(1);
    expect(plan.rows[0]?.differences).toEqual([]);
  });

  it('says exactly what would change on an updated row', () => {
    const plan = planRedirectImport(current, [{ line: 2, from: '/a', to: '/z', status: 302, note: 'new' }]);
    expect(plan.updated).toBe(1);
    const differences = plan.rows[0]?.differences.join(' ');
    expect(differences).toContain('/b → /z');
    expect(differences).toContain('301 → 302');
  });

  it('notices a row that was disabled would come back on', () => {
    const disabled = [redirect({ from_path: '/a', to_path: '/b', note: 'kept', is_enabled: false })];
    const plan = planRedirectImport(disabled, [{ line: 2, from: '/a', to: '/b', status: 301, note: 'kept' }]);
    expect(plan.rows[0]?.differences.join(' ')).toContain('enabled again');
  });

  it('matches paths regardless of how they were typed', () => {
    const plan = planRedirectImport(current, [{ line: 2, from: '/A/', to: '/b', status: 301, note: 'kept' }]);
    expect(plan.unchanged).toBe(1);
  });

  it('adds the three counts to the number of rows in the file', () => {
    const plan = planRedirectImport(current, [
      { line: 2, from: '/a', to: '/b', status: 301, note: 'kept' },
      { line: 2, from: '/c', to: '/d', status: 301, note: '' },
    ]);
    expect(plan.created + plan.updated + plan.unchanged).toBe(2);
  });
});

describe('describePlan', () => {
  it('says the three numbers in the order an operator reads them', () => {
    const plan = planRedirectImport(
      [redirect({ from_path: '/a', to_path: '/b' })],
      [{ line: 2, from: '/c', to: '/d', status: 301, note: '' }],
    );
    expect(describePlan(plan)).toBe('1 to create, 0 to update, 0 unchanged.');
  });

  it('mentions unreadable lines only when there are some', () => {
    const clean = planRedirectImport([], []);
    expect(describePlan(clean)).not.toContain('unreadable');
  });
});

describe('planRedirectImport — refusals', () => {
  it('refuses a row that would point a path at itself', () => {
    const plan = planRedirectImport([], [{ line: 2, from: '/a', to: '/a', status: 301, note: '' }]);
    expect(plan.refused).toHaveLength(1);
    expect(plan.refused[0]?.reason).toContain('itself');
    expect(plan.created).toBe(0);
  });

  it('refuses a destination that is already redirected, naming where it goes', () => {
    const plan = planRedirectImport(
      [redirect({ from_path: '/b', to_path: '/c' })],
      [{ line: 2, from: '/a', to: '/b', status: 301, note: '' }],
    );
    expect(plan.refused[0]?.reason).toContain('/c');
  });

  it('refuses a loop the file builds between two of its own rows', () => {
    // Neither row is a problem against the empty table; together they are.
    const plan = planRedirectImport([], [
      { line: 2, from: '/a', to: '/b', status: 301, note: '' },
      { line: 3, from: '/b', to: '/a', status: 301, note: '' },
    ]);
    expect(plan.refused).toHaveLength(1);
    expect(plan.refused[0]?.line).toBe(3);
    expect(plan.created).toBe(1);
  });

  it('carries the line number so the row can be found in the file', () => {
    const plan = planRedirectImport([], [{ line: 7, from: '/a', to: '/a', status: 301, note: '' }]);
    expect(plan.refused[0]?.line).toBe(7);
  });

  it('refuses redirecting the home page away', () => {
    const plan = planRedirectImport([], [{ line: 2, from: '/', to: '/home', status: 301, note: '' }]);
    expect(plan.refused[0]?.reason).toContain('home page');
  });

  it('counts a refused row in the sentence rather than hiding it', () => {
    const plan = planRedirectImport([], [{ line: 2, from: '/a', to: '/a', status: 301, note: '' }]);
    expect(describePlan(plan)).toContain('1 refused');
  });

  it('does not let a refused row change the table the next row is judged against', () => {
    const plan = planRedirectImport([], [
      { line: 2, from: '/a', to: '/a', status: 301, note: '' },
      { line: 3, from: '/a', to: '/b', status: 301, note: '' },
    ]);
    expect(plan.created).toBe(1);
    expect(plan.refused).toHaveLength(1);
  });
});
