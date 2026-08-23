/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import Linkify from 'linkify-react';
import { cn } from '@/lib/utils';

const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] || []), 'className', 'style', 'id'],
    code: [...(defaultSchema.attributes?.code || []), 'className'],
    span: [...(defaultSchema.attributes?.span || []), 'className'],
    a: [...(defaultSchema.attributes?.a || []), 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
  },
};

/**
 * Sanitized Markdown renderer with GFM tables/task-lists, KaTeX math,
 * code syntax highlighting and linkified plain URLs.
 */
export const Markdown = memo(function Markdown({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn('bsdc-prose', className)}>
      <Linkify
        options={{
          target: '_blank',
          rel: 'noopener noreferrer',
          className: 'text-brand-600 hover:underline dark:text-brand-400',
        }}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeSlug, [rehypeSanitize, sanitizeSchema], rehypeHighlight, [rehypeKatex, { throwOnError: false }]]}
          components={{
            a: ({ children, href }) => (
              <a href={href} target="_blank" rel="noopener noreferrer nofollow">
                {children}
              </a>
            ),
            img: ({ src, alt }) => (
              <img src={src} alt={alt || 'Post image'} loading="lazy" className="rounded-xl" />
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </Linkify>
    </div>
  );
});
