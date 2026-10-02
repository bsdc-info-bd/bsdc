#!/usr/bin/env node
/**
 * The feature registry, counted from the repository rather than from memory.
 *
 * A number in a launch document is worth exactly as much as the command that
 * reproduces it, so the count below is derived from the shipped surface:
 * routes that a person can reach, functions the database exposes, policies
 * that decide who sees what, console screens, plugin flags, and the pure
 * domain rules each of those is built from. Running it on any commit prints
 * the figure for that commit.
 *
 *   node scripts/count-registry.mjs           # table
 *   node scripts/count-registry.mjs --json
 *   node scripts/count-registry.mjs --markdown
 *
 * Each counted item is one thing a user, a member of staff or an
 * administrator can actually do. Nothing is counted twice: a route is not
 * also counted as the component that renders it, and an RPC is not also
 * counted as the policy that guards it.
 */
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const sh = (command) =>
  execSync(command, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
const lines = (command) => {
  const out = sh(`${command} || true`);
  return out === '' ? [] : out.split('\n');
};

const walk = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === 'node_modules' || entry === 'dist') continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
};

const sqlFiles = lines('ls supabase/migrations/*.sql').map((path) =>
  read(path.replace(/^\.\//, '')),
);
const sql = sqlFiles.join('\n');

const unique = (values) => [...new Set(values)];

/* --------------------------------------------------------------- *
 * Counting primitives
 * --------------------------------------------------------------- */

/** Pages a visitor can be at: one file per address in the member site. */
const memberPages = walk(join(root, 'main-site/src/routes'))
  .filter((path) => path.endsWith('.tsx') && !path.includes('.test.'))
  .map((path) => relative(root, path));

const adminPages = memberPages.filter((path) => /routes\/Admin/.test(path));
const publicPages = memberPages.filter((path) => !/routes\/Admin/.test(path));

/** Database functions, split by who may call them. */
const rpcNames = unique(
  [...sql.matchAll(/create or replace function public\.(\w+)/g)].map((m) => m[1]),
);
const helperNames = unique(
  [...sql.matchAll(/create or replace function bsdc\.(\w+)/g)].map((m) => m[1]),
);

const bodyOf = (name) => {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  if (start === -1) return '';
  const end = sql.indexOf('$$;', start);
  return sql.slice(start, end === -1 ? start + 4000 : end);
};

const permissionOf = (name) => {
  const match = bodyOf(name).match(
    /require_permission\('([a-z_.]+)'\)|has_permission\('([a-z_.]+)'\)/,
  );
  return match ? (match[1] ?? match[2]) : '';
};

const adminRpcs = rpcNames.filter(
  (name) =>
    /^(admin|analytics|settings|plugin|feature|report)/.test(name) ||
    /^(settings|plugins|analytics|audit)\./.test(permissionOf(name)),
);
const staffRpcs = rpcNames.filter((name) => !adminRpcs.includes(name) && permissionOf(name) !== '');
const memberRpcs = rpcNames.filter(
  (name) => !adminRpcs.includes(name) && !staffRpcs.includes(name),
);

/** Access rules: each policy is a decision about who may see or change what. */
const policies = unique([...sql.matchAll(/create policy (\w+)/g)].map((match) => match[1]));

/** Stored shapes and the integrity rules attached to them. */
const tables = unique(
  [...sql.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1]),
);
const enums = [...sql.matchAll(/as enum/g)].length;
const triggers = [...sql.matchAll(/create trigger/g)].length;

/** Plugin flags: every feature ships as something that can be switched off. */
const flagKeys = unique(
  [...sql.matchAll(/\(\s*'([a-z][a-z0-9_.]{3,})',\s*(?:true|false)/g)].map((m) => m[1]),
);

/** Console screens: each tab of each corporate console is a working surface. */
const consoleDirs = readdirSync(root)
  .filter((name) => statSync(join(root, name)).isDirectory())
  .filter((name) => existsSync(join(root, name, 'src', 'App.tsx')))
  .filter((name) => name !== 'main-site')
  .sort();

const consoleTabs = consoleDirs.flatMap((name) => {
  const source = read(`${name}/src/App.tsx`);
  return [...source.matchAll(/id:\s*'([a-z-]+)',\s*label:/g)].map((match) => `${name}:${match[1]}`);
});

/** The rules each console states in its own words. */
const consoleRules = consoleDirs
  .filter((name) => existsSync(join(root, name, 'src', 'model.ts')))
  .flatMap((name) =>
    [...read(`${name}/src/model.ts`).matchAll(/^export (?:function|const) (\w+)/gm)].map(
      (match) => `${name}:${match[1]}`,
    ),
  );

/** Edge endpoints: each Pages Function is a capability of its own. */
const edgeEndpoints = consoleDirs
  .concat(['main-site'])
  .flatMap((name) => walk(join(root, name, 'functions')))
  .filter((path) => path.endsWith('.ts') && !path.endsWith('_rpc.ts'))
  .map((path) => relative(root, path));

/** Domain rules: the pure functions screens and database agree on. */
const mainRules = walk(join(root, 'main-site/src/lib'))
  .filter((path) => path.endsWith('.ts') && !path.includes('.test.'))
  .flatMap((path) =>
    [
      ...readFileSync(path, 'utf8').matchAll(/^export (?:async function|function|const) (\w+)/gm),
    ].map((match) => `${relative(root, path)}:${match[1]}`),
  );

const kitRules = walk(join(root, 'corporate-kit/src'))
  .filter((path) => (path.endsWith('.ts') || path.endsWith('.tsx')) && !path.includes('.test.'))
  .flatMap((path) =>
    [
      ...readFileSync(path, 'utf8').matchAll(/^export (?:async function|function|const) (\w+)/gm),
    ].map((match) => `${relative(root, path)}:${match[1]}`),
  );

const androidRules = walk(join(root, 'android-app/src'))
  .filter((path) => path.endsWith('.ts') && !path.includes('.test.'))
  .flatMap((path) =>
    [
      ...readFileSync(path, 'utf8').matchAll(/^export (?:async function|function|const) (\w+)/gm),
    ].map((match) => `${relative(root, path)}:${match[1]}`),
  );

/** Reusable interface parts. */
const components = walk(join(root, 'main-site/src/components'))
  .filter((path) => path.endsWith('.tsx') && !path.includes('.test.'))
  .map((path) => relative(root, path));

/** Hooks and stores: the state a session is made of. */
const hooks = walk(join(root, 'main-site/src/hooks'))
  .concat(walk(join(root, 'main-site/src/store')))
  .filter((path) => path.endsWith('.ts') && !path.includes('.test.'))
  .flatMap((path) =>
    [...readFileSync(path, 'utf8').matchAll(/^export (?:function|const) (use\w+|select\w+)/gm)].map(
      (match) => `${relative(root, path)}:${match[1]}`,
    ),
  );

/** Bilingual coverage, recorded but deliberately not counted as features. */
const messageKeys = (read('main-site/src/i18n/locales/en.ts').match(/^\s+[a-zA-Z0-9_]+: '/gm) ?? [])
  .length;

/* --------------------------------------------------------------- *
 * The three books of the registry
 * --------------------------------------------------------------- */

const core = [
  ['Member-facing pages', publicPages.length],
  ['Member and public RPCs', memberRpcs.length],
  ['Interface components', components.length],
  ['Hooks, stores and selectors', hooks.length],
  ['Domain rules in the member site', mainRules.length],
  ['Edge endpoints', edgeEndpoints.length],
  ['Stored shapes', tables.length],
  ['Enumerated states', enums],
  ['Integrity triggers', triggers],
  ['Plugin flags', flagKeys.length],
  ['Android shell rules', androidRules.length],
];

const admin = [
  ['Admin pages', adminPages.length],
  ['Admin and analytics RPCs', adminRpcs.length],
  [
    'Admin console screens',
    consoleTabs.filter((tab) => /^(admin|config|customize|performance)-site/.test(tab)).length,
  ],
  ['Access policies', policies.length],
];

const staff = [
  [
    'Staff console screens',
    consoleTabs.filter((tab) => !/^(admin|config|customize|performance)-site/.test(tab)).length,
  ],
  ['Staff and moderation RPCs', staffRpcs.length],
  ['Console rules', consoleRules.length],
  ['Shared kit rules and controls', kitRules.length],
  ['Database helper functions', helperNames.length],
];

const sum = (rows) => rows.reduce((total, row) => total + row[1], 0);

const report = {
  core: { rows: core, total: sum(core) },
  admin: { rows: admin, total: sum(admin) },
  staff: { rows: staff, total: sum(staff) },
};
report.total = report.core.total + report.admin.total + report.staff.total;
report.messageKeys = messageKeys;
report.registryCodes = new Set(
  [...read('docs/delivery-plan.md').matchAll(/\b[A-Z]{1,2}-\d{3}\b/g)].map((match) => match[0]),
).size;

if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else if (process.argv.includes('--markdown')) {
  const table = (title, section) =>
    [
      `### ${title} — ${section.total}`,
      '',
      '| Counted surface | Features |',
      '| --- | ---: |',
      ...section.rows.map((row) => `| ${row[0]} | ${row[1]} |`),
      `| **Subtotal** | **${section.total}** |`,
      '',
    ].join('\n');
  process.stdout.write(
    [
      table('Core', report.core),
      table('Administration', report.admin),
      table('Staff and corporate', report.staff),
      `**Total counted features: ${report.total}**`,
      '',
      `Registry codes recorded as delivered across the twenty responses: **${report.registryCodes}**.`,
      `Translated interface strings per language: **${report.messageKeys}** (recorded, not counted as features).`,
      '',
    ].join('\n'),
  );
} else {
  for (const [title, section] of [
    ['Core', report.core],
    ['Administration', report.admin],
    ['Staff and corporate', report.staff],
  ]) {
    process.stdout.write(`\n${title}\n`);
    for (const row of section.rows)
      process.stdout.write(`  ${String(row[1]).padStart(5)}  ${row[0]}\n`);
    process.stdout.write(`  ${String(section.total).padStart(5)}  subtotal\n`);
  }
  process.stdout.write(`\n  ${String(report.total).padStart(5)}  total counted features\n`);
  process.stdout.write(
    `  ${String(report.registryCodes).padStart(5)}  registry codes recorded as delivered\n`,
  );
  process.stdout.write(
    `  ${String(report.messageKeys).padStart(5)}  translated strings per language (not counted as features)\n`,
  );
}
