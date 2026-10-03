#!/usr/bin/env node
/**
 * Fails a deployment loudly when a required build variable is missing.
 *
 * Vite compiles an unset VITE_* value in as `undefined` and the build still
 * succeeds, so a forgotten secret never fails CI — it fails in the visitor's
 * browser, at the first data call, as a 401. This turns that silent runtime
 * breakage into an honest build failure: the deploy stops here, naming the
 * variables it could not find.
 *
 * Used by deploy.yml, not by ci.yml — CI deliberately builds every app with
 * the variables absent to prove the code compiles without configuration.
 *
 *   BSDC_REQUIRED_ENV=VITE_A,VITE_B node scripts/check-deploy-env.mjs
 *
 * Exit 1 (with a ::error:: annotation) when any named variable is unset or
 * empty; exit 0 when all are present.
 */

const required = (process.env['BSDC_REQUIRED_ENV'] ?? '')
  .split(',')
  .map((name) => name.trim())
  .filter((name) => name.length > 0);

if (required.length === 0) {
  process.stderr.write(
    '::error::check-deploy-env was given nothing to check (BSDC_REQUIRED_ENV is empty); the workflow is misconfigured.\n',
  );
  process.exit(1);
}

const missing = required.filter((name) => (process.env[name] ?? '').trim() === '');

if (missing.length > 0) {
  process.stderr.write(
    `::error::refusing to deploy: ${missing.length} required build variable(s) are missing: ` +
      `${missing.join(', ')}. A build without them compiles but fails in the browser. ` +
      'Set them under GitHub → Settings → Secrets and variables → Actions, then re-run the deploy.\n',
  );
  process.exit(1);
}

process.stdout.write(`all ${required.length} required build variables are present.\n`);
