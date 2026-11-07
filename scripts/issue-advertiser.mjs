#!/usr/bin/env node
/** Staff issue member-site credentials using Firebase and a permission-checked profile RPC. */
import {
  IssueError,
  SIGN_IN_URL,
  configurationProblems,
  issueAdvertiser,
  optionProblems,
  parseArgs,
} from './advertiser-issuing.mjs';

const HELP = [
  'Issue an advertiser account in the member Firebase project.',
  '',
  '  node scripts/issue-advertiser.mjs --name "Company" --email a@b.test --generate',
  '',
  'Options:',
  '  --name       advertiser name (required)',
  '  --email      member-site sign-in address (required)',
  '  --generate   generate a password, printed once for a newly created account',
  '  --password   use a supplied password (avoid shell history; prefer --generate)',
  '  --username   preferred handle, optional',
  '  --dry-run    validate arguments and configuration without network requests',
  '',
  'Environment: SUPABASE_URL, SUPABASE_ANON_KEY (or VITE_SUPABASE_PUBLISHABLE_KEY),',
  '  VITE_FB2_API_KEY, BSDC_STAFF_EMAIL, BSDC_STAFF_PASSWORD,',
  '  FIREBASE_SERVICE_ACCOUNT_BSDC_BD (member-project service-account JSON).',
].join('\n');

let options;
try {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(HELP);
    process.exit(0);
  }
  options = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(`\n${error.message}\n\n${HELP}`);
  process.exit(2);
}

let serviceAccount = null;
try {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_BSDC_BD ?? 'null');
} catch {
  console.error('FIREBASE_SERVICE_ACCOUNT_BSDC_BD must be valid service-account JSON.');
  process.exit(2);
}
const config = {
  databaseUrl: process.env.SUPABASE_URL,
  publishableKey: process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  staffApiKey: process.env.VITE_FB2_API_KEY,
  staffEmail: process.env.BSDC_STAFF_EMAIL,
  staffPassword: process.env.BSDC_STAFF_PASSWORD,
  serviceAccount,
  expectedProject: 'bsdc-bd',
};
const problems = [...optionProblems(options), ...configurationProblems(config)];
if (problems.length > 0) {
  console.error(`\n${problems.join('\n')}\n\n${HELP}`);
  process.exit(2);
}
if (options.dryRun) {
  console.log(
    `Configuration looks right. Would issue an account for ${options.email}; nothing changed.`,
  );
  process.exit(0);
}

try {
  const result = await issueAdvertiser({
    fetch,
    ...config,
    options,
    log: (line) => console.log(line),
  });
  console.log(`\nAdvertiser:  ${options.name.trim()} (@${result.username ?? 'no handle'})`);
  console.log(`Signs in at: ${SIGN_IN_URL}`);
  console.log(`With:        ${options.email}`);
  if (result.generated !== null) {
    console.log(`Password:    ${result.generated}`);
    console.log('             Shown once. Deliver securely and ask them to change it.');
  } else if (!result.createdAuth) {
    console.log('Password:    existing Firebase password; it was not changed.');
  }
  console.log(`Profile:     ${result.profileCreated ? 'created' : 'already existed, left alone'}`);
  if (result.createdAuth)
    console.log('Email:       not yet verified; the advertiser should verify it after sign-in.');
  console.log('\nNext: set up their campaign in the admin panel, under Campaigns.');
} catch (error) {
  const message =
    error instanceof IssueError ? error.message : 'Unexpected issue while issuing the account.';
  console.error(`\nNot issued: ${message}`);
  process.exit(1);
}
