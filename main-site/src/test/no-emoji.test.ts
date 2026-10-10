import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The product draws its symbols as SVG and nothing else.
 *
 * An emoji in a button, a label or a reaction is a picture the operating system
 * draws differently on every phone, and it reaches a member as a different
 * image from the one the design shows. Reactions and the composer's emoji tray
 * were both emoji until this rule was enforced, so the rule now fails the build
 * rather than waiting for someone to remember it.
 *
 * Only what a visitor can see is checked: the application source and the
 * functions that answer requests. Test files are excluded, so a test that
 * asserts emoji are refused may name one; this file writes every code point as
 * an escape so that it, too, carries none.
 */

const ROOTS = [join(process.cwd(), 'src'), join(process.cwd(), 'functions')];

// Pictographs, dingbats and the regional-indicator flags, plus the joiner and
// variation selector that make a sequence of them one picture. Written as
// escapes so this file itself contains none of the characters it forbids.
const EMOJI =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\u{1F1E6}-\u{1F1FF}]|\u{FE0F}|\u{200D}/u;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry === 'node_modules') continue;
      walk(path, out);
    } else if (/\.(ts|tsx|css|html)$/.test(path) && !/\.test\./.test(path)) {
      out.push(path);
    }
  }
  return out;
}

describe('the product carries no emoji', () => {
  it('reads every visible source file and finds no emoji in any of them', () => {
    const files = ROOTS.flatMap((root) => walk(root));
    expect(files.length).toBeGreaterThan(100);

    const offenders: string[] = [];
    for (const file of files) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, index) => {
        if (EMOJI.test(line)) {
          offenders.push(`${file.replace(process.cwd(), '')}:${index + 1}`);
        }
      });
    }

    expect(offenders).toEqual([]);
  });

  it('would catch the characters the thread used to store', () => {
    // A guard that never fires is not a guard. These are the two forms the
    // reaction set and the emoji tray were written in: a plain pictograph and
    // one with a variation selector.
    expect(EMOJI.test('\u{1F44D}')).toBe(true);
    expect(EMOJI.test('\u{2764}\u{FE0F}')).toBe(true);
    expect(EMOJI.test('\u{1F1E7}\u{1F1E9}')).toBe(true);
    expect(EMOJI.test('plain words, অথবা বাংলা')).toBe(false);
  });

  it('leaves the Bangla script and ordinary punctuation alone', () => {
    // The bundle is in Bangla as well as English; a rule that caught the script
    // would take the community's own language off the screen.
    expect(EMOJI.test('কভার ছবি বেছে নিন')).toBe(false);
    expect(EMOJI.test('“quoted” — dash · bullet …')).toBe(false);
  });
});
