import type { SelectHTMLAttributes, ReactNode } from 'react';

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode };

export const Select = ({ className = '', children, ...rest }: SelectProps) => (
  <select
    {...rest}
    className={`glass min-h-[44px] w-full rounded-card border-glass-border px-4 py-2.5 text-sm text-fg ${className}`.trim()}
  >
    {children}
  </select>
);