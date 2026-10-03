import type { SVGProps } from 'react';

export const Watermark = ({ children }: { children: string }) => (
  <div
    aria-hidden="true"
    className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 select-none text-center font-display text-[28vw] leading-none tracking-display text-fg/[0.06] sm:text-[18vw]"
  >
    {children}
  </div>
);

export const ArcWithDots = (props: SVGProps<SVGSVGElement>) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 220 60"
    fill="none"
    stroke="currentColor"
    strokeWidth="1"
    className="text-accent"
    {...props}
  >
    <path d="M10 50 Q110 -20 210 50" strokeLinecap="round" />
    {[20, 70, 110, 150, 200].map((cx) => (
      <circle key={cx} cx={cx} cy={cx === 110 ? 30 : cx < 110 ? 38 : 42} r="2" fill="currentColor" stroke="none" />
    ))}
  </svg>
);

export const GlassIconButton = ({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button
    {...rest}
    className="glass inline-flex h-10 w-10 items-center justify-center rounded-full text-fg transition-shadow hover:shadow-glow"
  >
    {children}
  </button>
);