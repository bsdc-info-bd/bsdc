import { useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { Button, Loading } from './primitives';
import {
  describeAge,
  freshnessNotice,
  freshnessOf,
  type FreshnessPolicy,
} from '../domain/freshness';

/**
 * The table every console screen uses.
 *
 * Its job is not to draw a table — that is twenty lines. Its job is to make it
 * *impossible to ship a screen without its four states*, which is the failure
 * this suite kept repeating: a happy path that looks finished, and no answer at
 * all for empty, slow, refused, or stale.
 *
 * So the four live in the component, not in the caller:
 *
 * - **Loading** — says what it is loading, not a bare spinner.
 * - **Empty** — distinguishes "nothing is here" from "nothing matched", because
 *   those are different things to say to a person who is looking for something.
 * - **Error** — shows the message the database gave, plus a retry.
 * - **Ready** — with the age of the data always visible.
 *
 * Sorting is client-side and stable, because a server-side sort on a page of
 * twenty rows is a round trip that teaches nobody anything. When a screen grows
 * past that, it paginates on the server and passes `sortable={false}`.
 */

export type Column<Row> = {
  readonly key: string;
  readonly header: string;
  /** The cell, already rendered. Return a string for the common case. */
  readonly render: (row: Row) => ReactNode;
  /** A sortable value. Omit to make the column unsortable. */
  readonly sortValue?: (row: Row) => string | number;
  /** Right-align numbers; a column of figures reads better that way. */
  readonly align?: 'start' | 'end';
  /** Hidden below this many pixels of container width. */
  readonly hideBelow?: 'sm' | 'md';
};

export type DataTableProps<Row> = {
  readonly caption: string;
  readonly columns: readonly Column<Row>[];
  readonly rows: readonly Row[];
  readonly rowKey: (row: Row) => string;
  readonly state?:
    | { readonly status: 'loading'; readonly label?: string }
    | { readonly status: 'error'; readonly message: string; readonly onRetry?: () => void }
    | { readonly status: 'ready' }
    | undefined;
  /** What to say when there are no rows at all. */
  readonly empty?: ReactNode | undefined;
  /** What to say when a filter excluded everything. */
  readonly emptyFiltered?: ReactNode | undefined;
  readonly filtered?: boolean | undefined;
  /** When these rows were read, so the table can state its own age. */
  readonly fetchedAt?: number | null | undefined;
  readonly freshnessPolicy?: FreshnessPolicy | undefined;
  readonly onRowClick?: ((row: Row) => void) | undefined;
  readonly selectedKey?: string | undefined;
  readonly toolbar?: ReactNode | undefined;
  readonly initialSort?: { readonly key: string; readonly descending?: boolean } | undefined;
  readonly pageSize?: number | undefined;
};

export function DataTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  state,
  empty,
  emptyFiltered,
  filtered = false,
  fetchedAt,
  freshnessPolicy,
  onRowClick,
  selectedKey,
  toolbar,
  initialSort,
  pageSize = 50,
}: DataTableProps<Row>): ReactElement {
  const [sort, setSort] = useState<{ key: string; descending: boolean } | null>(
    initialSort ? { key: initialSort.key, descending: initialSort.descending ?? false } : null,
  );
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((candidate) => candidate.key === sort.key);
    if (!column?.sortValue) return rows;
    const get = column.sortValue;
    // A copy: sorting in place would reorder the caller's array, which is a
    // subtle bug that shows up as a filter result changing under a rerender.
    return [...rows].sort((left, right) => {
      const a = get(left);
      const b = get(right);
      if (typeof a === 'number' && typeof b === 'number') {
        return sort.descending ? b - a : a - b;
      }
      const compared = String(a).localeCompare(String(b), undefined, { numeric: true });
      return sort.descending ? -compared : compared;
    });
  }, [rows, sort, columns]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visible = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize);

  if (state?.status === 'loading') {
    return <Loading label={state.label ?? `Loading ${caption.toLowerCase()}.`} />;
  }

  if (state?.status === 'error') {
    return (
      <div className="kit-table-error" role="alert">
        <p style={{ margin: 0 }}>{state.message}</p>
        {state.onRetry !== undefined && (
          <Button variant="quiet" size="small" onClick={state.onRetry}>
            Try again
          </Button>
        )}
      </div>
    );
  }

  const age = fetchedAt === undefined ? null : freshnessOf(fetchedAt, Date.now(), freshnessPolicy);
  const notice = age === null ? null : freshnessNotice(age);

  return (
    <div className="kit-datatable">
      {(toolbar !== undefined || (age !== null && age.ageMs !== null)) && (
        <div className="kit-datatable-bar">
          <div className="kit-row">{toolbar}</div>
          {age !== null && age.ageMs !== null && (
            <span
              className={`kit-fresh kit-fresh--${age.band}`}
              title={`Read ${describeAge(age.ageMs)}`}
            >
              <span className="kit-fresh-dot" aria-hidden="true" />
              Read {describeAge(age.ageMs)}
            </span>
          )}
        </div>
      )}

      {notice !== null && (
        <p className="kit-small kit-muted" role="status">
          {notice}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="kit-empty">
          {filtered
            ? (emptyFiltered ?? 'Nothing matches those filters.')
            : (empty ?? 'Nothing to show yet.')}
        </p>
      ) : (
        <>
          <div className="kit-tablewrap">
            <table className="kit-table">
              <caption className="kit-small kit-muted">{caption}</caption>
              <thead>
                <tr>
                  {columns.map((column) => {
                    const active = sort?.key === column.key;
                    const sortable = column.sortValue !== undefined;
                    return (
                      <th
                        key={column.key}
                        scope="col"
                        aria-sort={active ? (sort.descending ? 'descending' : 'ascending') : 'none'}
                        data-align={column.align ?? 'start'}
                        data-hide={column.hideBelow}
                      >
                        {sortable ? (
                          <button
                            type="button"
                            className="kit-sort"
                            onClick={() =>
                              setSort((current) =>
                                current?.key === column.key
                                  ? { key: column.key, descending: !current.descending }
                                  : { key: column.key, descending: false },
                              )
                            }
                          >
                            {column.header}
                            <span aria-hidden="true" className="kit-sort-mark">
                              {active ? (sort.descending ? '↓' : '↑') : '↕'}
                            </span>
                          </button>
                        ) : (
                          column.header
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const key = rowKey(row);
                  const selected = selectedKey === key;
                  return (
                    <tr
                      key={key}
                      aria-selected={selected ? true : undefined}
                      className={selected ? 'kit-row-selected' : undefined}
                      onClick={
                        onRowClick === undefined
                          ? undefined
                          : () => {
                              onRowClick(row);
                            }
                      }
                      {...(onRowClick === undefined
                        ? {}
                        : {
                            tabIndex: 0,
                            role: 'button',
                            onKeyDown: (event: React.KeyboardEvent<HTMLTableRowElement>) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                onRowClick(row);
                              }
                            },
                          })}
                    >
                      {columns.map((column) => (
                        <td
                          key={column.key}
                          data-align={column.align ?? 'start'}
                          data-hide={column.hideBelow}
                        >
                          {column.render(row)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {pageCount > 1 && (
            <div className="kit-pagebar">
              <span className="kit-small kit-muted">
                {sorted.length} rows · page {safePage + 1} of {pageCount}
              </span>
              <div className="kit-row">
                <Button
                  size="small"
                  variant="quiet"
                  disabled={safePage === 0}
                  onClick={() => setPage(safePage - 1)}
                >
                  Previous
                </Button>
                <Button
                  size="small"
                  variant="quiet"
                  disabled={safePage >= pageCount - 1}
                  onClick={() => setPage(safePage + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The next sort state for a column, as a pure function.
 *
 * Exported because "third click clears the sort" is a behaviour with an opinion
 * in it, and an opinion deserves a test that does not need a DOM.
 */
export function nextSort(
  current: { key: string; descending: boolean } | null,
  key: string,
): { key: string; descending: boolean } | null {
  if (current === null || current.key !== key) return { key, descending: false };
  if (!current.descending) return { key, descending: true };
  return null;
}
