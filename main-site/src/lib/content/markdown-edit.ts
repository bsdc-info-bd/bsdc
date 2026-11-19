/**
 * The text window a toolbar button acts on.
 *
 * Everything in this module is a pure function from one window to the next, so
 * the editor's behaviour can be read and tested without a DOM: the component
 * that calls these only has to put the result back in the textarea and restore
 * the selection.
 */
export interface EditorWindow {
  value: string;
  /** Caret or selection start, in characters. */
  start: number;
  /** Selection end. Equal to `start` when nothing is selected. */
  end: number;
}

/** Clamps a window to the text it belongs to, so a stale selection cannot throw. */
function clamp(value: string, start: number, end: number): { start: number; end: number } {
  const limit = value.length;
  const safeStart = Math.min(Math.max(start, 0), limit);
  const safeEnd = Math.min(Math.max(end, safeStart), limit);
  return { start: safeStart, end: safeEnd };
}

/** The whole lines the window touches: where they begin and where the block ends. */
function lineBounds(value: string, start: number, end: number): { from: number; to: number } {
  const from = value.lastIndexOf('\n', Math.max(start - 1, 0)) + 1;
  const nextBreak = value.indexOf('\n', end);
  const to = nextBreak === -1 ? value.length : nextBreak;
  return { from, to };
}

function select(value: string, start: number, end: number): EditorWindow {
  const bounds = clamp(value, start, end);
  return { value, start: bounds.start, end: bounds.end };
}

/** Replaces the window with `text`, placing the caret `caretOffset` in. */
export function insertText(
  window: EditorWindow,
  text: string,
  caretOffset = text.length,
): EditorWindow {
  const { start, end } = clamp(window.value, window.start, window.end);
  const value = window.value.slice(0, start) + text + window.value.slice(end);
  const caret = start + caretOffset;
  return select(value, caret, caret);
}

/**
 * Wraps the window in `before`/`after`, or unwraps it when it is already
 * wrapped — pressing **B** twice must leave the text exactly as it was.
 *
 * With nothing selected, a placeholder is inserted and selected, so the member
 * types over "bold text" instead of deleting it.
 */
export function wrapSelection(
  window: EditorWindow,
  before: string,
  after: string,
  placeholder = '',
): EditorWindow {
  const { value } = window;
  const { start, end } = clamp(value, window.start, window.end);

  const alreadyWrapped =
    start >= before.length &&
    value.slice(start - before.length, start) === before &&
    value.slice(end, end + after.length) === after;

  if (alreadyWrapped) {
    const innerStart = start - before.length;
    const innerEnd = end + after.length;
    const unwrapped = value.slice(0, innerStart) + value.slice(start, end) + value.slice(innerEnd);
    return select(unwrapped, innerStart, innerStart + (end - start));
  }

  const selected = value.slice(start, end);
  const body = selected.length > 0 ? selected : placeholder;
  const next = value.slice(0, start) + before + body + after + value.slice(end);
  // Whatever is inside the markers is selected afterwards — the member's own
  // words stay selected, and a placeholder is replaced by the first keystroke.
  return select(next, start + before.length, start + before.length + body.length);
}

/**
 * Adds a line prefix to every line the window touches, or removes it when every
 * line already carries one. Headings, quotes and lists are all the same
 * operation with a different prefix.
 */
export function toggleLinePrefix(window: EditorWindow, prefix: string): EditorWindow {
  const { value } = window;
  const { start, end } = clamp(value, window.start, window.end);
  const { from, to } = lineBounds(value, start, end);
  const block = value.slice(from, to);
  const lines = block.split('\n');

  const carries = (line: string) => line.startsWith(prefix);
  const meaningful = lines.filter((line) => line.trim().length > 0);
  const everyLineCarries = meaningful.length > 0 && meaningful.every(carries);

  const nextLines = lines.map((line) => {
    if (everyLineCarries) return line.slice(prefix.length);
    // A blank line in the middle of a list stays blank: prefixing it would end
    // the list and leave a stray bullet on its own.
    if (line.trim().length === 0) return line;
    return prefix + line;
  });

  const nextBlock = nextLines.join('\n');
  const next = value.slice(0, from) + nextBlock + value.slice(to);
  return select(next, from, from + nextBlock.length);
}

/** Turns the selected text into a link, keeping it as the label. */
export function insertLink(window: EditorWindow, url = ''): EditorWindow {
  const { value } = window;
  const { start, end } = clamp(value, window.start, window.end);
  const label = value.slice(start, end);
  if (label.length === 0) {
    const text = `[link text](${url})`;
    const labelStart = start + 1;
    return select(value.slice(0, start) + text + value.slice(end), labelStart, labelStart + 9);
  }
  const text = `[${label}](${url})`;
  const urlStart = start + label.length + 3;
  return select(value.slice(0, start) + text + value.slice(end), urlStart, urlStart + url.length);
}

/** Inserts an image reference on its own line, with the description as its alt text. */
export function insertImage(window: EditorWindow, url: string, alt = ''): EditorWindow {
  const { value } = window;
  const { start } = clamp(value, window.start, window.start);
  const prefix = start === 0 || value[start - 1] === '\n' ? '' : '\n\n';
  const text = `${prefix}![${alt}](${url})\n`;
  const next = value.slice(0, start) + text + value.slice(start);
  const caret = start + text.length;
  return select(next, caret, caret);
}

/** A fenced code block, with the selection as its body. */
export function insertCodeBlock(window: EditorWindow, language = ''): EditorWindow {
  const { value } = window;
  const { start, end } = clamp(value, window.start, window.end);
  const body = value.slice(start, end);
  const text = `\`\`\`${language}\n${body}\n\`\`\``;
  if (body.length === 0) {
    const bodyStart = start + 3 + language.length + 1;
    return select(value.slice(0, start) + text + value.slice(end), bodyStart, bodyStart);
  }
  return select(
    value.slice(0, start) + text + value.slice(end),
    start + text.length,
    start + text.length,
  );
}

/**
 * A table skeleton. The header is where a member's cursor lands, because an
 * empty table is a grid of pipes and a table with a header is a table.
 */
export function insertTable(window: EditorWindow, columns = 3, rows = 2): EditorWindow {
  const safeColumns = Math.min(Math.max(columns, 2), 6);
  const safeRows = Math.min(Math.max(rows, 1), 10);
  const header = `| ${Array.from({ length: safeColumns }, (_, i) => `Column ${i + 1}`).join(' | ')} |`;
  const divider = `| ${Array.from({ length: safeColumns }, () => '---').join(' | ')} |`;
  const body = Array.from(
    { length: safeRows },
    () => `| ${Array.from({ length: safeColumns }, () => '   ').join(' | ')} |`,
  );
  const { value } = window;
  const { start } = clamp(value, window.start, window.start);
  const prefix = start === 0 || value[start - 1] === '\n' ? '' : '\n\n';
  const text = `${prefix}${[header, divider, ...body].join('\n')}\n`;
  const next = value.slice(0, start) + text + value.slice(start);
  const headerStart = start + prefix.length + 2;
  return select(next, headerStart, headerStart + `Column 1`.length);
}

/**
 * Continues a list, quote or task when Enter is pressed on an empty item, and
 * ends it otherwise — the behaviour every editor has and nobody notices until
 * it is missing. Returns null when Enter should do what it always does.
 */
export function continueLine(window: EditorWindow): EditorWindow | null {
  const { value } = window;
  if (window.start !== window.end) return null;
  const { from, to } = lineBounds(value, window.start, window.start);
  const line = value.slice(from, to);
  if (from !== window.start - line.length) return null;

  const ordered = /^(\s*)(\d+)\.\s(.*)$/.exec(line);
  const unordered = /^(\s*)([-*+])\s(.*)$/.exec(line);
  const quote = /^(\s*)(>)\s?(.*)$/.exec(line);

  const match = ordered ?? unordered ?? quote;
  if (!match) return null;

  const [, indent = '', marker, rest = ''] = match;
  if (rest.trim().length === 0) {
    // An empty item ends the list: remove the marker rather than adding another.
    const next = value.slice(0, from) + value.slice(to);
    return select(next, from, from);
  }

  const nextMarker = ordered ? `${String(Number(marker) + 1)}.` : marker;
  const insertion = `\n${indent}${nextMarker} `;
  const next = value.slice(0, window.start) + insertion + value.slice(window.end);
  const caret = window.start + insertion.length;
  return select(next, caret, caret);
}

/** Words and characters, for the counter under the editor. */
export function countText(value: string): { words: number; characters: number } {
  const trimmed = value.trim();
  return {
    words: trimmed.length === 0 ? 0 : trimmed.split(/\s+/u).length,
    characters: value.length,
  };
}
