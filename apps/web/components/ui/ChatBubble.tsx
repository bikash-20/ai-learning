import type { ReactNode } from 'react';
import { Markdown } from './Markdown';

export type ChatBubbleProps = {
  role: 'user' | 'assistant';
  children: ReactNode;
};

/**
 * Chat bubble. Assistant bubbles render their string children through
 * the shared Markdown pipeline (KaTeX + GFM + DOMPurify); user bubbles
 * stay plain so we don't reformat human input.
 */
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
      <Markdown>{children}</Markdown>
    );

  return (
    <div className={`flex ${align}`}>
      <div className={`max-w-[80%] rounded-glass px-4 py-2.5 text-sm leading-relaxed ${bubble}`}>
        {content}
      </div>
    </div>
  );
};