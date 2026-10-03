/**
 * Inline SVG icons used across the quiz + exam surfaces. Kept tiny so they
 * can be inlined into a button label without a layout shift. Stroke uses
 * `currentColor` so they inherit the button text color in every state.
 */

type IconProps = {
  size?: number;
  className?: string;
  'aria-hidden'?: boolean;
};

const baseProps = (size: number, className: string | undefined, ariaHidden: boolean) => ({
  width: size,
  height: size,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className,
  'aria-hidden': ariaHidden,
});

export const CheckIcon = ({ size = 14, className, 'aria-hidden': ariaHidden = true }: IconProps) => (
  <svg {...baseProps(size, className, ariaHidden)}>
    <path d="M3 8.5l3 3 7-7" />
  </svg>
);

export const XIcon = ({ size = 14, className, 'aria-hidden': ariaHidden = true }: IconProps) => (
  <svg {...baseProps(size, className, ariaHidden)}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
);

export const FlagIcon = ({ size = 14, className, 'aria-hidden': ariaHidden = true }: IconProps) => (
  <svg {...baseProps(size, className, ariaHidden)}>
    <path d="M4 14V3M4 3h8l-1 3 1 3H4" />
  </svg>
);