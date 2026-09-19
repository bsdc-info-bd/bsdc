/**
 * BSDC — scripts/check-rtdb.mjs
 * Purpose : Static gate over the Realtime Database rules (database.rules.json).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The Realtime Database holds the ephemeral plane — presence, typing, receipts, fan-out,
 *   live counters. It is the one place where a wrong rule leaks who is online to whom, so the same
 *   discipline that guards firestore.rules guards this file: default deny at the root, a rule for
 *   every path the client actually touches, and no node anybody may write to unconditionally.
 *   This is a static gate, not an emulator run. It catches the failures that would otherwise reach
 *   production silently — a path with no rule, which the default deny turns into a confusing
 *   permission error at three in the morning, and a write rule of `true`, which is worse. The
 *   behavioural suite that exercises each path against the emulator needs a Java runtime; where
 *   that is unavailable this gate is what stands between a mistake and a release.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Reads the path registry without importing TypeScript: the file is small and stable, and a regex
 * over it keeps this gate runnable with nothing but node.
 * @param source the contents of src/core/config/collections.ts
 * @returns the Realtime Database roots
 */
function readRtdbPaths(source) {
  const block = /export const RTDB_PATHS = \{([\s\S]*?)\n\} as const;/.exec(source);
  if (block === null || block[1] === undefined) {
    return [];
  }
  return [...block[1].matchAll(/^\s*([A-Za-z][A-Za-z0-9]*):\s*'([^']+)'/gm)].map(
    (match) => match[2],
  );
}

/**
 * Paths only a Cloud Function may write. The gate checks that each one says so explicitly, or
 * leaves the write unset and inherits the root deny — either is safe, a permissive rule is not.
 */
const SERVER_WRITTEN = new Set(['liveCounters', 'liveEvents']);

const problems = [];

let document;
try {
  document = JSON.parse(readFileSync(join(root, 'database.rules.json'), 'utf8'));
} catch (error) {
  console.error('[bsdc] database.rules.json is not valid JSON:', error.message);
  process.exit(1);
}

const rules = document.rules;
if (rules === undefined || typeof rules !== 'object') {
  console.error('[bsdc] database.rules.json has no "rules" object at its root.');
  process.exit(1);
}

// 1. Default deny. The Realtime Database cascades, so a permissive root is a permissive database.
if (rules['.read'] !== false) {
  problems.push('the root must deny reads (".read": false) so every grant is deliberate');
}
if (rules['.write'] !== false) {
  problems.push('the root must deny writes (".write": false) so every grant is deliberate');
}

// 2. Every path the client uses has a rule.
const configured = readRtdbPaths(
  readFileSync(join(root, 'src/core/config/collections.ts'), 'utf8'),
);
if (configured.length === 0) {
  problems.push('no RTDB_PATHS could be read from src/core/config/collections.ts');
}
for (const path of configured) {
  if (!(path in rules)) {
    problems.push(`path "${path}" has no rule; the root deny would refuse it silently`);
  }
}

// 3. No unconditional write anywhere, and no rule that lets anybody read a private plane.
/**
 * Walks the rule tree looking for rules that are simply true.
 * @param node current node
 * @param path path so far
 */
function walk(node, path) {
  for (const [key, value] of Object.entries(node)) {
    if (key === '.write' && value === true) {
      problems.push(`${path || '/'}: an unconditional ".write": true`);
      continue;
    }
    if (key === '.write' && typeof value === 'string') {
      const rule = value.replace(/\s+/g, ' ').trim();
      if (rule === 'true') {
        problems.push(`${path || '/'}: a write rule that evaluates to true`);
      }
      if (!rule.includes('auth') && !rule.includes('$')) {
        problems.push(`${path || '/'}: a write rule that never checks who is writing`);
      }
    }
    if (key === '.read' && value === true) {
      problems.push(`${path || '/'}: an unconditional ".read": true`);
    }
    if (key.startsWith('.')) {
      continue;
    }
    if (typeof value === 'object' && value !== null) {
      walk(value, `${path}/${key}`);
    }
  }
}
walk(rules, '');

// 4. Paths only a Cloud Function may write still need their write rule to say so.
for (const path of SERVER_WRITTEN) {
  const node = rules[path];
  if (node === undefined) {
    continue;
  }
  if ('.write' in node && node['.write'] !== false) {
    problems.push(
      `"${path}" is written only by a server; its ".write" must be false or absent, not permissive`,
    );
  }
}

// 5. Every leaf that stores a value should validate it, or say why not.
/**
 * Walks the tree and reports nodes with no validate rule at all.
 * @param node current node
 * @param path path so far
 * @param depth how deep the node is
 */
function walkValidate(node, path, depth) {
  if (depth > 2) {
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('.')) {
      continue;
    }
    if (typeof value !== 'object' || value === null) {
      continue;
    }
    const hasOwn = Object.keys(value).some((child) => child === '.validate');
    if (!hasOwn && depth >= 1 && !key.startsWith('$')) {
      problems.push(`${path}/${key}: no ".validate" and no wildcard child to catch the rest`);
    }
    walkValidate(value, `${path}/${key}`, depth + 1);
  }
}
walkValidate(rules, '', 0);

if (problems.length > 0) {
  console.error('[bsdc] Realtime Database rules failed the static gate:');
  for (const problem of problems) {
    console.error(`  - ${problem}`);
  }
  process.exit(1);
}

console.info(
  `[bsdc] rtdb rules clean: ${configured.length} path(s) covered, root denies by default, no unconditional write.`,
);
