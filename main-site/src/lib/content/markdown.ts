import createDomPurify from 'dompurify';
import { marked, type Tokens } from 'marked';

/**
 * Markdown rendering is always sanitised.
 *
 * marked produces HTML, DOMPurify removes anything executable, and the hooks
 * below force every external link to open safely and every image to load
 * lazily. Member content is never trusted, so this module is the only place
 * allowed to produce HTML for `dangerouslySetInnerHTML`.
 */
const ALLOWED_TAGS = [
  'p',
  'br',
  'hr',
  'strong',
  'em',
  'del',
  'blockquote',
  'ul',
  'ol',
  'li',
  'a',
  'code',
  'pre',
  'span',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'img',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'figure',
  'figcaption',
];

const ALLOWED_ATTR = ['href', 'title', 'alt', 'src', 'class', 'target', 'rel', 'loading'];

let configured = false;

function purifier(): typeof createDomPurify {
  const instance = createDomPurify;
  if (!configured) {
    instance.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName === 'A') {
        const href = node.getAttribute('href') ?? '';
        const external = /^https?:\/\//i.test(href);
        if (external) {
          node.setAttribute('target', '_blank');
          // Member links are user generated: never pass authority on.
          node.setAttribute('rel', 'nofollow ugc noopener noreferrer');
        } else {
          node.removeAttribute('target');
          node.setAttribute('rel', 'noopener');
        }
      }
      if (node.tagName === 'IMG') {
        node.setAttribute('loading', 'lazy');
        node.setAttribute('decoding', 'async');
      }
    });
    configured = true;
  }
  return instance;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const renderer = new marked.Renderer();

renderer.code = ({ text, lang }: Tokens.Code): string => {
  const language = (lang ?? '').replace(/[^a-z0-9+#-]/gi, '').toLowerCase();
  const className = language.length > 0 ? ` class="language-${language}"` : '';
  return `<pre class="bsdc-code"><code${className}>${escapeHtml(text)}</code></pre>`;
};

marked.use({
  renderer,
  gfm: true,
  breaks: true,
  async: false,
});

/** Converts mentions and hashtags into real links before markdown runs. */
function linkEntities(markdown: string): string {
  return markdown
    .replace(/(^|[\s(])@([a-z0-9_]{3,24})\b/g, '$1[@$2](/@$2)')
    .replace(/(^|[\s(])#([a-z0-9][a-z0-9-]{1,31})\b/g, '$1[#$2](/tag/$2)');
}

/** Markdown to sanitised HTML. Never returns script-bearing output. */
export function renderMarkdown(markdown: string): string {
  const html = marked.parse(linkEntities(markdown), { async: false });
  return purifier().sanitize(typeof html === 'string' ? html : '', {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form', 'input'],
    FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick'],
  });
}

/** Sanitises already-rendered HTML, used when content arrives pre-rendered. */
export function sanitizeHtml(html: string): string {
  return purifier().sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR, ALLOW_DATA_ATTR: false });
}
