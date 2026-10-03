import type { ReactNode } from 'react';

export type ChatBubbleProps = {
  role: 'user' | 'assistant';
  children: ReactNode;
};

export const ChatBubble = ({ role, children }: ChatBubbleProps) => {
  const align = role === 'user' ? 'justify-end' : 'justify-start';
  const bubble =
    role === 'user'
      ? 'bg-primary text-primary-fg'
      : 'glass text-fg';
  return (
    <div className={`flex ${align}`}>
      <div className={`max-w-[80%] rounded-glass px-4 py-2.5 text-sm leading-relaxed ${bubble}`}>
        {children}
      </div>
    </div>
  );
};