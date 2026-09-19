/**
 * BSDC — src/services/backend/callable.ts
 * Purpose : One typed door to Cloud Functions, used for every action the client may not perform.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Anything that changes someone else's state — deciding a report, awarding or revoking
 *   points, sending a broadcast, changing a role — goes through a callable, never through a direct
 *   write. The client asks; the Function verifies the caller's claims, applies the rule and writes
 *   both the change and its audit entry inside one transaction.
 *   The Firebase Functions SDK is imported dynamically so it never enters the initial shell: a
 *   visitor who only reads the feed does not download the client half of the admin toolchain.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { AppError } from '@/core/errors/AppError';
import { FIREBASE_REGIONS } from '@/core/config/firebase';
import { firebaseApp } from '@/services/firebase/app';

/** Every callable the platform exposes, with its request and response shapes. */
export interface CallableMap {
  decideReport: {
    request: { reportId: string; action: string; note: string };
    response: { state: string };
  };
  fileAppeal: { request: { reportId: string; reasonText: string }; response: { appealId: string } };
  decideAppeal: {
    request: { appealId: string; outcome: 'upheld' | 'rejected'; note: string };
    response: { status: string };
  };
  sendBroadcast: {
    request: { broadcastId: string; confirm: boolean };
    response: { recipientCount: number };
  };
  awardPoints: {
    request: { action: string; entityId: string };
    response: { awarded: number; total: number };
  };
  toggleFollow: {
    request: { targetUid: string; following: boolean };
    response: { following: boolean; followerCount: number };
  };
  setFeatureFlag: {
    request: {
      key: string;
      enabled: boolean;
      forceOff: boolean;
      startsAt: string | null;
      endsAt: string | null;
      note: string;
      passkey: string;
    };
    response: { key: string; enabled: boolean };
  };
  assignRole: {
    request: { uid: string; role: string; reason: string };
    response: { role: string };
  };
  restoreSoftDeleted: {
    request: { kind: string; entityId: string };
    response: { restored: boolean };
  };
  purgeSoftDeleted: {
    request: { kind: string; entityId: string; confirmation: string };
    response: { purged: boolean };
  };
  registerReport: {
    request: {
      reportId: string;
      kind: string;
      title: string;
      integrity: string;
      generatedAt: string;
      rowCount: number;
      verificationUrl: string;
    };
    response: { reportId: string };
  };
}

export type CallableName = keyof CallableMap;

/**
 * Calls a Cloud Function by name.
 * @param name function name
 * @param payload request payload
 * @returns the response data
 */
export async function callFunction<N extends CallableName>(
  name: N,
  payload: CallableMap[N]['request'],
): Promise<CallableMap[N]['response']> {
  const { getFunctions, httpsCallable, connectFunctionsEmulator } =
    await import('firebase/functions');
  const app = await firebaseApp();
  const functions = getFunctions(app, FIREBASE_REGIONS.functions);
  const emulator: unknown = import.meta.env.VITE_FIREBASE_FUNCTIONS_EMULATOR;
  if (typeof emulator === 'string' && emulator.length > 0 && import.meta.env.DEV) {
    connectFunctionsEmulator(functions, '127.0.0.1', Number(emulator));
  }
  const callable = httpsCallable<CallableMap[N]['request'], CallableMap[N]['response']>(
    functions,
    name,
  );
  try {
    const result = await callable(payload);
    return result.data;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'functions/permission-denied') {
      throw new AppError('BSDC-AUTH-005', { function: name }, error);
    }
    if (code === 'functions/unauthenticated') {
      throw new AppError('BSDC-AUTH-006', { function: name }, error);
    }
    if (code === 'functions/invalid-argument') {
      throw new AppError('BSDC-DATA-009', { function: name }, error);
    }
    if (code === 'functions/resource-exhausted') {
      throw new AppError('BSDC-NET-004', { function: name }, error);
    }
    throw new AppError('BSDC-NET-005', { function: name }, error);
  }
}
