# BSDC legal-document acceptance architecture

> **Release boundary:** The bundled Terms of Use and Privacy Notice are product text, not a substitute for jurisdiction-specific legal advice. An authorized BSDC owner and qualified counsel must review, approve, publish, and maintain the documents before a production legal launch.

## What is implemented

The native app carries two versioned documents in `LegalDocuments.kt`:

| Document | Firestore document ID | Current version |
| --- | --- | --- |
| BSDC Terms of Use | `terms-2026-09-30` | `2026-09-30` |
| BSDC Privacy Notice | `privacy-2026-09-30` | `2026-09-30` |

They can be reviewed in English or Bangla. A new email/password account must explicitly check the acceptance statement. OAuth accounts and existing accounts see an authenticated full-screen gate before they can enter the community. The gate requires both current documents, gives a member access to their complete text, offers a sign-out route, and does not treat a local device preference as acceptance.

On acceptance, the app creates these two immutable records:

```text
profiles/{uid}/legalAcceptances/{documentId}
  documentId: string
  documentVersion: string
  acceptedAt: server timestamp
  locale: "en" | "bn"
  source: "android_native"
```

Firestore Rules only permit the signed-in account to create one of the exact current document IDs and versions with `acceptedAt == request.time`. They forbid changing or deleting the record. This gives an account-bound version/time audit record; it does **not** prove that a person read every word or establish legal validity in a particular jurisdiction.

## Trusted authorization bridge

A client-created Firestore record alone must not unlock backend access. The trusted `grantLegalAccessAfterAcceptance` Firebase Function checks that *both* immutable records have the exact current values, then sets the Firebase Authentication custom claim:

```text
legalAcceptanceVersion: "2026-09-30"
```

The Android client calls the trusted `refreshCurrentLegalAccess` callable and forces a bounded token refresh before leaving the gate. The callable independently re-reads both immutable records and is also the repair path for members who accepted while Functions was not deployed. Firestore and Realtime Database rules require the claim for community writes and private community reads. This blocks a client from bypassing the Compose gate through direct Firebase SDK calls. The Function preserves existing custom claims, including trusted staff roles.

The Functions are deployed with the normal Firebase backend deployment. A reviewed backend-source push on the protected Arena branch deploys Rules, indexes, Realtime Database policy, and Functions together; a manual deployment is also available for controlled operations. Until the Functions are deployed and able to set custom claims, acceptance remains pending rather than granting misleading access.

## Version changes

Never edit substantive document text in place. For a material change:

1. Obtain owner/counsel review and approval.
2. Add new document IDs and versions to `LegalDocuments.kt`.
3. Update the exact IDs/versions in Firestore Rules and `functions/src/index.ts` together.
4. Deploy Rules and Functions before releasing the app version that references them.
5. Verify a test account receives the new custom claim and must accept the new versions.

A new version deliberately blocks community writes until the trusted bridge issues the replacement claim.

## Current lifecycle boundary

This slice truthfully implements versioned access consent. It does **not** yet provide a self-service complete account export or erasure workflow. A real lifecycle implementation needs authenticated request handling, retention/deletion schedules, Cloudinary object lifecycle handling, Firebase Auth deletion sequencing, message/report safety holds, legal review, and support operations. The Privacy Notice calls that limitation out rather than claiming a non-existent right or delete button.
