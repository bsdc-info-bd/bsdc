import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getCountFromServer,
  writeBatch,
  increment,
  serverTimestamp,
  type QueryConstraint,
  type DocumentData,
  type QueryDocumentSnapshot,
  runTransaction,
  addDoc,
  Timestamp,
} from 'firebase/firestore';
import { ref, set, onValue, off, remove, update } from 'firebase/database';
import { getFirestoreDb, getRTDB } from './index';
import { config } from '@/config';
// --- Firestore Helpers ---

export const getCollection = (
  collectionName: string,
  constraints: QueryConstraint[] = []
) => {
  const db = getFirestoreDb();
  if (!db) return null;
  const colRef = collection(db, collectionName);
  return query(colRef, ...constraints);
};

export const getDocument = async <T>(
  collectionName: string,
  docId: string
): Promise<T | null> => {
  const db = getFirestoreDb();
  if (!db) return null;
  const docRef = doc(db, collectionName, docId);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) return null;
  return snapshot.data() as T;
};

export const setDocument = async (
  collectionName: string,
  docId: string,
  data: DocumentData,
  merge: boolean = true
): Promise<void> => {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not available');
  const docRef = doc(db, collectionName, docId);
  await setDoc(docRef, data, { merge });
};

export const addDocument = async (
  collectionName: string,
  data: DocumentData
): Promise<string> => {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not available');
  const colRef = collection(db, collectionName);
  const docRef = await addDoc(colRef, data);
  return docRef.id;
};

export const updateDocument = async (
  collectionName: string,
  docId: string,
  data: DocumentData
): Promise<void> => {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not available');
  const docRef = doc(db, collectionName, docId);
  await updateDoc(docRef, data);
};

export const deleteDocument = async (
  collectionName: string,
  docId: string
): Promise<void> => {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not available');
  const docRef = doc(db, collectionName, docId);
  await deleteDoc(docRef);
};

export const queryDocuments = async <T>(
  collectionName: string,
  constraints: QueryConstraint[] = []
): Promise<T[]> => {
  const db = getFirestoreDb();
  if (!db) return [];
  const colRef = collection(db, collectionName);
  const q = query(colRef, ...constraints);
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data() as T);
};

export const queryDocumentsPaginated = async <T>(
  collectionName: string,
  constraints: QueryConstraint[],
  pageSize: number,
  lastDoc?: QueryDocumentSnapshot
): Promise<{ items: T[]; lastDoc: QueryDocumentSnapshot | null; hasMore: boolean }> => {
  const db = getFirestoreDb();
  if (!db) return { items: [], lastDoc: null, hasMore: false };
  const colRef = collection(db, collectionName);
  const allConstraints = [...constraints, limit(pageSize + 1)];
  if (lastDoc) allConstraints.push(startAfter(lastDoc));
  const q = query(colRef, ...allConstraints);
  const snapshot = await getDocs(q);
  const docs = snapshot.docs;
  const hasMore = docs.length > pageSize;
  const items = (hasMore ? docs.slice(0, pageSize) : docs).map((d) => d.data() as T);
  const lastResultDoc = hasMore ? docs[pageSize - 1] : docs[docs.length - 1] || null;
  return { items, lastDoc: lastResultDoc || null, hasMore };
};

export const getCount = async (
  collectionName: string,
  constraints: QueryConstraint[] = []
): Promise<number> => {
  const db = getFirestoreDb();
  if (!db) return 0;
  const colRef = collection(db, collectionName);
  const q = query(colRef, ...constraints);
  const snapshot = await getCountFromServer(q);
  return snapshot.data().count;
};

// --- Batch Helpers ---

export const createBatch = () => {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not available');
  return writeBatch(db);
};

export const runFirestoreTransaction = async <T>(
  updateFn: (transaction: any) => Promise<T>
): Promise<T> => {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not available');
  return runTransaction(db, updateFn);
};

// --- RTDB Helpers ---

export const setRTDBValue = async (path: string, value: unknown): Promise<void> => {
  const rtdb = getRTDB();
  if (!rtdb) return;
  const dbRef = ref(rtdb, path);
  await set(dbRef, value);
};

export const updateRTDBValue = async (
  path: string,
  updates: Record<string, unknown>
): Promise<void> => {
  const rtdb = getRTDB();
  if (!rtdb) return;
  const dbRef = ref(rtdb, path);
  await update(dbRef, updates);
};

export const removeRTDBValue = async (path: string): Promise<void> => {
  const rtdb = getRTDB();
  if (!rtdb) return;
  const dbRef = ref(rtdb, path);
  await remove(dbRef);
};

export const subscribeRTDB = (
  path: string,
  callback: (value: unknown) => void
): (() => void) => {
  const rtdb = getRTDB();
  if (!rtdb) return () => {};
  const dbRef = ref(rtdb, path);
  const handler = onValue(dbRef, (snapshot) => {
    callback(snapshot.val());
  });
  return () => off(dbRef, 'value', handler);
};

// --- Presence ---

export const setPresence = async (userId: string): Promise<void> => {
  const rtdb = getRTDB();
  if (!rtdb) return;
  const userPresenceRef = ref(rtdb, `${config.rtdb.presence}/${userId}`);
  const connectedRef = ref(rtdb, '.info/connected');

  onValue(connectedRef, async (snap) => {
    if (snap.val() === true) {
      await set(userPresenceRef, {
        online: true,
        lastSeen: Date.now(),
      });
      // On disconnect, set offline
      // Note: Firebase RTDB onDisconnect is handled separately
    }
  });
};

// --- Typing Indicator ---

export const setTypingIndicator = async (
  conversationId: string,
  userId: string,
  isTyping: boolean
): Promise<void> => {
  const rtdb = getRTDB();
  if (!rtdb) return;
  const typingRef = ref(
    rtdb,
    `${config.rtdb.typing}/${conversationId}/${userId}`
  );
  if (isTyping) {
    await set(typingRef, { timestamp: Date.now() });
  } else {
    await remove(typingRef);
  }
};

// --- Re-export Firestore query helpers ---
export { where, orderBy, limit, startAfter, increment, serverTimestamp, Timestamp };
