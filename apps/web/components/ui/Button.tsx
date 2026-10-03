import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'icon';
type Size = 'sm' | 'md';

const base =
  'inline-flex items-center justify-center gap-2 rounded-pill font-medium ' +
  'transition-[background-color,box-shadow,transform,border-color] duration-150 ' +
  'disabled:cursor-not-allowed disabled:opacity-50 select-none ' +
  'min-h-[44px]';

const sizeMap: Record<Size, string> = {
  sm: 'px-4 py-2 text-xs',
  md: 'px-5 py-2.5 text-sm',
};

const variantMap: Record<Variant, string> = {
  primary:
    'bg-primary text-primary-fg shadow-[0_0_18px_-2px_color-mix(in_oklab,var(--glow)_55%,transparent)] ' +
    'hover:bg-primary-hover hover:shadow-[0_0_22px_-2px_color-mix(in_oklab,var(--glow)_75%,transparent)]',
  secondary:
    'bg-transparent text-accent-fg border-[1.5px] border-accent ' +
    'hover:shadow-[0_0_18px_-2px_color-mix(in_oklab,var(--glow)_70%,transparent)]',
  ghost:
    'bg-transparent text-fg border border-border ' +
    'hover:border-accent',
  icon:
    'bg-glass-bg text-fg border border-glass-border rounded-full p-0 ' +
    'hover:shadow-[0_0_18px_-2px_color-mix(in_oklab,var(--glow)_70%,transparent)]',
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
};

export const Button = ({ variant = 'primary', size = 'md', className = '', children, ...rest }: ButtonProps) => (
  <button {...rest} className={`${base} ${sizeMap[size]} ${variantMap[variant]} ${className}`.trim()}>
    {children}
  </button>
);