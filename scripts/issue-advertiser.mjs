#!/usr/bin/env node
/**
 * Issue an advertiser their account.
 *
 * An advertiser does not sign up. Staff create the campaign, staff issue the
 * credentials, and from then on the advertiser signs in to a console that shows
 * their own numbers and nobody else's.
 *
 *      SUPABASE_URL=https://… \
 *      SUPABASE_SERVICE_ROLE_KEY=… \
 *      SUPABASE_STAFF_EMAIL=ops@bsdc.info.bd \
 *      SUPABASE_STAFF_PASSWORD=… \
 *      node scripts/issue-advertiser.mjs \
 *        --name "Winter Intake Co" --email ads@example.test --generate
 *
 * The work itself is in `advertiser-issuing.mjs`, because that is the part with
 * decisions in it and it is proved by `main-site/scripts/db-prove/t52.mjs`
 * without a network. This file is the shell around it: read the arguments,
 * refuse the ones that are wrong, print what happened, and never print a
 * password that was not generated here.
 */
import { IssueError, SIGN_IN_URL, generatedPassword, issueAdvertiser, optionProblems, parseArgs } from './advertiser-issuing.mjs';

const HELP = [
  'Issue an advertiser account.',
  '',
  '  node scripts/issue-advertiser.mjs --name "Company" --email a@b.test --generate',
  '  node scripts/issue-advertiser.mjs --name "Company" --email a@b.test --password "…"',
  '',
  'Options:',
  '  --name      the name the advertiser is known by (required)',
  '  --email     the address they sign in with (required)',
  '  --password  set this password; it is never printed',
  '  --generate  make a password and print it once, to hand over in person',
  '  --username  a handle, if the derived one is not wanted',
  '  --dry-run   check the arguments and the environment, change nothing',
  '',
  'Environment: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,',
  '             SUPABASE_STAFF_EMAIL, SUPABASE_STAFF_PASSWORD.',
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

const problems = optionProblems(options);
if (problems.length > 0) {
  console.error(`\n${problems.join('\n')}\n\n${HELP}`);
  process.exit(2);
}

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('\nSUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.\n');
  process.exit(2);
}

if (options.dryRun) {
  console.log('Arguments and environment look right. Nothing was changed.');
  console.log(`Would issue an account for ${options.email} (${options.name.trim()}).`);
  process.exit(0);
}

try {
  const result = await issueAdvertiser({
    fetch,
    url,
    serviceKey,
    staffEmail: process.env.SUPABASE_STAFF_EMAIL,
    staffPassword: process.env.SUPABASE_STAFF_PASSWORD,
    options,
    password: options.generate ? generatedPassword() : options.password,
    log: (line) => console.log(line),
  });

  console.log('');
  console.log(`Advertiser:  ${options.name.trim()} (@${result.username})`);
  console.log(`Signs in at: ${SIGN_IN_URL}`);
  console.log(`With:        ${options.email}`);
  if (result.generated !== null) {
    console.log(`Password:    ${result.generated}`);
    console.log('             Shown once. Hand it over and ask them to change it.');
  }
  console.log(
    `Profile:     ${result.profileCreated ? 'created' : 'already existed, left alone'}`,
  );
  console.log('');
  console.log('Next: set up their campaign in the admin panel, under Campaigns.');
} catch (error) {
  const message = error instanceof IssueError ? error.message : `Unexpected: ${error.message}`;
  console.error(`\nNot issued: ${message}`);
  process.exit(1);
}
