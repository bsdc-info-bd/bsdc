// BSDC — public/messaging-config.js
// Purpose : Public Firebase configuration for the messaging service worker.
// Owner   : RRC Development / BSDC Platform Team
// Notes   :
//   Written by tools/generate-messaging-config.mjs from VITE_* environment variables during
//   `npm run build`. The values are public by design — Firebase web configuration is not a secret
//   and the authority lives in Firestore rules and custom claims (LAW-03). No private key, service
//   account or pepper appears here, ever.
//   This file is generated. Edit the environment, not this file.
// Licence : Source-available. Re-deployment or rebranding is not permitted.

self.BSDC_MESSAGING_CONFIG = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  messagingSenderId: '',
  appId: '',
};
