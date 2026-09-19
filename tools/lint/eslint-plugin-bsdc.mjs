/**
 * BSDC — tools/lint/eslint-plugin-bsdc.mjs
 * Purpose : Local ESLint plugin holding the two platform laws that no off-the-shelf rule covers:
 *           LAW-01 (no emoji anywhere) and LAW-02 (no placeholder text in shipped code).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Loaded by eslint.config.js; a standalone scanner (tools/lint/no-emoji.mjs) applies
 *           the same ranges to Markdown, JSON, CSS and built assets, which ESLint cannot parse.
 *           Arrow glyphs (U+2190..U+21FF) are deliberately NOT flagged: they are typography,
 *           not pictographs. Regional-indicator pairs (U+1F1E6..U+1F1FF) ARE flagged.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */

/** Ranges that are unambiguously emoji pictographs or emoji modifiers. */
const EMOJI_PATTERNS = [
  /[\u{1F300}-\u{1FAFF}]/u, // misc symbols, pictographs, transport, supplemental
  /[\u{1F000}-\u{1F2FF}]/u, // mahjong, cards, enclosed ideographic supplement
  /[\u{2600}-\u{27BF}]/u, // misc symbols + dingbats
  /\u{FE0F}/u, // variation selector-16 (emoji presentation)
  /[\u{1F1E6}-\u{1F1FF}]/u, // regional indicator symbols (flags)
];

/** Placeholder vocabulary that must never ship (LAW-02). */
const PLACEHOLDER_PATTERNS = [
  /\bTODO\b/,
  /\bFIXME\b/,
  /\bXXX\b/,
  /\blorem ipsum\b/i,
  /\bJohn Doe\b/i,
  /\bcoming soon\b/i,
  /\bsample data\b/i,
  /\bdemo user\b/i,
  /\bplaceholder\b/i,
];

/** Human-readable description of a match, used in the reported message. */
function describeEmoji(value) {
  return Array.from(value)
    .filter((char) => EMOJI_PATTERNS.some((pattern) => pattern.test(char)))
    .map((char) => `U+${char.codePointAt(0)?.toString(16).toUpperCase()}`)
    .join(', ');
}

/** @type {import('eslint').ESLint.Plugin} */
const plugin = {
  meta: {
    name: 'eslint-plugin-bsdc',
    version: '1.0.0',
  },
  rules: {
    'no-emoji': {
      meta: {
        type: 'problem',
        docs: {
          description: 'LAW-01: no emoji in string literals, JSX text, templates or comments.',
        },
        messages: {
          emoji:
            'BSDC LAW-01: emoji are forbidden in the product ({{ codePoints }}). Use an SVG icon instead.',
        },
        schema: [],
      },
      create(context) {
        /** @param {import('estree').Node} node @param {string} value */
        const check = (node, value) => {
          if (EMOJI_PATTERNS.some((pattern) => pattern.test(value))) {
            context.report({
              node,
              messageId: 'emoji',
              data: { codePoints: describeEmoji(value) },
            });
          }
        };
        return {
          Literal(node) {
            if (typeof node.value === 'string') {
              check(node, node.value);
            }
          },
          TemplateElement(node) {
            check(node, String(node.value?.cooked ?? node.value?.raw ?? ''));
          },
          JSXText(node) {
            check(node, String(node.value ?? ''));
          },
          JSXAttribute(node) {
            const value = node.value;
            if (value && value.type === 'Literal' && typeof value.value === 'string') {
              check(node, value.value);
            }
          },
          Program() {
            const comments = context.sourceCode.getAllComments();
            for (const comment of comments) {
              check(comment, comment.value);
            }
          },
        };
      },
    },
    'no-placeholder-text': {
      meta: {
        type: 'problem',
        docs: { description: 'LAW-02: no placeholder, TODO or demo content in shipped code.' },
        messages: {
          placeholder:
            'BSDC LAW-02: placeholder text "{{ match }}" is forbidden in shipped source. Deliver the real implementation.',
        },
        schema: [],
      },
      create(context) {
        /** @param {import('estree').Node} node @param {string} value */
        const check = (node, value) => {
          for (const pattern of PLACEHOLDER_PATTERNS) {
            const found = pattern.exec(value);
            if (found) {
              context.report({
                node,
                messageId: 'placeholder',
                data: { match: found[0] },
              });
            }
          }
        };
        return {
          Literal(node) {
            if (typeof node.value === 'string') {
              check(node, node.value);
            }
          },
          TemplateElement(node) {
            check(node, String(node.value?.cooked ?? node.value?.raw ?? ''));
          },
          JSXText(node) {
            check(node, String(node.value ?? ''));
          },
        };
      },
    },
  },
};

export default plugin;
export { EMOJI_PATTERNS, PLACEHOLDER_PATTERNS };
