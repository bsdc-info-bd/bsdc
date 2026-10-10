import { describe, expect, it } from 'vitest';
import {
  REACTION_CHOICES,
  attachmentKind,
  dayKey,
  extractMentions,
  highlightMatches,
  isReactionChoice,
  parseMessageBody,
  previewLine,
} from './message-text';

describe('parseMessageBody', () => {
  it('leaves plain text alone', () => {
    expect(parseMessageBody('hello there')).toEqual([{ type: 'text', value: 'hello there' }]);
  });

  it('turns a URL into a link', () => {
    const segments = parseMessageBody('read https://bsdc.info/posts/x now');
    expect(segments).toEqual([
      { type: 'text', value: 'read ' },
      { type: 'link', value: 'https://bsdc.info/posts/x', href: 'https://bsdc.info/posts/x' },
      { type: 'text', value: ' now' },
    ]);
  });

  it('does not swallow a trailing full stop into the link', () => {
    expect(parseMessageBody('see https://example.com/a.')).toEqual([
      { type: 'text', value: 'see ' },
      { type: 'link', value: 'https://example.com/a', href: 'https://example.com/a' },
      { type: 'text', value: '.' },
    ]);
  });

  it('turns @handle into a mention', () => {
    const segments = parseMessageBody('thanks @rahim for the fix');
    expect(segments).toEqual([
      { type: 'text', value: 'thanks ' },
      { type: 'mention', value: '@rahim', handle: 'rahim' },
      { type: 'text', value: ' for the fix' },
    ]);
  });

  it('reads a fenced code block, with its language', () => {
    const segments = parseMessageBody('try this:\n```sql\nselect 1;\n```\ndone');
    expect(segments[0]).toEqual({ type: 'text', value: 'try this:\n' });
    expect(segments[1]).toEqual({ type: 'code', value: 'select 1;', language: 'sql' });
    expect(segments[2]).toEqual({ type: 'text', value: '\ndone' });
  });

  it('closes an unterminated fence at the end of the body', () => {
    const segments = parseMessageBody('```js\nlet a = 1;');
    expect(segments).toEqual([{ type: 'code', value: 'let a = 1;', language: 'js' }]);
  });

  it('returns nothing for an empty body', () => {
    expect(parseMessageBody('')).toEqual([]);
  });
});

describe('extractMentions', () => {
  it('lists handles once, lowercased', () => {
    expect(extractMentions('@Ada and @rahim and @ada')).toEqual(['ada', 'rahim']);
  });

  it('ignores an address without a word boundary', () => {
    expect(extractMentions('mail me at a@b')).toEqual([]);
  });
});

describe('dayKey', () => {
  it('keys a timestamp by its local calendar day', () => {
    const key = dayKey(new Date(2026, 9, 8, 23, 30).toISOString());
    expect(key).toBe('2026-10-08');
  });

  it('returns an empty key for an unparseable value', () => {
    expect(dayKey('not a date')).toBe('');
  });
});

describe('attachmentKind', () => {
  it('reads the extension from the name', () => {
    expect(attachmentKind('photo.PNG')).toBe('image');
    expect(attachmentKind('report.pdf')).toBe('pdf');
    expect(attachmentKind('backup.zip')).toBe('archive');
    expect(attachmentKind('voice-note.webm')).toBe('audio');
    expect(attachmentKind('clip.mp4')).toBe('video');
    expect(attachmentKind('notes.md')).toBe('document');
  });

  it('falls back to the URL when the name is empty, and to file when both fail', () => {
    expect(attachmentKind('', 'https://cdn.example.com/a/b.jpg?token=1')).toBe('image');
    expect(attachmentKind('', 'https://cdn.example.com/a/b')).toBe('file');
  });
});

describe('highlightMatches', () => {
  it('marks every occurrence, case-insensitively', () => {
    expect(highlightMatches('Ada said ada', 'ada')).toEqual([
      { text: 'Ada', hit: true },
      { text: ' said ', hit: false },
      { text: 'ada', hit: true },
    ]);
  });

  it('returns the whole text unmarked for an empty query', () => {
    expect(highlightMatches('anything', '  ')).toEqual([{ text: 'anything', hit: false }]);
  });
});

describe('previewLine', () => {
  it('flattens whitespace and clips with a single character', () => {
    expect(previewLine('one\n\ntwo   three')).toBe('one two three');
    expect(previewLine('abcdef', 4)).toBe('abc…');
  });
});

describe('reaction choices', () => {
  it('offers the same five words posts use, and nothing that is a picture', () => {
    expect([...REACTION_CHOICES]).toEqual([
      'like',
      'insightful',
      'celebrate',
      'support',
      'curious',
    ]);
    for (const choice of REACTION_CHOICES) {
      // A word is a letter run. Anything with a code point outside ASCII is a
      // character someone could mistake for an emoji, and none may be offered.
      expect(/^[a-z]+$/.test(choice)).toBe(true);
    }
  });

  it('accepts only the offered words', () => {
    expect(isReactionChoice('support')).toBe(true);
    expect(isReactionChoice('\u{1F680}')).toBe(false);
    expect(isReactionChoice('\u{2764}\uFE0F')).toBe(false);
    expect(isReactionChoice('LIKE')).toBe(false);
  });
});
