#!/usr/bin/env node
/** Real command exit codes, per-package logs, no grep-based acceptance. */
import {
  readdirSync,
  readFileSync,
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
  writeFileSync,
} from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const outArg = args.find((arg) => arg.startsWith('--output='));
const output = resolve(outArg?.slice('--output='.length) ?? join(root, '.release-check'));
const selection = args
  .find((arg) => arg.startsWith('--apps='))
  ?.slice(7)
  .split(',');
const apps = readdirSync(root)
  .filter((name) => existsSync(join(root, name, 'package.json')))
  .sort();
if (selection?.some((app) => !apps.includes(app))) throw new Error('Unknown package in --apps');
mkdirSync(output, { recursive: true });
const results = [];
function run(app, gate, command, commandArgs) {
  const log = join(output, `${app}-${gate}.log`);
  const fd = openSync(log, 'w');
  let result;
  try {
    result = spawnSync(command, commandArgs, {
      cwd: join(root, app),
      stdio: ['ignore', fd, fd],
      timeout: 600_000,
    });
  } finally {
    closeSync(fd);
  }
  const ok = result.status === 0 && !result.error;
  results.push({ app, gate, ok, exitCode: result.status, error: result.error?.message, log });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${app}: ${gate} (${log})`);
  return ok;
}
const selected = apps.filter((name) => !selection || selection.includes(name));
// Consoles import shared source; dependencies must exist before their gates run.
const needsKit = selected.some((app) => {
  const config = join(root, app, 'tsconfig.json');
  return existsSync(config) && readFileSync(config, 'utf8').includes('@kit');
});
if (args.includes('--install') && needsKit && !selected.includes('corporate-kit')) {
  if (
    !run('corporate-kit', 'install', 'npm', [
      'install',
      '--no-audit',
      '--no-fund',
      '--package-lock=false',
    ])
  ) {
    process.exit(1);
  }
}
selected.sort((a, b) =>
  a === 'corporate-kit' ? -1 : b === 'corporate-kit' ? 1 : a.localeCompare(b),
);
for (const app of selected) {
  const pkg = JSON.parse(readFileSync(join(root, app, 'package.json'), 'utf8'));
  if (args.includes('--install')) {
    const locked = existsSync(join(root, app, 'package-lock.json'));
    if (
      !run(app, 'install', 'npm', [
        locked ? 'ci' : 'install',
        '--no-audit',
        '--no-fund',
        ...(locked ? [] : ['--package-lock=false']),
      ])
    )
      continue;
  }
  for (const gate of ['typecheck', 'lint', 'test', 'build']) {
    if (!pkg.scripts?.[gate]) {
      results.push({ app, gate, ok: false, error: 'Required gate missing' });
      console.log(`FAIL ${app}: missing ${gate}`);
      continue;
    }
    run(app, gate, 'npm', ['run', gate]);
  }
  run(app, 'format', 'npm', ['exec', '--no', '--', 'prettier', '--check', 'src/**/*.{ts,tsx,css}']);
  if (app === 'main-site') {
    run(app, 'functions-format', 'npm', [
      'exec',
      '--no',
      '--',
      'prettier',
      '--check',
      'functions/**/*.ts',
    ]);
    run(app, 'database', 'npm', ['run', 'db:prove']);
  }
}
writeFileSync(
  join(output, 'summary.json'),
  JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2),
);
const failed = results.filter((result) => !result.ok);
console.log(
  `${results.length - failed.length}/${results.length} gates passed. This is local evidence, not staging or production acceptance.`,
);
process.exitCode = failed.length ? 1 : 0;
