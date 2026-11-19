import { describe, expect, it } from 'vitest';
import {
  continueLine,
  countText,
  insertCodeBlock,
  insertImage,
  insertLink,
  insertTable,
  insertText,
  toggleLinePrefix,
  wrapSelection,
  type EditorWindow,
} from './markdown-edit';

/** `hello|world` means a caret between "hello" and "world". */
function at(spec: string): EditorWindow {
  const caret = spec.indexOf('|');
  const value = spec.replace('|', '');
  return { value, start: caret, end: caret };
}

/** `hello[world]` means the word is selected. */
function selected(spec: string): EditorWindow {
  const start = spec.indexOf('[');
  const end = spec.indexOf(']') - 1;
  return { value: spec.replace('[', '').replace(']', ''), start, end };
}

describe('wrapping a selection', () => {
  it('wraps what is selected and keeps it selected', () => {
    const result = wrapSelection(selected('say [hello] now'), '**', '**');
    expect(result.value).toBe('say **hello** now');
    expect(result.value.slice(result.start, result.end)).toBe('hello');
  });

  it('unwraps text that is already wrapped, so the button toggles', () => {
    const result = wrapSelection(selected('say **[hello]** now'), '**', '**');
    expect(result.value).toBe('say hello now');
    expect(result.value.slice(result.start, result.end)).toBe('hello');
  });

  it('inserts a selected placeholder when nothing is selected', () => {
    const result = wrapSelection(at('say | now'), '*', '*', 'emphasis');
    expect(result.value).toBe('say *emphasis* now');
    expect(result.value.slice(result.start, result.end)).toBe('emphasis');
  });

  it('cannot be moved outside the text by a stale selection', () => {
    const result = wrapSelection({ value: 'abc', start: 99, end: 120 }, '**', '**', 'x');
    expect(result.value).toBe('abc**x**');
  });
});

describe('line prefixes', () => {
  it('turns the touched lines into a heading', () => {
    const result = toggleLinePrefix(at('|title'), '## ');
    expect(result.value).toBe('## title');
  });

  it('removes the prefix when every touched line already has it', () => {
    const result = toggleLinePrefix(selected('[> one\n> two]'), '> ');
    expect(result.value).toBe('one\ntwo');
  });

  it('prefixes every line of a multi-line selection and leaves blanks alone', () => {
    const result = toggleLinePrefix(selected('[one\n\ntwo]'), '- ');
    expect(result.value).toBe('- one\n\n- two');
  });
});

describe('links, images, code and tables', () => {
  it('uses the selection as the link label and selects the url', () => {
    const result = insertLink(selected('see [the docs] first'));
    expect(result.value).toBe('see [the docs]() first');
    expect(result.value.slice(result.start, result.end)).toBe('');
    expect(result.start).toBe('see [the docs]('.length);
  });

  it('inserts a picture on its own line', () => {
    const result = insertImage(at('a paragraph|'), 'https://i.ibb.co/x.jpg', 'A desk');
    expect(result.value).toBe('a paragraph\n\n![A desk](https://i.ibb.co/x.jpg)\n');
  });

  it('fences the selection as code', () => {
    const result = insertCodeBlock(selected('[const a = 1;]'));
    expect(result.value).toBe('```\nconst a = 1;\n```');
  });

  it('builds a table whose header is what gets typed over', () => {
    const result = insertTable(at('|'), 2, 1);
    expect(result.value).toContain('| Column 1 | Column 2 |');
    expect(result.value).toContain('| --- | --- |');
    expect(result.value.slice(result.start, result.end)).toBe('Column 1');
  });

  it('inserts plain text at the caret', () => {
    const result = insertText(at('one |two'), 'three ');
    expect(result.value).toBe('one three two');
    expect(result.start).toBe('one three '.length);
  });
});

describe('enter inside a list', () => {
  it('continues an unordered list', () => {
    const result = continueLine(at('- first|'));
    expect(result?.value).toBe('- first\n- ');
  });

  it('numbers the next ordered item', () => {
    const result = continueLine(at('1. first|'));
    expect(result?.value).toBe('1. first\n2. ');
  });

  it('ends the list on an empty item instead of adding another bullet', () => {
    const result = continueLine(at('- |'));
    expect(result?.value).toBe('');
  });

  it('leaves ordinary text alone', () => {
    expect(continueLine(at('a paragraph|'))).toBeNull();
  });

  it('does nothing when a range is selected', () => {
    expect(continueLine(selected('[a\nb]'))).toBeNull();
  });
});

describe('counting', () => {
  it('counts words the way a writer does', () => {
    expect(countText('  one  two\nthree ')).toEqual({ words: 3, characters: 17 });
    expect(countText('   ')).toEqual({ words: 0, characters: 3 });
  });
});
