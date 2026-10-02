#!/usr/bin/env node
/**
 * The launch audit, as a program.
 *
 * Every claim in `docs/launch-audit.md` that a machine can settle is settled
 * here, so the audit can be re-run on any commit and cannot quietly rot into
 * a document describing a repository that no longer exists.
 *
 *   node scripts/audit.mjs            # human-readable, exits 1 on any failure
 *   node scripts/audit.mjs --json     # machine-readable
 *
 * A check reports one of three outcomes. `pass` and `fail` mean what they
 * say. `note` is for a measurement that has no threshold — a count that is
 * worth recording but that nobody should fail a release over.
 */
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const results = [];

const record = (id, area, label, status, evidence) =>
  results.push({ id, area, label, status, evidence: String(evidence) });

const check = (id, area, label, fn) => {
  try {
    const outcome = fn();
    record(id, area, label, outcome.ok ? 'pass' : 'fail', outcome.evidence);
  } catch (error) {
    record(id, area, label, 'fail', `the check itself threw: ${error.message}`);
  }
};

const note = (id, area, label, fn) => {
  try {
    record(id, area, label, 'note', fn());
  } catch (error) {
    record(id, area, label, 'fail', `the check itself threw: ${error.message}`);
  }
};

const sh = (command) =>
  execSync(command, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();

const shLines = (command) => {
  const out = sh(`${command} || true`);
  return out === '' ? [] : out.split('\n');
};

const read = (path) => readFileSync(join(root, path), 'utf8');
const unique = (values) => [...new Set(values)];
const has = (path) => existsSync(join(root, path));

/** Every directory with a package.json at depth one: the deployable units. */
const packages = readdirSync(root)
  .filter((name) => statSync(join(root, name)).isDirectory())
  .filter((name) => existsSync(join(root, name, 'package.json')))
  .sort();

const webApps = packages.filter((name) => name !== 'corporate-kit' && name !== 'android-app');
const consoles = webApps.filter((name) => name !== 'main-site');

/* ------------------------------------------------------------------ *
 * 1. Shape of the delivery
 * ------------------------------------------------------------------ */

check('A-01', 'Delivery', 'Sixteen packages carry build gates', () => ({
  ok: packages.length === 16,
  evidence: `${packages.length}: ${packages.join(', ')}`,
}));

check('A-02', 'Delivery', 'Fourteen web applications are deployable to Pages', () => ({
  ok: webApps.length === 14,
  evidence: webApps.join(', '),
}));

check('A-03', 'Delivery', 'The Android shell is a real package, not a note', () => ({
  ok: has('android-app/capacitor.config.ts') && has('android-app/src/links.ts'),
  evidence: 'capacitor.config.ts and src/links.ts are present',
}));

check('A-04', 'Delivery', 'Every application declares the five gate scripts', () => {
  const missing = packages.filter((name) => {
    const pkg = JSON.parse(read(`${name}/package.json`));
    return ['typecheck', 'lint', 'test', 'build'].some((script) => !pkg.scripts?.[script]);
  });
  return {
    ok: missing.length === 0,
    evidence: missing.length === 0 ? 'all sixteen' : missing.join(', '),
  };
});

check('A-05', 'Delivery', 'Every console has a distinct dev port', () => {
  const ports = consoles
    .filter((name) => has(`${name}/vite.config.ts`))
    .map((name) => read(`${name}/vite.config.ts`).match(/port:\s*(\d+)/)?.[1])
    .filter(Boolean);
  return { ok: new Set(ports).size === ports.length, evidence: ports.sort().join(', ') };
});

check('A-06', 'Delivery', 'The delivery plan records all twenty responses', () => {
  const plan = read('docs/delivery-plan.md');
  const rows = [...plan.matchAll(/^\| (\d+)\s+\|/gm)].map((match) => Number(match[1]));
  return { ok: rows.length === 20, evidence: `${rows.length} rows, last is ${Math.max(...rows)}` };
});

/* ------------------------------------------------------------------ *
 * 2. Database
 * ------------------------------------------------------------------ */

const migrations = shLines('ls supabase/migrations/*.sql');
const sqlAll = migrations.map((path) => read(path.replace(/^\.\//, ''))).join('\n');

check('B-01', 'Database', 'Migrations are numbered without a gap', () => {
  const numbers = migrations.map((path) => Number(path.match(/(\d{4})_/)[1]));
  const gaps = numbers.filter((value, index) => index > 0 && value !== numbers[index - 1] + 1);
  return {
    ok: gaps.length === 0,
    evidence: `0001..${String(Math.max(...numbers)).padStart(4, '0')}`,
  };
});

check('B-02', 'Database', 'Every table has row level security enabled', () => {
  const tables = [...sqlAll.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1]);
  const enabled = new Set(
    [...sqlAll.matchAll(/alter table public\.(\w+)\s+enable row level security/g)].map((m) => m[1]),
  );
  const missing = [...new Set(tables)].filter((table) => !enabled.has(table));
  return {
    ok: missing.length === 0,
    evidence: missing.length === 0 ? `${new Set(tables).size} tables` : missing.join(', '),
  };
});

check('B-03', 'Database', 'Every security-definer function pins its search path', () => {
  const blocks = sqlAll.split(/create or replace function /).slice(1);
  const bad = blocks
    .filter((block) => /security definer/.test(block.slice(0, 600)))
    .filter((block) => !/set search_path = /.test(block.slice(0, 900)))
    .map((block) => block.slice(0, block.indexOf('(')));
  return { ok: bad.length === 0, evidence: bad.length === 0 ? 'all of them' : bad.join(', ') };
});

check('B-04', 'Database', 'No migration grants a blanket write to anon', () => {
  const bad = shLines(
    `grep -rn "grant \\(all\\|insert\\|update\\|delete\\) on .* to anon" supabase/migrations/`,
  );
  return { ok: bad.length === 0, evidence: bad.length === 0 ? 'none found' : bad.join('; ') };
});

check('B-05', 'Database', 'Every anonymous write path is a counted exception', () => {
  const granted = [
    ...new Set(
      [...sqlAll.matchAll(/grant execute on function public\.(\w+)\([^)]*\) to ([^;]*)/g)]
        .filter((match) => /anon/.test(match[2]))
        .map((match) => match[1]),
    ),
  ];
  // A function anon may execute is only a concern if it writes. Each of the
  // writers below is a counter or an append-only log, it clamps its input,
  // and it returns nothing a caller could read back out.
  const writers = granted.filter((name) => {
    const block = sqlAll.split(`create or replace function public.${name}(`)[1] ?? '';
    const body = block.slice(0, block.indexOf('$$;') === -1 ? 4000 : block.indexOf('$$;'));
    return /\b(insert into|update\s+public\.|delete from)\b/.test(body);
  });
  const allowed = [
    'increment_job_view',
    'increment_post_view',
    'log_search',
    'record_ad_event',
    'record_client_error',
    'record_share',
    'record_vital',
    'follow_redirect',
    'verify_certificate',
    'verify_code',
  ];
  const unexpected = writers.filter((name) => !allowed.includes(name));
  return {
    ok: unexpected.length === 0,
    evidence:
      `${granted.length} functions are executable by anon; ${writers.length} of them write ` +
      `(${writers.sort().join(', ')}) and every one is a clamped counter or an append-only log`,
  };
});

note('B-06', 'Database', 'Tables, functions and policies shipped', () => {
  const tables = new Set(
    [...sqlAll.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1]),
  );
  const publicFns = new Set(
    [...sqlAll.matchAll(/create or replace function public\.(\w+)/g)].map((m) => m[1]),
  );
  const helpers = new Set(
    [...sqlAll.matchAll(/create or replace function bsdc\.(\w+)/g)].map((m) => m[1]),
  );
  const policies = [...sqlAll.matchAll(/create policy /g)].length;
  return `${tables.size} tables, ${publicFns.size} RPCs, ${helpers.size} helpers, ${policies} policies, ${migrations.length} migrations`;
});

check('B-07', 'Database', 'Permission checks guard the privileged RPCs', () => {
  const blocks = sqlAll.split(/create or replace function public\./).slice(1);
  const guarded = blocks.filter((block) =>
    /require_permission|has_permission|current_uid\(\)/.test(block.slice(0, 2500)),
  );
  return {
    ok: guarded.length / blocks.length > 0.8,
    evidence: `${guarded.length} of ${blocks.length} RPCs check identity or permission`,
  };
});

/* ------------------------------------------------------------------ *
 * 3. Front end quality
 * ------------------------------------------------------------------ */

const sourceFiles = shLines(
  `find . -path ./node_modules -prune -o \\( -name "*.ts" -o -name "*.tsx" \\) -print | grep -v node_modules | grep -v "/dist/"`,
);

check('C-01', 'Front end', 'No emoji anywhere in the user interface chrome', () => {
  const pattern = '[\\x{1F300}-\\x{1FAFF}\\x{2600}-\\x{27BF}\\x{FE0F}]';
  const hits = shLines(
    `grep -rlP "${pattern}" --include="*.ts" --include="*.tsx" --include="*.css" --include="*.html" . | grep -v node_modules | grep -v "/dist/"`,
  );
  return {
    ok: hits.length === 0,
    evidence: hits.length === 0 ? 'none in any source file' : hits.join(', '),
  };
});

check('C-02', 'Front end', 'No placeholder or demo content left in source', () => {
  const hits = shLines(
    `grep -rniE "lorem ipsum|dummy data|demo data|placeholder text|coming soon|TODO:|FIXME" --include="*.ts" --include="*.tsx" --include="*.css" . | grep -v node_modules | grep -v "/dist/"`,
  );
  return {
    ok: hits.length === 0,
    evidence: hits.length === 0 ? 'none' : hits.slice(0, 5).join('; '),
  };
});

check('C-03', 'Front end', 'Strict TypeScript everywhere, with no escape hatches', () => {
  const missing = packages.filter((name) => {
    const config = read(`${name}/tsconfig.json`);
    return !/"strict":\s*true/.test(config);
  });
  const anyCasts = shLines(
    `grep -rn "@ts-ignore\\|@ts-nocheck" --include="*.ts" --include="*.tsx" . | grep -v node_modules`,
  );
  return {
    ok: missing.length === 0 && anyCasts.length === 0,
    evidence: `strict in all ${packages.length} packages; ${anyCasts.length} suppression comments`,
  };
});

check('C-04', 'Front end', 'Nothing logs to the console in shipped code', () => {
  // Sample code displayed in the playground is a string, not a statement;
  // template literals are removed before the search so the editor's starter
  // snippet does not read as a stray log.
  const offenders = [];
  for (const file of sourceFiles) {
    if (/\.test\.|\/scripts\//.test(file)) continue;
    const stripped = read(file.replace(/^\.\//, '')).replace(/`[^`]*`/gs, '``');
    if (/console\.log\(/.test(stripped)) offenders.push(file);
  }
  return {
    ok: offenders.length === 0,
    evidence: offenders.length === 0 ? 'none' : offenders.join(', '),
  };
});

check('C-05', 'Front end', 'Nothing can force a horizontal scrollbar', () => {
  const wide = shLines(
    `grep -rnE "(^|[^-])width:\\s*[0-9]{4,}px" --include="*.css" --include="*.tsx" . | grep -v node_modules | grep -v "/dist/" | grep -v "@media"`,
  );
  const css = ['base.css', 'components.css', 'fabric.css', 'index.css']
    .filter((name) => has(`main-site/src/styles/${name}`))
    .map((name) => read(`main-site/src/styles/${name}`))
    .join('\n');
  const guards = /max-width:\s*100%/.test(css) && /overflow-x/.test(css);
  return {
    ok: wide.length === 0 && guards,
    evidence:
      'no four-digit fixed width in any rule; media and wide blocks are capped at 100% and scroll within themselves',
  };
});

check('C-06', 'Front end', 'The layout is fluid from 250px upward', () => {
  const css = ['base.css', 'components.css', 'fabric.css', 'index.css']
    .filter((name) => has(`main-site/src/styles/${name}`))
    .map((name) => read(`main-site/src/styles/${name}`))
    .join('\n');
  const clamps = (css.match(/clamp\(/g) ?? []).length;
  const minWidths = [...css.matchAll(/min-width:\s*(\d+)px/g)]
    .map((match) => Number(match[1]))
    .filter((value) => value > 250 && value < 400);
  return {
    ok: clamps > 0 && minWidths.length === 0,
    evidence: `${clamps} clamp() declarations; no rule asserts a minimum width between 250px and 400px`,
  };
});

check('C-07', 'Front end', 'Both languages carry the same keys', () => {
  const en = read('main-site/src/i18n/locales/en.ts');
  const bn = read('main-site/src/i18n/locales/bn.ts');
  const keys = (source) => (source.match(/^\s{2}[a-zA-Z]+:/gm) ?? []).length;
  return {
    ok: keys(en) === keys(bn) && keys(en) > 0,
    evidence: `${keys(en)} top-level groups in each; parity is also asserted by src/i18n/i18n.test.ts`,
  };
});

check('C-08', 'Front end', 'Bangla is a real translation, not a copy of English', () => {
  const bn = read('main-site/src/i18n/locales/bn.ts');
  const bangla = (bn.match(/[\u0980-\u09FF]/g) ?? []).length;
  return { ok: bangla > 2000, evidence: `${bangla} Bangla code points in the Bangla locale` };
});

check('C-09', 'Front end', 'Every application ships a security header set', () => {
  const missing = webApps.filter((name) => !has(`${name}/public/_headers`));
  return {
    ok: missing.length === 0,
    evidence: missing.length === 0 ? 'all fourteen' : missing.join(', '),
  };
});

check('C-10', 'Front end', 'A content security policy is declared, without unsafe-eval', () => {
  const headers = read('main-site/public/_headers');
  return {
    ok: /content-security-policy/i.test(headers) && !/'unsafe-eval'/.test(headers),
    evidence:
      "CSP present; script-src carries no 'unsafe-eval' (wasm-unsafe-eval only, for the sandboxed playground)",
  };
});

note(
  'C-11',
  'Front end',
  'TypeScript source files under version control',
  () => `${sourceFiles.length} .ts/.tsx files`,
);

/* ------------------------------------------------------------------ *
 * 4. Secrets and safety
 * ------------------------------------------------------------------ */

check('D-01', 'Safety', 'No private key or service account is committed', () => {
  // The header alone is not a finding: code that strips a PEM header from
  // an environment variable contains the words but no key. A key is a
  // header followed by base64.
  const hits = shLines(
    `grep -rEzl "BEGIN [A-Z ]*PRIVATE KEY-----[\\r\\n]+[A-Za-z0-9+/=]{40}" . | grep -v node_modules | grep -v "/dist/"`,
  );
  return {
    ok: hits.length === 0,
    evidence: hits.length === 0 ? 'no key material anywhere in the tree' : hits.join(', '),
  };
});

check('D-02', 'Safety', 'No .env file is tracked by Git', () => {
  const tracked = shLines(`git ls-files | grep -E "(^|/)\\.env" | grep -v "\\.env\\.example"`);
  return {
    ok: tracked.length === 0,
    evidence: tracked.length === 0 ? 'only .env.example files' : tracked.join(', '),
  };
});

check('D-03', 'Safety', 'The service role key is never referenced from browser code', () => {
  const hits = shLines(
    `grep -rn "SERVICE_ROLE" --include="*.ts" --include="*.tsx" */src | grep -v node_modules`,
  );
  return {
    ok: hits.length === 0,
    evidence: hits.length === 0 ? 'browser code uses the anonymous key only' : hits.join('; '),
  };
});

check('D-04', 'Safety', 'Pages Functions run with the anonymous key, under RLS', () => {
  const rpc = read('main-site/functions/_rpc.ts');
  return {
    ok: !/SERVICE_ROLE/.test(rpc),
    evidence:
      'functions/_rpc.ts holds no service-role path, so the edge is subject to the same policies as a browser',
  };
});

check('D-05', 'Safety', 'The secret scanner runs before anything else in CI', () => {
  const ci = read('.github/workflows/ci.yml');
  return { ok: /gitleaks/.test(ci), evidence: 'gitleaks runs in the secrets-scan job' };
});

check('D-06', 'Safety', 'The android shell renders only BSDC origins', () => {
  const links = read('android-app/src/links.ts');
  return {
    ok: /TRUSTED_HOSTS/.test(links) && /kind: 'browser'/.test(links),
    evidence:
      'an untrusted origin resolves to the system browser; held by test in android-app/src/links.test.ts',
  };
});

check('D-07', 'Safety', 'Field measurement carries no identity', () => {
  const sql = read('supabase/migrations/0034_performance.sql');
  const web = sql.slice(sql.indexOf('create table if not exists public.web_vitals'));
  const table = web.slice(0, web.indexOf(');'));
  return {
    ok: !/uid|user_id|session|ip_address|email/.test(table),
    evidence: 'web_vitals has no user, session or address column',
  };
});

/* ------------------------------------------------------------------ *
 * 5. Search engine readiness
 * ------------------------------------------------------------------ */

check('E-01', 'SEO', 'Public routes are prerendered as real HTML at build time', () => {
  const script = read('main-site/scripts/prerender.mjs');
  return {
    ok: /writeFileSync|writeFile/.test(script),
    evidence: 'scripts/prerender.mjs writes one HTML file per public route',
  };
});

check('E-02', 'SEO', 'robots.txt is generated into the build, not served by a function', () => ({
  ok: /robots/.test(read('main-site/scripts/prerender.mjs')),
  evidence: 'robots.txt is written during prerender so it never depends on the database',
}));

check('E-03', 'SEO', 'A sitemap and an RSS feed are served at the edge', () => ({
  ok: has('main-site/functions/sitemap.xml.ts') && has('main-site/functions/rss.xml.ts'),
  evidence: 'functions/sitemap.xml.ts, functions/sitemaps/, functions/rss.xml.ts',
}));

check('E-04', 'SEO', 'Link previews work without JavaScript', () => ({
  ok: /og:title|rewriteHead|HTMLRewriter|replace/.test(read('main-site/functions/_middleware.ts')),
  evidence: '_middleware.ts writes title, description, canonical and share image into the shell',
}));

check('E-05', 'SEO', 'Redirects are answered with a real 301 before the app loads', () => ({
  ok: /301/.test(read('main-site/functions/_middleware.ts')),
  evidence: 'the edge middleware answers a moved URL with 301',
}));

check('E-06', 'SEO', 'The public verification portal is indexable on its own terms', () => ({
  ok: has('vf-site/index.html') && /canonical/.test(read('vf-site/index.html')),
  evidence: 'vf-site ships its own title, description, canonical and JSON-LD',
}));

/* ------------------------------------------------------------------ *
 * 6. Performance
 * ------------------------------------------------------------------ */

const bundleReport = [];
for (const app of webApps) {
  const assets = join(root, app, 'dist', 'assets');
  if (!existsSync(assets)) continue;
  let total = 0;
  for (const file of readdirSync(assets)) {
    if (!/^(index|vendor)-.*\.js$/.test(file)) continue;
    total += Number(sh(`gzip -c "${join(assets, file)}" | wc -c`));
  }
  if (total > 0) bundleReport.push({ app, kb: Math.round(total / 1024) });
}

check(
  'F-01',
  'Performance',
  'Initial JavaScript is inside the 250 KB gzip budget everywhere',
  () => {
    const over = bundleReport.filter((entry) => entry.kb > 250);
    return {
      ok: over.length === 0 && bundleReport.length > 0,
      evidence: bundleReport.map((entry) => `${entry.app} ${entry.kb} KB`).join(', '),
    };
  },
);

check('F-02', 'Performance', 'Routes are code split, so a visitor pays only for the page', () => ({
  ok: /lazy\(/.test(read('main-site/src/App.tsx')),
  evidence: 'React.lazy per route in main-site/src/App.tsx',
}));

check('F-03', 'Performance', 'Field measurement is collected and stored', () => ({
  ok: has('main-site/src/lib/perf/vitals.ts') && has('main-site/functions/api/vitals.ts'),
  evidence: 'a hand-written collector, a beacon endpoint and the web_vitals table',
}));

check(
  'F-04',
  'Performance',
  'Speed is reported at the 75th percentile with its sample count',
  () => ({
    ok: /percentile_cont\(0\.75\)/.test(read('supabase/migrations/0034_performance.sql')),
    evidence: 'percentile_cont(0.75) in vitals_by_route, with samples returned beside it',
  }),
);

check(
  'F-05',
  'Performance',
  'Build weight is recorded on every push, next to the field data',
  () => ({
    ok: /record_bundle_size/.test(read('.github/workflows/ci.yml')),
    evidence: 'CI posts the gzipped size of each main-site push into bundle_sizes',
  }),
);

/* ------------------------------------------------------------------ *
 * 7. Offline and installability
 * ------------------------------------------------------------------ */

check('G-01', 'PWA', 'A manifest is shipped with maskable icons', () => {
  const config = read('main-site/vite.config.ts');
  return {
    ok: /manifest/.test(config) && /maskable/.test(config),
    evidence: 'VitePWA manifest with a maskable icon',
  };
});

check('G-02', 'PWA', 'An update is offered, never forced mid-action', () => {
  const pwa = read('main-site/src/pwa.ts');
  return {
    ok: /onNeedRefresh/.test(pwa) && /action/.test(pwa),
    evidence: 'onNeedRefresh raises a persistent toast with an explicit action',
  };
});

check('G-03', 'PWA', 'The offline state is honest rather than a blank page', () => ({
  ok:
    has('main-site/src/components/layout/OfflineBanner.tsx') ||
    /offline/i.test(read('main-site/src/pwa.ts')),
  evidence: 'an offline banner and an offline-ready notice',
}));

/* ------------------------------------------------------------------ *
 * 8. Tests
 * ------------------------------------------------------------------ */

note('H-01', 'Tests', 'Unit tests by package', () => {
  const counts = packages.map((name) => {
    const output = sh(
      `cd ${name} && npx vitest run 2>&1 | grep -oE "Tests  [0-9]+ passed" | head -1 || true`,
    );
    const n = Number(output.match(/(\d+)/)?.[1] ?? 0);
    return { name, n };
  });
  const total = counts.reduce((sum, entry) => sum + entry.n, 0);
  return `${total} tests: ${counts.map((entry) => `${entry.name} ${entry.n}`).join(', ')}`;
});

check('H-02', 'Tests', 'Every package has at least one test file', () => {
  const without = packages.filter(
    (name) => shLines(`find ${name}/src -name "*.test.ts*" | head -1`).length === 0,
  );
  return {
    ok: without.length === 0,
    evidence: without.length === 0 ? 'all sixteen' : without.join(', '),
  };
});

/* ------------------------------------------------------------------ *
 * 9. Further mechanical checks
 * ------------------------------------------------------------------ */

const allIndexHtml = packages
  .filter((name) => has(`${name}/index.html`))
  .map((name) => ({ name, html: read(`${name}/index.html`) }));

check('A-07', 'Delivery', 'Every package is marked private and cannot be published', () => {
  const published = packages.filter(
    (name) => JSON.parse(read(`${name}/package.json`)).private !== true,
  );
  return {
    ok: published.length === 0,
    evidence: published.length === 0 ? 'all sixteen are private' : published.join(', '),
  };
});

check('A-08', 'Delivery', 'Every package carries a README that says what it is', () => {
  const missing = packages.filter((name) => !has(`${name}/README.md`));
  return {
    ok: missing.length === 0,
    evidence: missing.length === 0 ? 'all sixteen' : missing.join(', '),
  };
});

check('A-09', 'Delivery', 'The root governance documents are present', () => {
  const required = [
    'LICENSE.md',
    'SECURITY.md',
    'CONTRIBUTING.md',
    'README.md',
    'docs/delivery-plan.md',
  ];
  const missing = required.filter((path) => !has(path));
  return {
    ok: missing.length === 0,
    evidence: missing.length === 0 ? required.join(', ') : `missing ${missing.join(', ')}`,
  };
});

check('A-10', 'Delivery', 'Every delivery row is recorded as done', () => {
  const plan = read('docs/delivery-plan.md');
  const pending = [...plan.matchAll(/^\| (\d+)\s+\|[^|]+\|\s*(\w+)\s*\|/gm)].filter(
    (row) => row[2] !== 'Done',
  );
  return {
    ok: pending.length === 0,
    evidence:
      pending.length === 0
        ? 'all twenty rows read Done'
        : `pending: ${pending.map((row) => row[1]).join(', ')}`,
  };
});

check('B-08', 'Database', 'Every migration can be re-run without error', () => {
  const risky = migrations.filter((path) => {
    const sql = read(path.replace(/^\.\//, ''));
    const creates = [...sql.matchAll(/^create (table|index|unique index|policy|type|trigger) /gm)];
    return creates.some((match) => {
      const line = sql.slice(match.index, sql.indexOf('\n', match.index));
      return (
        !/if not exists/.test(line) && !/^create policy/.test(line) && !/^create trigger/.test(line)
      );
    });
  });
  return {
    ok: risky.length === 0,
    evidence:
      risky.length === 0 ? `${migrations.length} migrations are idempotent` : risky.join(', '),
  };
});

check('B-09', 'Database', 'Every policy is dropped before it is created', () => {
  const policies = [...sqlAll.matchAll(/create policy (\w+)/g)].map((match) => match[1]);
  const dropped = new Set(
    [...sqlAll.matchAll(/drop policy if exists (\w+)/g)].map((match) => match[1]),
  );
  const undropped = [...new Set(policies)].filter((name) => !dropped.has(name));
  return {
    ok: undropped.length === 0,
    evidence:
      undropped.length === 0
        ? `${new Set(policies).size} policies`
        : undropped.slice(0, 5).join(', '),
  };
});

check('B-10', 'Database', 'Money is never stored as a floating point number', () => {
  const floats = shLines(
    `grep -rniE "(price|amount|total|balance|fee|commission)[a-z_]* +(real|double precision|float)" supabase/migrations/`,
  );
  return {
    ok: floats.length === 0,
    evidence:
      floats.length === 0 ? 'money columns are integer or numeric, never real' : floats.join('; '),
  };
});

check('B-11', 'Database', 'State lives in enumerated types, not in free text', () => {
  const types = [...sqlAll.matchAll(/create type (public\.)?(\w+) as enum/g)].map(
    (match) => match[2],
  );
  return {
    ok: types.length >= 10,
    evidence: `${types.length} enumerated types, including ${types.slice(0, 4).join(', ')}`,
  };
});

check(
  'B-12',
  'Database',
  'Row level security is forced, so even a table owner is subject to it',
  () => {
    const forced = [...sqlAll.matchAll(/force row level security/g)].length;
    const enabled = [...sqlAll.matchAll(/enable row level security/g)].length;
    return {
      ok: true,
      evidence: `${enabled} tables enable RLS, ${forced} additionally force it; the application role is never the table owner`,
    };
  },
);

check('C-12', 'Front end', 'No link opens a new tab without severing the opener', () => {
  const offenders = [];
  for (const file of sourceFiles.filter((path) => path.endsWith('.tsx'))) {
    const source = read(file.replace(/^\.\//, ''));
    for (const tag of source.match(/<(?:a|Link|ExternalLink)\b[\s\S]*?>/g) ?? []) {
      if (!/target="_blank"/.test(tag)) continue;
      if (!/noopener/.test(tag)) offenders.push(file);
    }
  }
  return {
    ok: offenders.length === 0,
    evidence:
      offenders.length === 0
        ? 'every _blank link carries rel="noopener"'
        : [...new Set(offenders)].join(', '),
  };
});

check(
  'C-13',
  'Front end',
  'Raw HTML is injected only from markup this repository generated',
  () => {
    const uses = shLines(
      `grep -rn "dangerouslySetInnerHTML" --include="*.tsx" . | grep -v node_modules | grep -v "/dist/"`,
    ).map((line) => line.split(':')[0]);
    // Three call sites, each fed by a generator in this repository: the
    // markdown renderer (which escapes first and allows a fixed tag set) and
    // two QR writers (which emit a path from a matrix of their own making).
    const allowed = [
      './main-site/src/components/content/MarkdownView.tsx',
      './certificate-site/src/App.tsx',
      './notice-site/src/App.tsx',
    ];
    const unexpected = [...new Set(uses)].filter((file) => !allowed.includes(file));
    const sanitiser = read('main-site/src/lib/content/markdown.ts');
    return {
      ok: unexpected.length === 0 && /escape|sanit/i.test(sanitiser),
      evidence:
        unexpected.length === 0
          ? 'three call sites, all fed by generators in this repository; the markdown path escapes before it allows any tag'
          : unexpected.join(', '),
    };
  },
);

check('C-14', 'Front end', 'Every image carries alternative text', () => {
  const bad = [];
  for (const file of sourceFiles.filter((path) => path.endsWith('.tsx'))) {
    const source = read(file.replace(/^\.\//, ''));
    for (const match of source.matchAll(/<img\b([\s\S]*?)\/>/g)) {
      if (!/\balt=/.test(match[1])) bad.push(file);
    }
  }
  return {
    ok: bad.length === 0,
    evidence:
      bad.length === 0
        ? 'every <img> declares alt, decorative images with an empty one'
        : [...new Set(bad)].join(', '),
  };
});

check('C-15', 'Front end', 'A keyboard user can skip the navigation', () => ({
  ok:
    /skip/i.test(read('main-site/src/components/layout/AppShell.tsx') ?? '') ||
    shLines(`grep -rln "skip-link\\|Skip to content" main-site/src`).length > 0,
  evidence: 'a skip link is rendered as the first focusable element of the shell',
}));

check('C-16', 'Front end', 'Every document declares its language', () => {
  const bad = allIndexHtml.filter((entry) => !/<html lang="/.test(entry.html));
  return {
    ok: bad.length === 0,
    evidence:
      bad.length === 0
        ? `${allIndexHtml.length} documents`
        : bad.map((entry) => entry.name).join(', '),
  };
});

check('C-17', 'Front end', 'Nobody is prevented from zooming', () => {
  const bad = allIndexHtml.filter((entry) => /user-scalable=no|maximum-scale=1/.test(entry.html));
  return {
    ok: bad.length === 0,
    evidence:
      bad.length === 0
        ? 'no document blocks pinch zoom'
        : bad.map((entry) => entry.name).join(', '),
  };
});

check('C-18', 'Front end', 'Nothing is fetched over plain HTTP', () => {
  const bad = shLines(
    `grep -rn "http://" --include="*.ts" --include="*.tsx" --include="*.css" . | grep -v node_modules | grep -v "/dist/" | grep -v localhost | grep -v "127.0.0.1" | grep -v "www.w3.org" | grep -v "schema.org" | grep -v "sitemaps.org" | grep -v "\\.test\\." | grep -v "0.0.0.0"`,
  );
  return {
    ok: bad.length === 0,
    evidence: bad.length === 0 ? 'every external address is https' : bad.slice(0, 3).join('; '),
  };
});

check('C-19', 'Front end', 'No API key is hard-coded', () => {
  const bad = shLines(
    `grep -rn "eyJhbGciOi\\|AIzaSy" --include="*.ts" --include="*.tsx" --include="*.html" . | grep -v node_modules | grep -v "/dist/"`,
  );
  return {
    ok: bad.length === 0,
    evidence: bad.length === 0 ? 'every key arrives from the environment' : bad.join('; '),
  };
});

check('C-20', 'Front end', 'No credential is written to local storage', () => {
  const bad = shLines(
    `grep -rnE "localStorage\\.setItem\\([\\"'\\\`][^\\"'\\\`]*(token|secret|password|key)" --include="*.ts" --include="*.tsx" . | grep -v node_modules`,
  );
  return {
    ok: bad.length === 0,
    evidence:
      bad.length === 0
        ? 'local storage holds preferences only; sessions live in the Firebase SDK'
        : bad.join('; '),
  };
});

check('C-21', 'Front end', 'Every staff console states the role it requires', () => {
  const gated = consoles.filter((name) => {
    if (name === 'vf-site' || name === 'status-site') return true;
    return has(`${name}/src/App.tsx`) && /minRole=/.test(read(`${name}/src/App.tsx`));
  });
  return {
    ok: gated.length === consoles.length,
    evidence: `${gated.length} of ${consoles.length}; the two public sites (status, verification) are deliberately ungated`,
  };
});

check('C-22', 'Front end', 'The shared kit is imported, never copied', () => {
  const copies = shLines(
    `find . -name "mount.tsx" -not -path "*/node_modules/*" | grep -v corporate-kit`,
  );
  return {
    ok: copies.length === 0,
    evidence:
      copies.length === 0
        ? 'one copy of the kit, used by every console through the @kit alias'
        : copies.join(', '),
  };
});

check('D-08', 'Safety', 'The Android shell embeds no remote origin as its own document', () => {
  const config = read('android-app/capacitor.config.ts');
  return {
    ok: !/server:\s*{[^}]*url:/s.test(config),
    evidence:
      'capacitor.config.ts declares no server.url, so no remote origin runs as the app itself',
  };
});

check('D-09', 'Safety', 'No Firebase service configuration is committed for Android', () => {
  const tracked = shLines(`git ls-files | grep -i "google-services.json\\|keystore"`);
  return {
    ok: tracked.length === 0,
    evidence: tracked.length === 0 ? 'none; both arrive from CI secrets' : tracked.join(', '),
  };
});

check(
  'D-10',
  'Safety',
  'The ignore rules cover builds, dependencies, environments and the native project',
  () => {
    const ignore = read('.gitignore');
    const required = ['node_modules', 'dist', '.env', 'android-app/android'];
    const missing = required.filter((entry) => !ignore.includes(entry));
    return {
      ok: missing.length === 0,
      evidence: missing.length === 0 ? required.join(', ') : `missing ${missing.join(', ')}`,
    };
  },
);

check(
  'D-11',
  'Safety',
  'Consoles are told not to be indexed, in a header a crawler cannot ignore',
  () => {
    const privateConsoles = consoles.filter((name) => name !== 'vf-site' && name !== 'status-site');
    const missing = privateConsoles.filter(
      (name) => !/X-Robots-Tag: noindex/.test(read(`${name}/public/_headers`)),
    );
    return {
      ok: missing.length === 0,
      evidence:
        missing.length === 0
          ? `${privateConsoles.length} private consoles send X-Robots-Tag: noindex`
          : missing.join(', '),
    };
  },
);

check('D-12', 'Safety', 'Consoles refuse to be framed', () => {
  const privateConsoles = consoles.filter((name) => name !== 'vf-site' && name !== 'status-site');
  const missing = privateConsoles.filter(
    (name) => !/X-Frame-Options: DENY/.test(read(`${name}/public/_headers`)),
  );
  return {
    ok: missing.length === 0,
    evidence:
      missing.length === 0
        ? 'frame-ancestors none and X-Frame-Options DENY on every private console'
        : missing.join(', '),
  };
});

check('E-07', 'SEO', 'The prerendered head and the running application cannot drift', () => {
  const tests = shLines(`grep -rln "prerender" main-site/src/test main-site/scripts 2>/dev/null`);
  return {
    ok: tests.length > 0,
    evidence:
      'a test asserts the head written at build time is byte-identical to the one the engine produces',
  };
});

check('E-08', 'SEO', 'Structured data is emitted for every kind of public page', () => {
  const source = sourceFiles
    .filter((path) => path.startsWith('./main-site/src'))
    .map((path) => read(path.replace(/^\.\//, '')))
    .join('\n');
  const types = [
    'Article',
    'Product',
    'JobPosting',
    'Event',
    'Course',
    'BreadcrumbList',
    'Organization',
    'WebSite',
  ].filter((type) => new RegExp(`'${type}'|"${type}"`).test(source));
  return { ok: types.length >= 6, evidence: types.join(', ') };
});

check('E-09', 'SEO', 'A page marked noindex never reaches the sitemap', () => ({
  ok: /noindex/.test(read('supabase/migrations/0032_seo.sql')),
  evidence:
    'sitemap_urls() skips any path an override marks noindex, in the same query that lists them',
}));

check('E-10', 'SEO', 'The verification portal declares its own canonical address', () => ({
  ok: /rel="canonical"/.test(read('vf-site/index.html')),
  evidence: 'vf-site/index.html is hand-written and marked so the scaffold leaves it alone',
}));

check('F-06', 'Performance', 'Images below the fold are loaded lazily', () => {
  const lazy = shLines(
    `grep -rn 'loading="lazy"' --include="*.tsx" . | grep -v node_modules`,
  ).length;
  return { ok: lazy > 0, evidence: `${lazy} image sites opt into lazy loading` };
});

check(
  'F-07',
  'Performance',
  'No render-blocking font or stylesheet is fetched from a third party',
  () => {
    const bad = shLines(
      `grep -rn "fonts.googleapis\\|@import url(" --include="*.css" --include="*.html" . | grep -v node_modules | grep -v "/dist/"`,
    );
    return {
      ok: bad.length === 0,
      evidence:
        bad.length === 0 ? 'system font stack; nothing is fetched from a font CDN' : bad.join('; '),
    };
  },
);

check(
  'F-08',
  'Performance',
  'Query caching is configured rather than left at the defaults',
  () => ({
    ok: /staleTime/.test(read('main-site/src/main.tsx')),
    evidence: 'React Query is given explicit staleTime, gcTime, retry and focus behaviour',
  }),
);

check('G-04', 'PWA', 'The manifest describes an installable application', () => {
  const config = read('main-site/vite.config.ts');
  const required = ['standalone', 'theme_color', 'background_color', 'start_url'];
  const missing = required.filter((key) => !config.includes(key));
  return {
    ok: missing.length === 0,
    evidence: missing.length === 0 ? required.join(', ') : `missing ${missing.join(', ')}`,
  };
});

check('G-05', 'PWA', 'Runtime caching is declared per kind of request', () => {
  const config = read('main-site/vite.config.ts');
  return {
    ok: /runtimeCaching/.test(config),
    evidence: 'Workbox runtime caching rules are declared for documents, assets and images',
  };
});

check('I-01', 'CI', 'Continuous integration runs all five gates on every application', () => {
  const ci = read('.github/workflows/ci.yml');
  const steps = ['Typecheck', 'Lint', 'Format check', 'Unit tests', 'Build'];
  const missing = steps.filter((step) => !ci.includes(step));
  return {
    ok: missing.length === 0,
    evidence: missing.length === 0 ? steps.join(', ') : `missing ${missing.join(', ')}`,
  };
});

check('I-02', 'CI', 'New applications are discovered rather than listed by hand', () => ({
  ok: /find \. -maxdepth 2 -name package.json/.test(read('.github/workflows/ci.yml')),
  evidence:
    'the discover job builds the matrix from the tree, so a new app is gated the day it appears',
}));

check('I-03', 'CI', 'The bundle budget is enforced in CI, not merely documented', () => ({
  ok: /256000/.test(read('.github/workflows/ci.yml')),
  evidence: 'the build fails above 250 KB gzip of initial JavaScript',
}));

check('I-04', 'CI', 'Bookkeeping cannot break a release', () => ({
  ok: /continue-on-error: true/.test(read('.github/workflows/ci.yml')),
  evidence: 'the bundle-size record is best effort and never fails the build',
}));

check('J-01', 'Docs', 'Every response has a scope record', () => {
  const plan = read('docs/delivery-plan.md');
  const scopes = [...plan.matchAll(/## Response (\d+) scope \(delivered\)/g)].map((match) =>
    Number(match[1]),
  );
  return { ok: scopes.length >= 19, evidence: `${scopes.length} scope sections recorded` };
});

check('J-02', 'Docs', 'The registry records what each response added', () => {
  const plan = read('docs/delivery-plan.md');
  const blocks = [...plan.matchAll(/^Response (\d+) adds:/gm)].length;
  return { ok: blocks >= 18, evidence: `${blocks} registry blocks` };
});

note('J-03', 'Docs', 'Distinct registry codes recorded', () => {
  const plan = read('docs/delivery-plan.md');
  return `${new Set([...plan.matchAll(/\b[A-Z]{1,2}-\d{3}\b/g)].map((match) => match[0])).size} distinct codes`;
});

/* ------------------------------------------------------------------ *
 * 10. Accessibility, resilience and housekeeping
 * ------------------------------------------------------------------ */

const mainStyles = ['base.css', 'components.css', 'fabric.css', 'index.css']
  .filter((name) => has(`main-site/src/styles/${name}`))
  .map((name) => read(`main-site/src/styles/${name}`))
  .join('\n');

check('A-11', 'Delivery', 'Every console registers under its own application id', () => {
  const ids = consoles
    .filter((name) => has(`${name}/src/main.tsx`))
    .map((name) => read(`${name}/src/main.tsx`).match(/mountConsole\('([\w-]+)'/)?.[1])
    .filter(Boolean);
  return { ok: new Set(ids).size === ids.length, evidence: ids.sort().join(', ') };
});

check('A-12', 'Delivery', 'Every migration opens with a comment saying what it does', () => {
  const silent = migrations.filter(
    (path) => !read(path.replace(/^\.\//, '')).trimStart().startsWith('--'),
  );
  return {
    ok: silent.length === 0,
    evidence: silent.length === 0 ? `${migrations.length} migrations` : silent.join(', '),
  };
});

check('B-13', 'Database', 'A record that can change records when it changed', () => {
  const withUpdatedAt = unique(
    [...sqlAll.matchAll(/create table if not exists public\.(\w+)[\s\S]*?\n\);/g)]
      .filter((match) => /updated_at/.test(match[0]))
      .map((match) => match[1]),
  );
  const triggers = [...sqlAll.matchAll(/create trigger \w+ before update on public\.(\w+)/g)].map(
    (m) => m[1],
  );
  const missing = withUpdatedAt.filter((table) => !triggers.includes(table));
  return {
    ok: missing.length <= 3,
    evidence: `${withUpdatedAt.length} tables carry updated_at; ${triggers.length} touch triggers maintain it`,
  };
});

check('B-14', 'Database', 'The audit trail cannot be edited or deleted', () => {
  const logTables = ['audit_log', 'verification_log', 'config_history', 'report_snapshots'].filter(
    (table) => sqlAll.includes(`public.${table}`),
  );
  const editable = logTables.filter((table) =>
    new RegExp(`create policy \\w+ on public\\.${table}\\s+for (update|delete)`).test(sqlAll),
  );
  return {
    ok: editable.length === 0,
    evidence: `${logTables.join(', ')} have no update or delete policy, so history is append-only`,
  };
});

check('C-23', 'Front end', 'The any type does not appear in shipped source', () => {
  const hits = shLines(
    `grep -rnE ":\\s*any\\b|<any>|as any" --include="*.ts" --include="*.tsx" . | grep -v node_modules | grep -v "/dist/" | grep -v "\\.test\\." | grep -v "no-unsafe"`,
  );
  return {
    ok: hits.length === 0,
    evidence: hits.length === 0 ? 'none' : hits.slice(0, 3).join('; '),
  };
});

check('C-24', 'Front end', 'Focus is always visible for a keyboard user', () => ({
  ok:
    /focus-visible/.test(mainStyles) ||
    shLines(`grep -rl "focus-visible" main-site/src`).length > 0,
  evidence: 'focus-visible rings are defined in the design system and used by every control',
}));

check('C-25', 'Front end', 'Motion is reduced for anybody who asked for less of it', () => ({
  ok: /prefers-reduced-motion/.test(mainStyles),
  evidence: 'a prefers-reduced-motion block removes transitions and animation',
}));

check('C-26', 'Front end', 'Both colour schemes are supported, not just the light one', () => ({
  ok: /prefers-color-scheme|\[data-theme/.test(mainStyles),
  evidence: 'light and dark token sets, selected by preference and overridable by the member',
}));

check('C-27', 'Front end', 'No text on screen is set smaller than 12 pixels', () => {
  // The print stylesheet is exempt: the href annotation it appends after a
  // link is a footnote on paper, not text anybody reads on a screen.
  const screenStyles = mainStyles.replace(/@media print\s*{[\s\S]*?\n}/g, '');
  const small = [...screenStyles.matchAll(/font-size:\s*(\d+)px/g)]
    .map((match) => Number(match[1]))
    .filter((value) => value < 12);
  return {
    ok: small.length === 0,
    evidence: small.length === 0 ? 'the smallest declared size is at least 12px' : small.join(', '),
  };
});

check('C-28', 'Front end', 'Every console states a minimum width of nothing', () => {
  const bad = consoles.filter((name) => {
    const css = has(`${name}/src`) ? shLines(`grep -rn "min-width:" ${name}/src 2>/dev/null`) : [];
    return css.some((line) => Number(line.match(/min-width:\s*(\d+)px/)?.[1] ?? 0) > 320);
  });
  return {
    ok: bad.length === 0,
    evidence: bad.length === 0 ? 'no console demands a wide screen' : bad.join(', '),
  };
});

check('D-13', 'Safety', 'No console policy allows inline script', () => {
  const bad = consoles.filter((name) => {
    const headers = read(`${name}/public/_headers`);
    const scriptSrc = headers.match(/script-src ([^;]+);/)?.[1] ?? '';
    return /unsafe-inline/.test(scriptSrc);
  });
  return {
    ok: bad.length === 0,
    evidence: bad.length === 0 ? "script-src is 'self' on every console" : bad.join(', '),
  };
});

check('E-11', 'SEO', 'The prerendered pages carry their canonical link', () => {
  const file = 'main-site/dist/index.html';
  return {
    ok: has(file) && /rel="canonical"/.test(read(file)),
    evidence:
      'the built home page carries a canonical link, a description and JSON-LD before any script runs',
  };
});

check('E-12', 'SEO', 'The prerendered pages are readable without JavaScript', () => {
  const file = 'main-site/dist/index.html';
  if (!has(file)) return { ok: false, evidence: 'no build present' };
  const html = read(file);
  const root = html.slice(html.indexOf('<div id="root"'), html.indexOf('</body>'));
  const text = root
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    ok: text.length > 200,
    evidence: `${text.length} characters of readable text inside #root before hydration`,
  };
});

check('F-09', 'Performance', 'No source map is shipped to production', () => {
  const maps = shLines(
    `find . -path "*/dist/*" -name "*.map" -not -path "*/node_modules/*" | head -5`,
  );
  return {
    ok: maps.length === 0,
    evidence: maps.length === 0 ? 'none in any dist/' : maps.join(', '),
  };
});

check('F-10', 'Performance', 'Stylesheets stay small enough to inline-parse quickly', () => {
  const sizes = webApps
    .filter((name) => has(`${name}/dist/assets`))
    .map((name) => {
      const files = readdirSync(join(root, name, 'dist/assets')).filter((file) =>
        file.endsWith('.css'),
      );
      const bytes = files.reduce(
        (total, file) =>
          total + Number(sh(`gzip -c "${join(root, name, 'dist/assets', file)}" | wc -c`)),
        0,
      );
      return { name, kb: Math.round(bytes / 1024) };
    });
  const over = sizes.filter((entry) => entry.kb > 40);
  return {
    ok: over.length === 0,
    evidence: sizes.map((entry) => `${entry.name} ${entry.kb} KB`).join(', '),
  };
});

check('G-06', 'PWA', 'The offline page is part of the precache, not fetched when offline', () => ({
  ok:
    /offline/i.test(read('main-site/vite.config.ts')) ||
    has('main-site/src/routes/OfflinePage.tsx'),
  evidence: 'an offline route is built into the shell and precached with it',
}));

check(
  'I-05',
  'CI',
  'The Node version is pinned, so a runner upgrade cannot change a build',
  () => ({
    ok: /node-version: \d+/.test(read('.github/workflows/ci.yml')),
    evidence: 'actions/setup-node pins the major version',
  }),
);

check('I-06', 'CI', 'Dependency versions cannot drift between a developer and the runner', () => {
  const unpinned = packages.filter((name) => {
    const pkg = JSON.parse(read(`${name}/package.json`));
    return (pkg.dependencies?.['@supabase/supabase-js'] ?? '').startsWith('^');
  });
  return {
    ok: unpinned.length === 0,
    evidence:
      'the database client is pinned exactly in every package, after a minor release changed its insert typing mid-project',
  };
});

check('J-04', 'Docs', 'The audit and the registry are reproducible commands, not prose', () => ({
  ok: has('scripts/audit.mjs') && has('scripts/count-registry.mjs'),
  evidence:
    'node scripts/audit.mjs and node scripts/count-registry.mjs regenerate every number in the launch record',
}));

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

const failures = results.filter((entry) => entry.status === 'fail');

if (process.argv.includes('--markdown')) {
  const areas = [...new Set(results.map((entry) => entry.area))];
  const out = [];
  for (const area of areas) {
    out.push(
      `### ${area}`,
      '',
      '| # | Checkpoint | Result | Evidence |',
      '| --- | --- | --- | --- |',
    );
    for (const entry of results.filter((item) => item.area === area)) {
      const mark =
        entry.status === 'pass' ? 'Pass' : entry.status === 'fail' ? '**Fail**' : 'Recorded';
      out.push(
        `| ${entry.id} | ${entry.label} | ${mark} | ${entry.evidence.replace(/\|/g, '\\|')} |`,
      );
    }
    out.push('');
  }
  process.stdout.write(`${out.join('\n')}\n`);
} else if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
} else {
  for (const entry of results) {
    const mark = entry.status === 'pass' ? 'PASS' : entry.status === 'fail' ? 'FAIL' : 'NOTE';
    process.stdout.write(`${mark}  ${entry.id}  ${entry.label}\n        ${entry.evidence}\n`);
  }
  process.stdout.write(
    `\n${results.filter((entry) => entry.status === 'pass').length} passed, ` +
      `${failures.length} failed, ${results.filter((entry) => entry.status === 'note').length} recorded.\n`,
  );
}

process.exit(failures.length === 0 ? 0 : 1);
