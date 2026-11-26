import { describe, expect, it } from 'vitest';
import { nextSort } from './DataTable';

describe('nextSort', () => {
  it('starts ascending on a new column', () => {
    expect(nextSort(null, 'name')).toEqual({ key: 'name', descending: false });
  });

  it('flips to descending on the second click', () => {
    expect(nextSort({ key: 'name', descending: false }, 'name')).toEqual({
      key: 'name',
      descending: true,
    });
  });

  it('clears the sort on the third click, back to the server order', () => {
    // A third state matters: an operator who sorted by mistake should be able to
    // return to the order the query produced, which is itself meaningful.
    expect(nextSort({ key: 'name', descending: true }, 'name')).toBeNull();
  });

  it('restarts ascending when a different column is clicked', () => {
    expect(nextSort({ key: 'name', descending: true }, 'age')).toEqual({
      key: 'age',
      descending: false,
    });
  });
});
