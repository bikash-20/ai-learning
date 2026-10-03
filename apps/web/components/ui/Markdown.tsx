import { useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import DOMPurify from 'dompurify';

/**
 * Sanitize a string of Markdown before it goes into `react-markdown`.
 * KaTeX + highlight.js produce known-safe output, but user-supplied
 * content (the prompt itself) and any future model output must pass
 * through DOMPurify to strip `<script>`, `on*=` attributes, and
 * `javascript:` URLs. We allow the language-* class names that
 * highlight.js emits so the code-block syntax highlighting survives.
 */
export const sanitizeMarkdown = (input: string): string => {
  if (typeof window === 'undefined') return input;
  return DOMPurify.sanitize(input, {
    ADD_ATTR: ['className', 'class', 'style'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
    USE_PROFILES: { html: true, mathMl: true, svg: true },
  });
};

/**
 * Copy button overlay for fenced code blocks. `react-markdown` passes
 * us a `code` element via `components.code`; we sniff for the
 * `<pre><code>` shape (the only one `react-markdown` wraps in `<pre>`)
 * so we don't add a Copy button to inline code spans.
 */
export const CodeBlock = ({ className, children }: ComponentProps<'code'>) => {
  const [copied, setCopied] = useState(false);
  const text = useMemo(() => {
    if (typeof children === 'string') return children;
    if (Array.isArray(children)) return children.filter((c) => typeof c === 'string').join('');
    return '';
  }, [children]);

  const lang = (className ?? '').match(/language-(\w+)/)?.[1];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard denied — silent */
    }
  };

  return (
    <div className="relative my-2 group">
      {lang && (
        <span className="absolute top-1 left-2 text-[0.65rem] uppercase tracking-wider text-white/40 font-mono">
          {lang}
        </span>
      )}
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copy code"
        className="absolute top-1 right-1 rounded-md bg-white/5 hover:bg-white/15 active:bg-white/25 px-2 py-1 text-[0.7rem] font-medium text-white/80 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <code className={className}>{children}</code>
    </div>
  );
};

const markdownComponents = {
  code: CodeBlock,
} as const;

export type MarkdownProps = {
  /** Markdown source. */
  children: string;
  /** Extra className on the wrapper. */
  className?: string;
  /** When true (default), sanitizes the input through DOMPurify. */
  sanitize?: boolean;
};

/**
 * Shared Markdown renderer used by the chat bubble, flashcard backs, and
 * the AI Explain panel. Renders GFM, KaTeX math, and code-block syntax
 * highlighting (highlight.js themes are imported in `app/globals.css`).
 *
 * For non-string children, the component renders them as-is.
 */
export const Markdown = ({ children, className = '', sanitize = true }: MarkdownProps) => {
  if (typeof children !== 'string') return <>{children as ReactNode}</>;
  const src = sanitize ? sanitizeMarkdown(children) : children;
  return (
    <div className={`prose-quiet ${className}`.trim()}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeKatex, [rehypeHighlight, { ignoreMissing: true }]]}
        components={markdownComponents}
      >
        {src}
      </ReactMarkdown>
    </div>
  );
};
