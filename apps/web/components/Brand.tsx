import type { SVGProps } from 'react';

/**
 * Placeholder brand mark. A geometric "Q" inside a glass ring. The
 * design is intentionally token-driven (currentColor + CSS vars) so it
 * swaps cleanly between light and dark mode. Drop a real SVG in
 * /public/brand-mark.svg and swap this component to render it without
 * touching any caller.
 *
 * The shape is recognizable as a "Q" without being a third-party logo:
 * a filled circle with a small notch (the Q's tail) at the bottom-right.
 */
export const BrandMark = ({
  size = 36,
  withRing = true,
  ...rest
}: { size?: number; withRing?: boolean } & Omit<SVGProps<SVGSVGElement>, 'width' | 'height'>) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 40 40"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    {...rest}
  >
    {withRing && (
      <defs>
        <linearGradient id="qg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--primary)" />
          <stop offset="100%" stopColor="var(--accent)" />
        </linearGradient>
      </defs>
    )}
    {/* Glass-tinted outer ring */}
    <circle cx="20" cy="20" r="18" fill={withRing ? 'url(#qg)' : 'currentColor'} opacity={withRing ? 1 : 0.18} />
    {/* Inner cutout to make it read as a ring */}
    <circle cx="20" cy="20" r="13" fill="var(--background)" />
    {/* Filled "Q" body (a small dot) */}
    <circle cx="20" cy="20" r="6" fill="currentColor" />
    {/* Q tail — diagonal stroke that crosses the ring on the bottom-right */}
    <path
      d="M24 24 L30 30"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
    />
  </svg>
);

/**
 * Inline wordmark for places that want the full "QUANTARA" text alongside
 * the mark. Uses the existing display font (Bebas Neue) so it matches the
 * rest of the app's brand voice.
 */
export const BrandWordmark = ({ size = 'md' as 'sm' | 'md' | 'lg' }) => {
  const cls =
    size === 'lg'
      ? 'text-2xl sm:text-3xl'
      : size === 'sm'
        ? 'text-sm sm:text-base'
        : 'text-lg sm:text-xl';
  return (
    <span className={`whitespace-nowrap font-display tracking-display ${cls}`}>
      QUANTARA
    </span>
  );
};

/**
 * "Founder & CEO · Bikash Talukder" credit. Used under the brand block on
 * the hub and under the sign-in card. Pulls from `BRAND.founder` so the
 * credit stays in sync with brand.ts.
 */
import { BRAND } from '@/lib/brand';
export const FounderCredit = ({ compact = false }: { compact?: boolean }) => {
  if (compact) {
    return (
      <p className="text-xs text-muted">
        {BRAND.founder.title} · {BRAND.founder.name}
      </p>
    );
  }
  return (
    <div className="text-center">
      <p className="text-xs uppercase tracking-wide text-muted">
        {BRAND.founder.title}
      </p>
      <p
        className="mt-1 text-base font-medium text-fg"
        style={{ fontFamily: 'var(--font-hero), serif' }}
      >
        {BRAND.founder.name}
      </p>
      <p className="mt-0.5 text-xs text-muted">{BRAND.founder.role}</p>
    </div>
  );
};