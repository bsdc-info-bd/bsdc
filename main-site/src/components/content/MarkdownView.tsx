import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

export interface MarkdownViewProps {
  markdown: string;
  className?: string;
  /** Highlighting is skipped for short previews to keep typing responsive. */
  highlight?: boolean;
}

const HIGHLIGHT_LANGUAGES = [
  'typescript',
  'javascript',
  'php',
  'python',
  'dart',
  'java',
  'kotlin',
  'go',
  'rust',
  'sql',
  'bash',
  'json',
  'xml',
  'css',
] as const;

let highlighter: Promise<(element: HTMLElement) => void> | null = null;

/** Loads highlight.js once, with only the languages BSDC actually uses. */
async function getHighlighter(): Promise<(element: HTMLElement) => void> {
  if (!highlighter) {
    highlighter = (async () => {
      const { default: hljs } = await import('highlight.js/lib/core');
      const modules = await Promise.all([
        import('highlight.js/lib/languages/typescript'),
        import('highlight.js/lib/languages/javascript'),
        import('highlight.js/lib/languages/php'),
        import('highlight.js/lib/languages/python'),
        import('highlight.js/lib/languages/dart'),
        import('highlight.js/lib/languages/java'),
        import('highlight.js/lib/languages/kotlin'),
        import('highlight.js/lib/languages/go'),
        import('highlight.js/lib/languages/rust'),
        import('highlight.js/lib/languages/sql'),
        import('highlight.js/lib/languages/bash'),
        import('highlight.js/lib/languages/json'),
        import('highlight.js/lib/languages/xml'),
        import('highlight.js/lib/languages/css'),
      ]);
      modules.forEach((module, index) => {
        const name = HIGHLIGHT_LANGUAGES[index];
        if (name) hljs.registerLanguage(name, module.default);
      });
      return (element: HTMLElement) => {
        element.querySelectorAll<HTMLElement>('pre code').forEach((block) => {
          hljs.highlightElement(block);
        });
      };
    })();
  }
  return highlighter;
}

/**
 * Renders member markdown. The HTML always comes from `renderMarkdown`,
 * which sanitises it, so this is the only safe way to display contributions.
 */
export function MarkdownView({ markdown, className, highlight = true }: MarkdownViewProps) {
  const [html, setHtml] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    void import('@/lib/content/markdown')
      .then(({ renderMarkdown }) => {
        if (active) setHtml(renderMarkdown(markdown));
      })
      .catch(() => {
        if (active) setHtml('');
      });
    return () => {
      active = false;
    };
  }, [markdown]);

  useEffect(() => {
    if (!highlight || html.length === 0) return;
    const element = containerRef.current;
    if (!element) return;
    let active = true;
    void getHighlighter()
      .then((run) => {
        if (active) run(element);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [html, highlight]);

  return (
    <div
      ref={containerRef}
      className={cn('bsdc-markdown', className)}
      // Sanitised by lib/content/markdown.ts — see that module for the policy.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
