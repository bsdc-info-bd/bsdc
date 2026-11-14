import { getSupabase } from '@/lib/supabase/client';
import type { Json } from '@/lib/supabase/types';
import type { MkCartLine } from './mk-types';

/**
 * The one cart read the global header needs. It lives apart from mk-repository
 * so that importing it does not pull the whole marketplace data layer into the
 * eager entry bundle.
 */
export async function fetchMyCart(): Promise<MkCartLine[]> {
  const { data, error } = await getSupabase().rpc('mk_my_cart');
  if (error) throw error;
  return data as unknown as Json as unknown as MkCartLine[];
}
