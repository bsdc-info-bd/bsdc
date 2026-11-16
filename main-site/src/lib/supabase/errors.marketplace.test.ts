import { describe, expect, it } from 'vitest';
import { asDatabaseError, dataErrorKey } from './errors';

describe('asDatabaseError', () => {
  it('turns a plain PostgREST error object into an Error that keeps its message and code', () => {
    const raw = {
      message: 'pin your delivery location on the map',
      code: '22023',
      details: null,
      hint: null,
    };
    const error = asDatabaseError(raw);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('pin your delivery location on the map');
    expect(Object.assign({}, error)).toMatchObject({ code: '22023' });
  });

  it('keeps a real Error as it is', () => {
    const original = new Error('boom');
    expect(asDatabaseError(original)).toBe(original);
  });

  it('still maps the code to a translation key, as before', () => {
    const error = asDatabaseError({
      message: 'this shop cannot take orders right now',
      code: 'P0002',
    });
    expect(dataErrorKey(error)).toBe('data.errors.notFound');
  });

  it('never returns an empty message', () => {
    expect(asDatabaseError({ message: '' }).message).toBe('data/unknown');
    expect(asDatabaseError(null).message).toBe('data/unknown');
  });
});
