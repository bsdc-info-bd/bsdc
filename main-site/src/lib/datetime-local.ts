/** Formatting helpers shared by the edit forms. */

/**
 * An ISO timestamp in the shape `<input type="datetime-local">` reads.
 *
 * The input wants a local wall-clock value with no zone; the row holds an
 * instant. Converting through `Date` means the field shows the moment the
 * member's own clock would call that instant, rather than shifting it by their
 * offset each time the dialog opens.
 */
export function localDateTimeValue(iso: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';
  const date = new Date(time);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
