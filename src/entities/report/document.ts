/**
 * BSDC — src/entities/report/document.ts
 * Purpose : The record of an issued report, and the verdict a verifier reaches from it.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : A report is sealed on the device where it was generated, and that seal is worthless on
 *   its own: anybody can print a hash. What makes it worth something is a record, written by the
 *   server at the moment of issue, that says which hash belongs to which report id. The verifier
 *   compares the two and answers one of three things: confirmed, refused, or unknown.
 *   "Unknown" is a real answer and not a failure. A report issued while the device was offline has
 *   no record yet, and saying so plainly is better than dressing it up as a pass.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { hashesMatch } from '@/core/lib/report';

/** What a verifier concludes about a document. */
export type VerificationVerdict = 'confirmed' | 'refused' | 'unknown' | 'malformed';

/** The server-held record of an issued report. */
export interface ReportDocument {
  /** Equals the report id. */
  readonly id: string;
  readonly reportId: string;
  readonly kind: string;
  readonly title: string;
  /** Lower-case hex SHA-256 of the canonical payload. */
  readonly integrity: string;
  readonly generatedAt: string;
  readonly generatedByUid: string;
  /** How many rows the report carried, so a swapped page is visible at a glance. */
  readonly rowCount: number;
  readonly verificationUrl: string;
}

/**
 * Verifies a report against its record.
 * @param record the server-held record, or null when there is none
 * @param hash the hash supplied by the person checking
 * @returns the verdict
 */
export function verifyReportDocument(
  record: ReportDocument | null,
  hash: string,
): VerificationVerdict {
  const trimmed = hash.trim();
  if (trimmed.length === 0) return 'malformed';
  if (!/^[0-9a-f]{64}$/i.test(trimmed)) return 'malformed';
  if (record === null) return 'unknown';
  return hashesMatch(record.integrity, trimmed) ? 'confirmed' : 'refused';
}

/**
 * Explains a verdict in both languages, for the verification screen.
 * @param verdict the verdict
 * @returns the Bangla and English explanation
 */
export function verdictExplanation(verdict: VerificationVerdict): {
  readonly bn: string;
  readonly en: string;
} {
  const copy: Record<VerificationVerdict, { readonly bn: string; readonly en: string }> = {
    confirmed: {
      bn: 'এই নথিটি BSDC থেকে জারি হয়েছে এবং এর বিষয়বস্তু অপরিবর্তিত আছে।',
      en: 'This document was issued by BSDC and its contents are unchanged.',
    },
    refused: {
      bn: 'এই হ্যাশ আমাদের রেকর্ডের সাথে মেলেনি। নথিটি পরিবর্তন করা হয়েছে, অথবা হ্যাশটি ভুল কপি করা হয়েছে।',
      en: 'This hash does not match our record. The document was altered, or the hash was copied incorrectly.',
    },
    unknown: {
      bn: 'এই প্রতিবেদনের কোনো রেকর্ড আমরা খুঁজে পাইনি। এটি অফলাইনে তৈরি হলে সিঙ্ক হওয়ার পর আবার চেষ্টা করুন।',
      en: 'We hold no record of this report. If it was generated offline, try again once the device has synced.',
    },
    malformed: {
      bn: 'এটি একটি বৈধ প্রতিবেদন হ্যাশ নয়। হ্যাশটি ৬৪টি হেক্সাডেসিমেল অক্ষরের হয়।',
      en: 'That is not a valid report hash. A hash is 64 hexadecimal characters.',
    },
  };
  return copy[verdict];
}
