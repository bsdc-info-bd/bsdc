#!/usr/bin/env node
/**
 * BSDC — tools/generate-messaging-config.mjs
 * Purpose : Writes the public Firebase configuration the messaging service worker imports.
 * Owner   : RRC Development / BSDC Platform Team
 * Usage   : node tools/generate-messaging-config.mjs
 * Notes   : A service worker cannot read `import.meta.env`, so the public Firebase options have to
 *   reach it through a static file. This script writes that file from the environment during the
 *   build, and only ever writes the five public strings — never a private key, a service account
 *   or a pepper. With no environment present it writes the empty configuration, which leaves the
 *   worker installed and messaging off, which is the correct state for a preview build.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, '..', 'public', 'messaging-config.js');

/** Reads one environment variable, tolerating a missing value. */
const read = (name) => process.env[name] ?? '';

/**
 * Serialises a public configuration value as a JavaScript string literal.
 * Single quotes keep the generated file byte-identical to `prettier --write`, so `npm run
 * format:check` passes before and after a build. A value that contains a quote, a backslash or a
 * control character falls back to JSON's escaping, which is what the language requires.
 */
const json = (value) => {
  const escaped = JSON.stringify(value);
  if (/['\\\n\r\t]/.test(value)) {
    return escaped;
  }
  return "'" + value + "'";
};

const body = `// BSDC — public/messaging-config.js
// Purpose : Public Firebase configuration for the messaging service worker.
// Owner   : RRC Development / BSDC Platform Team
// Notes   :
//   Written by tools/generate-messaging-config.mjs from VITE_* environment variables during
//   \`npm run build\`. The values are public by design — Firebase web configuration is not a secret
//   and the authority lives in Firestore rules and custom claims (LAW-03). No private key, service
//   account or pepper appears here, ever.
//   This file is generated. Edit the environment, not this file.
// Licence : Source-available. Re-deployment or rebranding is not permitted.

self.BSDC_MESSAGING_CONFIG = {
  apiKey: ${json(read('VITE_FIREBASE_API_KEY'))},
  authDomain: ${json(read('VITE_FIREBASE_AUTH_DOMAIN'))},
  projectId: ${json(read('VITE_FIREBASE_PROJECT_ID'))},
  messagingSenderId: ${json(read('VITE_FIREBASE_MESSAGING_SENDER_ID'))},
  appId: ${json(read('VITE_FIREBASE_APP_ID'))},
};
`;

await writeFile(target, body, 'utf8');
console.log('[bsdc] messaging config written to public/messaging-config.js');
