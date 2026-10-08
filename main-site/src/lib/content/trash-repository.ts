import { getSupabase } from '@/lib/supabase/client';
import { toDataError } from '@/lib/supabase/errors';

/**
 * The trash, as the database sees it.
 *
 * `my_deleted_content()` returns the author's own deleted posts and comments
 * with the moment each one stops being recoverable — the thirty day rule lives
 * in the database, and this module does not restate it. Deleting and restoring
 * are plain writes on `deleted_at`: the policy lets a member touch only their
 * own rows, and the trigger refuses a restore once the window has closed.
 */
export interface TrashItem {
  kind: 'post' | 'comment';
  id: string;
  postId: string;
  title: string;
  preview: string;
  deletedAt: string;
  expiresAt: string;
  restorable: boolean;
}

export async function fetchTrash(limit = 50): Promise<TrashItem[]> {
  const { data, error } = await getSupabase().rpc('my_deleted_content', { p_limit: limit }).returns<
    {
      kind: string;
      id: string;
      post_id: string;
      title: string;
      preview: string;
      deleted_at: string;
      expires_at: string;
      restorable: boolean;
    }[]
  >();
  if (error) throw toDataError(error);

  return (data ?? []).map((row) => ({
    kind: row.kind === 'comment' ? 'comment' : 'post',
    id: row.id,
    postId: row.post_id,
    title: row.title ?? '',
    preview: row.preview ?? '',
    deletedAt: row.deleted_at,
    expiresAt: row.expires_at,
    restorable: row.restorable,
  }));
}

/** Puts a row back. Refused by the database after thirty days. */
export async function restoreFromTrash(item: TrashItem): Promise<void> {
  const table = item.kind === 'post' ? 'posts' : 'comments';
  const { error } = await getSupabase().from(table).update({ deleted_at: null }).eq('id', item.id);
  if (error) throw toDataError(error);
}

/**
 * Deletes for good, at any time and without waiting for the window: the author
 * asked for it, and the row is already theirs to remove.
 */
export async function deleteForever(item: TrashItem): Promise<void> {
  const table = item.kind === 'post' ? 'posts' : 'comments';
  const { error } = await getSupabase().from(table).delete().eq('id', item.id);
  if (error) throw toDataError(error);
}
