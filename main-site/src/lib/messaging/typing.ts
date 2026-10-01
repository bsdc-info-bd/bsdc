import { onDisconnect, onValue, remove, set } from 'firebase/database';
import { rtdbRef, RTDB_PATHS } from '@/lib/realtime/rtdb';

/**
 * Typing indicators are ephemeral, so they live in Realtime Database rather
 * than Postgres: a timestamp per member per conversation, cleared on
 * disconnect. Nothing durable is ever written here.
 */
export function publishTyping(conversationId: string, uid: string): () => void {
  const reference = rtdbRef(RTDB_PATHS.typing(conversationId, uid));
  void onDisconnect(reference).remove();
  void set(reference, Date.now());
  return () => {
    void remove(reference);
  };
}

export function clearTyping(conversationId: string, uid: string): void {
  void remove(rtdbRef(RTDB_PATHS.typing(conversationId, uid)));
}

export function subscribeTyping(
  conversationId: string,
  onChange: (signals: Record<string, number>) => void,
): () => void {
  const reference = rtdbRef(`typing/${conversationId}`);
  return onValue(reference, (snapshot) => {
    const value: unknown = snapshot.val();
    if (value === null || typeof value !== 'object') {
      onChange({});
      return;
    }
    const signals: Record<string, number> = {};
    for (const [uid, at] of Object.entries(value as Record<string, unknown>)) {
      if (typeof at === 'number') signals[uid] = at;
    }
    onChange(signals);
  });
}
