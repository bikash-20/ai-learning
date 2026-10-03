import type { InputHTMLAttributes } from 'react';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = ({ className = '', ...rest }: InputProps) => (
  <input
    {...rest}
    className={`glass min-h-[44px] w-full rounded-card border-glass-border px-4 py-2.5 text-sm text-fg placeholder:text-muted ${className}`.trim()}
  />
);