import type { PostgrestError } from '@supabase/supabase-js';
import { getDb } from './client';
import type { CorporateEnv } from './env';

/**
 * Every corporate read and write goes through a database function, so the
 * permission check and the audit row happen in the same transaction as the
 * change. These wrappers turn a PostgREST failure into an error a person can
 * read: the raw object is never thrown, because it is not an Error and loses
 * its message when it crosses a boundary.
 */
export class DataError extends Error {
  readonly code: string;
  readonly detail: string;

  constructor(message: string, code: string, detail: string) {
    super(message);
    this.name = 'DataError';
    this.code = code;
    this.detail = detail;
  }
}

const FRIENDLY: Record<string, string> = {
  '42501': 'Your role does not allow this action.',
  '23505': 'That value is already taken.',
  '23514': 'The value did not pass a database check.',
  PGRST301: 'Your session expired. Sign in again.',
};

export function toDataError(error: PostgrestError): DataError {
  const friendly = FRIENDLY[error.code] ?? error.message ?? 'The request failed.';
  return new DataError(friendly, error.code ?? 'unknown', error.details ?? '');
}

/** Calls a database function and returns its result, already unwrapped. */
export async function callRpc<T>(
  env: CorporateEnv,
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await getDb(env).rpc(name, args);
  if (error) throw toDataError(error);
  return data as T;
}

/** Calls a set-returning function, normalising "no rows" to an empty list. */
export async function listRpc<T>(
  env: CorporateEnv,
  name: string,
  args: Record<string, unknown> = {},
): Promise<readonly T[]> {
  const rows = await callRpc<T[] | null>(env, name, args);
  return rows ?? [];
}

/**
 * Reads a whole table the caller is allowed to select from. Row level
 * security decides what comes back, which is why no filter is accepted here.
 */
export async function selectRows<T>(
  env: CorporateEnv,
  table: string,
  columns = '*',
): Promise<readonly T[]> {
  const { data, error } = await getDb(env).from(table).select(columns);
  if (error) throw toDataError(error);
  return (data ?? []) as T[];
}

export type AsyncState<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly data: T };

export function messageOf(error: unknown): string {
  if (error instanceof DataError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}
