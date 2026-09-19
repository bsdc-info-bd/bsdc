/**
 * BSDC — public/OneSignalSDKWorker.js
 * Purpose : OneSignal web SDK service worker entry (manual broadcast desk only).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : This is a static file served by Cloudflare Pages. It is not a Cloudflare Worker
 *   and contains no request-time logic (ADR-036). OneSignal is used for admin-composed
 *   manual broadcasts only (LAW-09). Automatic member push is Firebase Cloud Messaging
 *   through public/firebase-messaging-sw.js, the PWA shell worker, and Capacitor native.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
/* global importScripts */
importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');
