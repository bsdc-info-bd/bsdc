#!/usr/bin/env node
/**
 * BSDC — scripts/check-rules.mjs
 * Purpose : Static gate over firestore.rules: every collection the client can reach has a rule,
 *   the file is structurally balanced, and no write is unconditional.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The real test of a rules file is the emulator, and that needs Java, so it runs in CI
 *   rather than here. What this script catches is the failure that would otherwise ship silently:
 *   a collection added to src/core/config/collections.ts and never given a rule. An unmatched
 *   collection falls through to the catch-all deny, which means a feature works in development and
 *   fails in production, in front of a person.
 *   It also refuses `allow write: if true` anywhere, because a rule that lets anybody write
 *   anything is not a rule (LAW-03).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const rules = readFileSync(resolve(root, 'firestore.rules'), 'utf8');
const collectionsSource = readFileSync(resolve(root, 'src/core/config/collections.ts'), 'utf8');

const problems = [];

// ------------------------------------------------------------------ structure
let braceDepth = 0;
let parenDepth = 0;
rules.split('\n').forEach((line, index) => {
  const code = line.replace(/\/\/.*$/u, '');
  for (const character of code) {
    if (character === '{') {
      braceDepth += 1;
    }
    if (character === '}') {
      braceDepth -= 1;
    }
    if (character === '(') {
      parenDepth += 1;
    }
    if (character === ')') {
      parenDepth -= 1;
    }
  }
  if (braceDepth < 0) {
    problems.push(`line ${index + 1}: closing brace with nothing open`);
  }
  if (parenDepth < 0) {
    problems.push(`line ${index + 1}: closing parenthesis with nothing open`);
  }
});

if (braceDepth !== 0) {
  problems.push(`unbalanced braces: ${braceDepth} left open`);
}
if (parenDepth !== 0) {
  problems.push(`unbalanced parentheses: ${parenDepth} left open`);
}

const singleQuotes = (rules.match(/'/gu) ?? []).length;
if (singleQuotes % 2 !== 0) {
  problems.push('an odd number of single quotes: a string is unterminated');
}

// ------------------------------------------------------------------ coverage
/**
 * Reads the string values out of a `key: 'value',` object literal in the collections registry.
 * @param name name of the registry group
 * @returns the collection names it declares
 */
function readGroup(name) {
  const start = collectionsSource.indexOf(`${name} = {`);
  if (start === -1) {
    return [];
  }
  const end = collectionsSource.indexOf('}', start);
  const body = collectionsSource.slice(start, end);
  return [...body.matchAll(/:\s*'([^']+)'/gu)].map((match) => match[1] ?? '');
}

const collections = readGroup('COLLECTIONS');
const subcollections = readGroup('SUBCOLLECTIONS');

if (collections.length === 0) {
  problems.push('could not read COLLECTIONS from the registry');
}

/** Collections owned entirely by Cloud Functions: no client rule is expected or wanted. */
const SERVER_ONLY = new Set(['rateLimits', 'passkeys', 'reputationEvents', 'auditLogs']);

for (const name of collections) {
  if (SERVER_ONLY.has(name)) {
    continue;
  }
  if (!rules.includes(`/${name}/{`)) {
    problems.push(`collection "${name}" has no rule; it would fall through to the catch-all deny`);
  }
}

for (const name of subcollections) {
  if (SERVER_ONLY.has(name)) {
    continue;
  }
  if (!rules.includes(`/${name}/{`)) {
    problems.push(
      `subcollection "${name}" has no rule; it would fall through to the catch-all deny`,
    );
  }
}

// ------------------------------------------------------------------ LAW-03
for (const match of rules.matchAll(/allow\s+([a-z, ]+):\s*if\s*true\s*;/gu)) {
  const verbs = match[1] ?? '';
  if (verbs.includes('write') || verbs.includes('create') || verbs.includes('update')) {
    problems.push(`unconditional ${verbs.trim()} allowed somewhere; LAW-03 requires a condition`);
  }
}

// The catch-all deny has to be the last rule, or it swallows everything beneath it.
const catchAll = rules.lastIndexOf('match /{document=**}');
const lastMatch = rules.lastIndexOf('match /');
if (catchAll === -1) {
  problems.push('no catch-all deny rule');
} else if (catchAll !== lastMatch) {
  problems.push('the catch-all deny is not the last rule in the file');
}

// ------------------------------------------------------------------ report
if (problems.length > 0) {
  console.error('[bsdc] firestore.rules failed the static gate:');
  for (const problem of problems) {
    console.error(`  - ${problem}`);
  }
  process.exit(1);
}

const covered = collections.filter((name) => !SERVER_ONLY.has(name)).length;
console.info(
  `[bsdc] rules clean: ${covered} collection(s) and ${subcollections.length} subcollection(s) covered, structure balanced, no unconditional write.`,
);
