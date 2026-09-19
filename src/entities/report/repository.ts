/**
 * BSDC — src/entities/report/repository.ts
 * Purpose : Issuing a report and checking one.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Issuing goes through a Cloud Function, because the record that makes a report verifiable
 *   has to be written by something the person holding the PDF cannot also edit. The client sends the
 *   id and the hash; the server stores them against the issuing account and the instant it saw them.
 *   Checking is a plain read and needs no standing at all — a verification page that required a
 *   sign-in would not be a verification page anybody could use.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { COLLECTIONS } from '@/core/config/collections';
import { AppError } from '@/core/errors/AppError';
import { firestoreDb } from '@/services/firebase/app';
import { callFunction } from '@/services/backend/callable';
import { canSeal, type SealedReport } from '@/core/lib/report';
import type { ReportDocument } from './document';
import type { ReportPayload } from '@/core/lib/report';

/**
 * Registers an issued report so that it can be verified later.
 * @param report the sealed report
 * @param payload the content it was sealed from
 * @returns the stored record's id
 */
export async function issueReport(report: SealedReport, payload: ReportPayload): Promise<string> {
  if (!canSeal()) {
    throw new AppError('BSDC-REPORT-003', { reportId: report.reportId });
  }
  const result = await callFunction('registerReport', {
    reportId: report.reportId,
    kind: payload.kind,
    title: payload.title,
    integrity: report.integrity,
    generatedAt: report.generatedAt,
    rowCount: payload.rows.length + payload.totals.length,
    verificationUrl: report.verificationUrl,
  });
  return result.reportId;
}

/**
 * Reads the record of an issued report. This read is public: the rules allow it without a session,
 * because a verification page that required signing in would verify nothing for anybody else.
 * @param reportId the report id
 * @returns the record, or null when nothing has been registered under that id
 */
export async function fetchReportDocument(reportId: string): Promise<ReportDocument | null> {
  const trimmed = reportId.trim();
  if (trimmed.length === 0) return null;
  try {
    const { doc, getDoc } = await import('firebase/firestore');
    const db = await firestoreDb();
    const snapshot = await getDoc(doc(db, COLLECTIONS.reportDocuments, trimmed));
    if (!snapshot.exists()) return null;
    return snapshot.data() as ReportDocument;
  } catch {
    // A verification page must never fail closed on a network problem: "we could not check" and
    // "we checked and it is wrong" are different answers, and only one of them is ours to give.
    return null;
  }
}

/**
 * Counts how many accounts hold each role.
 *
 * Seven server-side counts rather than a collection scan: `getCountFromServer` charges for the
 * count and transfers no documents, so a community of a hundred thousand accounts costs the same
 * handful of reads as a community of ten. A count that came from paging through every profile would
 * be a report that could not be run on a real community at all.
 *
 * @param roles the roles to count
 * @returns role to count
 */
export async function countMembersByRole(
  roles: readonly string[],
): Promise<Readonly<Record<string, number>>> {
  try {
    const {
      collection,
      query: buildQuery,
      where,
      getCountFromServer,
    } = await import('firebase/firestore');
    const db = await firestoreDb();
    const counts = await Promise.all(
      roles.map(async (role) => {
        const snapshot = await getCountFromServer(
          buildQuery(collection(db, COLLECTIONS.users), where('role', '==', role)),
        );
        return [role, snapshot.data().count] as const;
      }),
    );
    return Object.fromEntries(counts);
  } catch {
    return {};
  }
}
