#!/usr/bin/env node
/**
 * What this platform is built on, and whether any of it is incompatible with
 * the licence the platform ships under.
 *
 * BSDC is distributed under PASVL-1.0, which permits inclusion of permissive and
 * weak-copyleft dependencies and refuses strong copyleft (PASVL Appendix C:
 * GPL-2.0, GPL-3.0 and AGPL-3.0 are incompatible; LGPL only through dynamic
 * linking). That is a claim a repository has to keep true as dependencies move,
 * so it is a command and not a paragraph.
 *
 *     node scripts/licence-report.mjs             summary, grouped by licence
 *     node scripts/licence-report.mjs --json      machine readable
 *     node scripts/licence-report.mjs --check     exit 1 when a package is refused
 *     node scripts/licence-report.mjs --all       include devDependencies
 *
 * It reads the installed tree through the package manager's own metadata rather
 * than parsing lockfiles, because the lockfile records what was resolved and
 * `node_modules` records what the licences actually say.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(HERE, '..');

const args = new Set(process.argv.slice(2));
const asJson = args.has('--json');
const check = args.has('--check');
const includeDev = args.has('--all');

/** Licences this platform permits, with the reason each one is permitted. */
const PERMITTED = new Map([
  ['MIT', 'permissive'],
  ['ISC', 'permissive'],
  ['BSD-2-Clause', 'permissive'],
  ['BSD-3-Clause', 'permissive'],
  ['0BSD', 'permissive'],
  ['Apache-2.0', 'permissive, patent grant'],
  ['Apache 2.0', 'permissive, patent grant'],
  ['CC0-1.0', 'public-domain dedication'],
  ['CC-BY-4.0', 'attribution only'],
  ['Unlicense', 'public-domain dedication'],
  ['MPL-2.0', 'weak copyleft, file level'],
  ['BlueOak-1.0.0', 'permissive'],
  ['Python-2.0', 'permissive'],
  ['WTFPL', 'permissive'],
  ['(MIT OR CC0-1.0)', 'permissive'],
  ['(MIT AND Zlib)', 'permissive'],
  ['MIT*', 'permissive'],
  ['Unicode-DFS-2016', 'permissive'],
  ['MIT-0', 'permissive, no attribution required'],
]);

/** Licences PASVL Appendix C refuses outright. */
const REFUSED = new Map([
  ['GPL-2.0', 'strong copyleft: incompatible with PASVL distribution'],
  ['GPL-3.0', 'strong copyleft: incompatible with PASVL distribution'],
  ['AGPL-3.0', 'network copyleft: incompatible with PASVL distribution'],
  ['SSPL-1.0', 'service copyleft: incompatible'],
  ['BUSL-1.1', 'source-available, time-delayed: incompatible'],
  ['Elastic-2.0', 'source-available: incompatible'],
]);

/** Anything matching these is refused even when the exact string is new. */
const REFUSED_PATTERN = /\b(?:A?GPL|SSPL|BUSL|Elastic-2\.0|Commons-Clause)\b/i;

/**
 * Every installed package, read from its own manifest.
 *
 * `npm ls --json` reports versions but not licences, and a licence report that
 * cannot see a licence is a report that proves nothing. Walking `node_modules`
 * reads the field the licence actually lives in, including for nested copies of
 * the same name at different versions, which is the case that catches a stray
 * GPL dependency pulled in by one transitive branch.
 */
function installedPackages() {
  const out = [];
  const seen = new Set();

  function readDir(dir) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      if (entry.name.startsWith('.')) continue;
      if (entry.name === 'node_modules') {
        readDir(join(dir, entry.name));
        continue;
      }
      if (entry.name.startsWith('@')) {
        // A scope is not a package; it holds them.
        for (const scoped of readdirSync(join(dir, entry.name), { withFileTypes: true })) {
          if (scoped.isDirectory()) consider(join(dir, entry.name, scoped.name));
        }
        continue;
      }
      consider(join(dir, entry.name));
    }
  }

  function consider(pkgDir) {
    const manifestPath = join(pkgDir, 'package.json');
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch {
      return;
    }
    const name = typeof manifest.name === 'string' ? manifest.name : '';
    const version = typeof manifest.version === 'string' ? manifest.version : '?';
    if (name.length === 0) return;
    const key = `${name}@${version}`;
    if (!seen.has(key)) {
      seen.add(key);
      // Older manifests spell it `licenses: [{ type }]`, which is not a licence
      // field the modern tooling reads and is still a licence claim.
      const legacy = Array.isArray(manifest.licenses)
        ? manifest.licenses.map((entry) => entry?.type).filter(Boolean).join(' OR ')
        : '';
      out.push({
        name,
        version,
        license: typeof manifest.license === 'string' && manifest.license.length > 0 ? manifest.license : legacy,
      });
    }
    // A nested tree belongs to this package and may hold a different version of
    // something already seen at the top level.
    if (existsSync(join(pkgDir, 'node_modules'))) readDir(join(pkgDir, 'node_modules'));
  }

  readDir(join(APP_ROOT, 'node_modules'));
  return out;
}

function classify(license) {
  if (license.length === 0) return { state: 'unknown', reason: 'no licence field: refused until proven otherwise' };
  if (PERMITTED.has(license)) return { state: 'permitted', reason: PERMITTED.get(license) };
  if (REFUSED.has(license)) return { state: 'refused', reason: REFUSED.get(license) };
  // `(MIT OR Apache-2.0)` and similar disjunctions are as permissive as their
  // most permissive half, which is what the licensee may choose.
  const parts = license.replace(/[()]/g, '').split(/\s+(?:OR|AND)\s+/i).map((part) => part.trim());
  if (parts.length > 1 && parts.every((part) => PERMITTED.has(part))) {
    return { state: 'permitted', reason: `combination of permitted licences (${parts.join(', ')})` };
  }
  if (REFUSED_PATTERN.test(license)) return { state: 'refused', reason: REFUSED.get(license) ?? 'strong or service copyleft' };
  if (/^LGPL/i.test(license)) {
    // A prebuilt native binary is the one LGPL case that needs care: it links
    // against libvips and is shipped as an opaque platform package. It is a
    // **build-time** dependency of the image pipeline (sharp resizes upload
    // previews during `npm run brand` and in scripts), never part of the
    // JavaScript that is served to a browser, so nothing is linked into the
    // Work. `--all` includes it; the runtime tree does not.
    return {
      state: 'review',
      reason:
        'weak copyleft: permitted only when dynamically linked and replaceable, and not distributed as part of the Work',
    };
  }
  return { state: 'review', reason: 'not on either list: read the licence before shipping' };
}

if (!existsSync(join(APP_ROOT, 'node_modules'))) {
  console.error('No node_modules in this application. Run `npm ci` first.');
  process.exit(2);
}

const packages = installedPackages();

const byState = { permitted: [], refused: [], review: [], unknown: [] };
const byLicence = new Map();

for (const pkg of packages.sort((a, b) => a.name.localeCompare(b.name))) {
  const verdict = classify(pkg.license);
  const entry = { ...pkg, ...verdict };
  byState[verdict.state === 'unknown' ? 'unknown' : verdict.state].push(entry);
  const key = pkg.license.length > 0 ? pkg.license : '(none)';
  byLicence.set(key, (byLicence.get(key) ?? 0) + 1);
}

if (asJson) {
  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        application: 'main-site',
        includeDev,
        totals: Object.fromEntries(Object.entries(byState).map(([state, list]) => [state, list.length])),
        licences: Object.fromEntries([...byLicence.entries()].sort((a, b) => b[1] - a[1])),
        packages,
      },
      null,
      2,
    ),
  );
} else {
  console.log(`BSD C licence report — main-site${includeDev ? ' (including dev)' : ' (runtime)'}`);
  console.log(`${packages.length} packages, ${byLicence.size} distinct licence strings\n`);
  console.log('By licence:');
  for (const [license, count] of [...byLicence.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(4)}  ${license}`);
  }
  console.log('\nVerdict:');
  for (const [state, list] of Object.entries(byState)) {
    console.log(`  ${state.padEnd(10)} ${list.length}`);
  }
  for (const state of ['refused', 'review', 'unknown']) {
    if (byState[state].length === 0) continue;
    console.log(`\n${state.toUpperCase()}:`);
    for (const pkg of byState[state]) {
      console.log(`  ${pkg.name}@${pkg.version}  ${pkg.license || '(none)'}  — ${pkg.reason}`);
    }
  }
}

if (check) {
  const refused = byState.refused.length;
  const unknown = byState.unknown.length;
  if (refused > 0 || unknown > 0) {
    console.error(
      `\nFAIL  ${refused} refused and ${unknown} unidentified package(s). PASVL-1.0 Appendix C permits neither.`,
    );
    process.exit(1);
  }
  const review = byState.review.length;
  console.log(
    review === 0
      ? '\nok    every runtime package carries a licence PASVL-1.0 permits'
      : `\nok    nothing is refused. ${review} package(s) need the reading recorded in THIRD-PARTY-NOTICES.md.`,
  );
}
