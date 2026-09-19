/**
 * BSDC — src/entities/moderation/repository.ts
 * Purpose : Reporting, the reviewer queue, and appeals.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : A person may file a report and read their own; reading the queue needs staff claims and
 *   deciding needs a Cloud Function, so the client is never in a position to be wrong about
 *   somebody else's fate. The Function applies the transition in src/entities/moderation/state.ts,
 *   writes the audit entry, notifies the author and revokes points in one transaction.
 *   An appeal goes to somebody who did not make the original call — enforced in the Function, and
 *   reflected here so the UI never offers a reviewer their own decision to review.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { COLLECTIONS, appealPath } from '@/core/config/collections';
import { AppError } from '@/core/errors/AppError';
import { firestoreDb } from '@/services/firebase/app';
import { fromQuery, translateFirestoreError } from '@/services/firebase/firestore';
import { acquireListener, type Unsubscribe } from '@/services/realtime/registry';
import { mirrorList, mirrorPut } from '@/services/offline/mirror';
import { writeThrough, type WriteThroughResult } from '@/services/offline/sync';
import { callFunction } from '@/services/backend/callable';
import type { ModerationAction, ReportState } from '@/core/config/moderation';
import { isReportWellFormed, sortQueue, type Appeal, type Report } from './model';
import { canTakeAction } from './state';

/**
 * Files a report.
 * @param report the report entity, built by src/entities/moderation/model.ts
 * @returns the write outcome, or a refused result when the reason is too short to act on
 */
export async function fileReport(report: Report): Promise<WriteThroughResult> {
  if (!isReportWellFormed(report)) {
    return {
      synced: false,
      queued: false,
      error: new AppError('BSDC-MOD-001', { reportId: report.id }),
    };
  }
  await mirrorPut('reports', report as unknown as Appeal);
  return await writeThrough(
    'reports',
    report as unknown as Appeal,
    {
      kind: 'report.create',
      entityId: report.id,
      payload: report as unknown as Readonly<Record<string, unknown>>,
    },
    async () => {
      const { doc, setDoc } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        await setDoc(doc(db, `${COLLECTIONS.reports}/${report.id}`), report);
      } catch (error) {
        throw translateFirestoreError(error, 'report.create');
      }
    },
  );
}

/**
 * Reads the moderation queue. The rules refuse this read without staff claims, so a non-staff
 * caller gets an empty list rather than somebody else's business.
 * @param states states to include; empty means every state
 * @returns the reports in queue order
 */
export async function listQueue(states: readonly ReportState[] = []): Promise<readonly Report[]> {
  try {
    const { collection, query, where, orderBy, limit, getDocs } =
      await import('firebase/firestore');
    const db = await firestoreDb();
    const constraints = [where('deletedAt', '==', null)];
    if (states.length > 0) constraints.push(where('state', 'in', states.slice(0, 10)));
    constraints.push(orderBy('severity', 'desc') as never, limit(60) as never);
    const snapshot = await getDocs(query(collection(db, COLLECTIONS.reports), ...constraints));
    const reports = fromQuery<Report>(snapshot);
    for (const report of reports) void mirrorPut('reports', report as unknown as Appeal);
    return sortQueue(reports);
  } catch (error) {
    throw translateFirestoreError(error, 'moderation.queue');
  }
}

/**
 * Watches the moderation queue so a new urgent report appears without a refresh.
 * @param handler receives the queue in review order
 * @returns a release function
 */
export function watchQueue(handler: (reports: readonly Report[]) => void): Unsubscribe {
  return acquireListener('moderation:queue', 'moderation', async () => {
    const { collection, query, where, orderBy, limit, onSnapshot } =
      await import('firebase/firestore');
    const db = await firestoreDb();
    return onSnapshot(
      query(
        collection(db, COLLECTIONS.reports),
        where('deletedAt', '==', null),
        orderBy('severity', 'desc'),
        limit(60),
      ),
      (snapshot) => {
        const reports = fromQuery<Report>(snapshot);
        handler(sortQueue(reports));
      },
    );
  });
}

/**
 * Lists the reports one person has filed, newest first.
 * @param reporterUid the reporter
 * @returns their reports
 */
export async function listMyReports(reporterUid: string): Promise<readonly Report[]> {
  const reports = await mirrorList<Appeal>('reports', {
    orderBy: 'createdAt',
    direction: 'desc',
    where: [(entry: Appeal) => (entry as unknown as Report).reporterUid === reporterUid],
  });
  return reports as unknown as readonly Report[];
}

/**
 * Asks the platform to decide a report. The transition is checked here so a reviewer never waits
 * for a round trip to be told an action is impossible, and checked again in the Function.
 * @param report the report
 * @param action the action
 * @param note the reviewer's note
 * @returns the resulting state
 */
export async function decideReport(
  report: Report,
  action: ModerationAction,
  note: string,
): Promise<ReportState> {
  if (!canTakeAction(report.state, action)) {
    throw new AppError('BSDC-MOD-002', { reportId: report.id, action });
  }
  const response = await callFunction('decideReport', {
    reportId: report.id,
    action,
    note,
  });
  const state = response.state;
  if (
    state === 'open' ||
    state === 'triaged' ||
    state === 'actioned' ||
    state === 'dismissed' ||
    state === 'escalated'
  ) {
    return state;
  }
  return 'triaged';
}

/**
 * Files an appeal against a decided report. One appeal per decision; the Function refuses a second.
 * @param reportId the decided report
 * @param reasonText why the decision is wrong
 * @returns the new appeal id
 */
export async function fileAppeal(reportId: string, reasonText: string): Promise<string> {
  if (reasonText.trim().length < 12) {
    throw new AppError('BSDC-MOD-001', { reportId });
  }
  const response = await callFunction('fileAppeal', { reportId, reasonText });
  return response.appealId;
}

/**
 * Lists the appeals filed against one report.
 * @param reportId the report
 * @returns the appeals, newest first
 */
export async function listAppeals(reportId: string): Promise<readonly Appeal[]> {
  return await mirrorList<Appeal>('appeals', {
    orderBy: 'createdAt',
    direction: 'desc',
    where: [(appeal: Appeal) => appeal.reportId === reportId && appeal.deletedAt === null],
  });
}

/**
 * Reads a single appeal from the mirror, used by the decision screen.
 * @param appealId appeal id
 * @returns the appeal, or undefined when it is not on this device
 */
export async function loadAppeal(appealId: string): Promise<Appeal | undefined> {
  const found = await mirrorList<Appeal>('appeals', {
    limit: 1,
    where: [(appeal: Appeal) => appeal.id === appealId],
  });
  return found[0];
}

/**
 * Builds the canonical path of an appeal document, exposed for the rules and for tests.
 * @param appealId appeal id
 * @returns the document path
 */
export function appealDocumentPath(appealId: string): string {
  return appealPath(appealId);
}
