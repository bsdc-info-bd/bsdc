# BSDC Security & Secrets Policy (brief §12)

## Repository visibility — ACTION REQUIRED

`github.com/bsdc-info-bd/bsdc` is currently **public**. The brief strongly
recommends private given the credentials involved. Recommendation before
Phase 1 ships any Firebase wiring that references real identifiers:

- Switch the repo to private (Settings → General → Danger Zone), **or**
- confirm every value that will ever touch this repo is client-safe-only.

This build obeys rule 6 of the checklist regardless of repo visibility:
nothing server-side secret is ever committed.

## What lives where

| Value                                   | Client bundle   | Repo (`.env`)           | Cloud Function env | Notes                                                                  |
| --------------------------------------- | --------------- | ----------------------- | ------------------ | ---------------------------------------------------------------------- |
| Firebase web config (apiKey, etc.)      | Yes (by design) | Local only (gitignored) | n/a                | Safe only with Firestore/Storage rules + App Check enforced.           |
| Cloudinary cloud name + unsigned preset | Yes             | Local only              | n/a                | Client-safe subset.                                                    |
| Cloudinary API key/secret               | Never           | Never                   | Yes                | Server-side ops only (delete/re-process).                              |
| OneSignal App ID                        | Yes             | Local only              | n/a                | Client-safe.                                                           |
| OneSignal REST API key                  | Never           | Never                   | Yes                | All sends go through the Cloud Function (Phase 4).                     |
| ImgBB key                               | Never           | Never                   | Yes (proxy)        | Repo is public → treat as server-only.                                 |
| Admin credentials                       | Never           | Never                   | n/a                | Roles are Firebase custom claims on Auth UIDs — never a code constant. |

## Commit-time guarantees enforced by this repo

1. `.gitignore` excludes `.env*`; only `.env.example` (placeholders) is
   committed.
2. `import.meta.env` is accessed exclusively through `src/lib/env.ts`, which
   only declares client-safe variables. Any new variable must be added there
   and classified client-safe vs server-only in review.
3. CI's build job runs **without** env files to prove the pipeline stays
   green secret-free; Phase 1 adds a grep gate for key patterns in `dist/`.
4. Admin access can never be implemented as a password check in app code —
   custom claims only (checked in review; enforced from Phase 1).

## Rotation status

The brief (Appendix F) shared Firebase client identifiers, Cloudinary cloud
name/preset, and the OneSignal App ID in this chat. These are all
client-safe-by-design values, not secrets — rotation not required. The
genuinely secret values (Cloudinary API secret, OneSignal REST key, ImgBB
key, SMTP credentials) were **not** shared and must only ever be entered in
Firebase Cloud Function config or the Cloudflare Pages dashboard. If any of
those is ever pasted into a chat, document, or this repo, rotate it before
launch.

## Rules-as-code cadence

From Phase 1 onward, every collection's `firestore.rules` / `storage.rules`
entry lands in the same commit as its schema, with allow/deny tests, before
the feature using it can be marked shipped.
