import type { HTMLAttributes, ReactNode } from 'react';

type GlassCardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  hoverable?: boolean;
};

export const GlassCard = ({ children, hoverable, className = '', ...rest }: GlassCardProps) => (
  <div
    {...rest}
    className={`glass p-5 ${hoverable ? 'transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_40px_-8px_color-mix(in_oklab,var(--glow)_60%,transparent)]' : ''} ${className}`.trim()}
  >
    {children}
  </div>
);