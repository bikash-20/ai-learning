import { useMemo, useState, type ReactNode, type ComponentProps } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import DOMPurify from 'dompurify';

export type ChatBubbleProps = {
  role: 'user' | 'assistant';
  children: ReactNode;
};

/**
 * Sanitize a string of Markdown before it goes into `react-markdown`.
 * KaTeX + highlight.js produce known-safe output, but user-supplied
 * content (the prompt itself) and any future model output must pass
 * through DOMPurify to strip `<script>`, `on*=` attributes, and
 * `javascript:` URLs. We allow the language-* class names that
 * highlight.js emits so the code-block syntax highlighting survives.
 */
const sanitize = (input: string): string => {
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
const CodeBlock = ({ className, children }: ComponentProps<'code'>) => {
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

/**
 * Markdown components map. We pre-wrap every code element via
 * `CodeBlock` (it renders the Copy button), and let everything else
 * fall through to react-markdown's defaults. Headings, lists, tables
 * and blockquotes all get typography via `.prose-quiet` on the
 * wrapper.
 */
const markdownComponents = {
  code: CodeBlock,
} as const;

export const ChatBubble = ({ role, children }: ChatBubbleProps) => {
  const align = role === 'user' ? 'justify-end' : 'justify-start';
  const bubble =
    role === 'user'
      ? 'bg-primary text-primary-fg'
      : 'glass text-fg';
  const isUser = role === 'user';

  // Markdown rendering only applies to assistant bubbles. User
  // messages are rendered as plain text (they're typed by a human,
  // not a model, and we don't want to reformat them).
  const content =
    isUser || typeof children !== 'string' ? (
      children
    ) : (
      <div className="prose-quiet">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeKatex, [rehypeHighlight, { ignoreMissing: true }]]}
          components={markdownComponents}
        >
          {sanitize(children)}
        </ReactMarkdown>
      </div>
    );

  return (
    <div className={`flex ${align}`}>
      <div className={`max-w-[80%] rounded-glass px-4 py-2.5 text-sm leading-relaxed ${bubble}`}>
        {content}
      </div>
    </div>
  );
};