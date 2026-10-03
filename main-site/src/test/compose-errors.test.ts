import { describe, expect, it } from 'vitest';
import { classifyComposeSaveError } from '@/lib/content/compose-errors';
import { PROFILE_MISSING_MESSAGE } from '@/lib/content/post-repository';
import { DataError, toDataError } from '@/lib/supabase/errors';

describe('classifyComposeSaveError', () => {
  it('routes a missing author profile to onboarding', () => {
    // This is what savePost throws when a foreign key.
    const error = toDataError(new Error(PROFILE_MISSING_MESSAGE));
    expect(classifyComposeSaveError(error)).toEqual({
      kind: 'onboarding',
      messageKey: 'data.errors.profileMissing',
    });
  });

  it('keeps a uniqueness conflict as a data error, not a draft error', () => {
    const error = new DataError({ message: 'duplicate key value', code: '23505' });
    expect(classifyComposeSaveError(error)).toEqual({
      kind: 'data',
      messageKey: 'data.errors.conflict',
    });
  });

  it('reads a foreign key violation on a side table as a missing record', () => {
    // A sync insert (post_media, post_mentions) pointing at a deleted row is
    // not the author and must not be sent to onboarding.
    const error = new DataError({
      message: 'insert or update on table "post_media" violates foreign key constraint',
      code: '23503',
    });
    expect(classifyComposeSaveError(error)).toEqual({
      kind: 'data',
      messageKey: 'data.errors.notFound',
    });
  });

  it('falls back to a generic data error for anything else', () => {
    expect(classifyComposeSaveError(new Error('kaboom'))).toEqual({
      kind: 'data',
      messageKey: 'data.errors.generic',
    });
  });
});
