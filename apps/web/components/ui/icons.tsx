/**
 * Inline SVG icon set used across the app. Every icon is 24×24 viewBox,
 * stroke uses the inherited text color, and the component accepts the
 * standard React props for sizing and class composition. This replaces
 * the previous emoji-based icons so the UI looks professional and stays
 * consistent across OS / browser emoji renderers.
 */

export type IconProps = {
  size?: number;
  className?: string;
  /** When true the SVG is hidden from assistive tech — default true. */
  decorative?: boolean;
  /** Required when `decorative` is false. */
  title?: string;
};

const baseProps = (
  size: number,
  className: string | undefined,
  decorative: boolean,
  title: string | undefined,
) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className,
  'aria-hidden': decorative ? true : undefined,
  role: decorative ? undefined : 'img',
  'aria-label': decorative ? undefined : title,
});

/* ── Action icons ─────────────────────────────────────────────── */

export const CheckIcon = ({
  size = 16,
  className,
  decorative = true,
  title,
}: IconProps) => (
  <svg {...baseProps(size, className, decorative, title)}>
    <path d="M4 12.5l5 5L20 6.5" />
  </svg>
);

export const XIcon = ({
  size = 16,
  className,
  decorative = true,
  title,
}: IconProps) => (
  <svg {...baseProps(size, className, decorative, title)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const FlagIcon = ({
  size = 16,
  className,
  decorative = true,
  title,
}: IconProps) => (
  <svg {...baseProps(size, className, decorative, title)}>
    <path d="M5 21V4M5 4h11l-1.5 4 1.5 4H5" />
  </svg>
);

export const ArrowRightIcon = ({
  size = 16,
  className,
  decorative = true,
  title,
}: IconProps) => (
  <svg {...baseProps(size, className, decorative, title)}>
    <path d="M4 12h16M14 6l6 6-6 6" />
  </svg>
);

export const HomeIcon = ({ size = 18, className, decorative = true, title }: IconProps) => (
  <svg {...baseProps(size, className, decorative, title)}>
    <path d="M3 11l9-8 9 8" />
    <path d="M5 10.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9.5" />
  </svg>
);

export const ArrowLeftIcon = ({
  size = 16,
  className,
  decorative = true,
  title,
}: IconProps) => (
  <svg {...baseProps(size, className, decorative, title)}>
    <path d="M20 12H4M10 6l-6 6 6 6" />
  </svg>
);

export const ChevronDownIcon = ({
  size = 16,
  className,
  decorative = true,
  title,
}: IconProps) => (
  <svg {...baseProps(size, className, decorative, title)}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

export const HistoryIcon = ({
  size = 16,
  className,
  decorative = true,
  title,
}: IconProps) => (
  <svg {...baseProps(size, className, decorative, title)}>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v4h4" />
    <path d="M12 8v4l3 2" />
  </svg>
);

export const PlusIcon = ({
  size = 16,
  className,
  decorative = true,
  title,
}: IconProps) => (
  <svg {...baseProps(size, className, decorative, title)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

/** Magnifying glass — used in chat sidebar search. */
export const SearchIcon = ({
  size = 16,
  className,
  decorative = true,
  title,
}: IconProps) => (
  <svg {...baseProps(size, className, decorative, title)}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </svg>
);

/** Horizontal three-dot menu — used in the chat row overflow menu. */
export const MoreIcon = ({
  size = 16,
  className,
  decorative = true,
  title,
}: IconProps) => (
  <svg {...baseProps(size, className, decorative, title)}>
    <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
  </svg>
);

/** Trash / delete — used in chat row overflow menu. */
export const TrashIcon = ({
  size = 16,
  className,
  decorative = true,
  title,
}: IconProps) => (
  <svg {...baseProps(size, className, decorative, title)}>
    <path d="M4 7h16" />
    <path d="M9 7V4h6v3" />
    <path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
    <path d="M10 11v6M14 11v6" />
  </svg>
);

/** Pencil — used in chat row overflow menu (rename). */
export const PencilIcon = ({
  size = 16,
  className,
  decorative = true,
  title,
}: IconProps) => (
  <svg {...baseProps(size, className, decorative, title)}>
    <path d="M4 20l4-1 11-11a2.83 2.83 0 0 0-4-4L4 15z" />
    <path d="M13 6l4 4" />
  </svg>
);

/* ── Feature / tile icons ──────────────────────────────────────── */

export const FlashcardsIcon = ({ size = 20, className, decorative = true, title }: IconProps) => (
  <svg {...baseProps(size, className, decorative, title)}>
    <rect x="3" y="6" width="14" height="12" rx="2" />
    <path d="M7 6V4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9" />
  </svg>
);

export const QuizIcon = ({ size = 20, className, decorative = true, title }: IconProps) => (
  <svg {...baseProps(size, className, decorative, title)}>
    <path d="M12 3a8 8 0 1 1-5.3 14L3 20l1.3-3.7A8 8 0 0 1 12 3z" />
    <path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1 1-1.1 1.8M12 17h.01" />
  </svg>
);

export const PassageIcon = ({ size = 20, className, decorative = true, title }: IconProps) => (
  <svg {...baseProps(size, className, decorative, title)}>
    <path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
    <path d="M8 7h8M8 11h8M8 15h5" />
  </svg>
);

export const VocabIcon = ({ size = 20, className, decorative = true, title }: IconProps) => (
  <svg {...baseProps(size, className, decorative, title)}>
    <path d="M4 4h4a3 3 0 0 1 3 3v13a3 3 0 0 0-3-3H4z" />
    <path d="M20 4h-4a3 3 0 0 0-3 3v13a3 3 0 0 1 3-3h4z" />
  </svg>
);

export const GrammarIcon = ({ size = 20, className, decorative = true, title }: IconProps) => (
  <svg {...baseProps(size, className, decorative, title)}>
    <path d="M4 20l4-1 11-11a2.83 2.83 0 0 0-4-4L4 15z" />
    <path d="M13 6l4 4" />
  </svg>
);

export const ExamIcon = ({ size = 20, className, decorative = true, title }: IconProps) => (
  <svg {...baseProps(size, className, decorative, title)}>
    <path d="M7 3h10l3 4v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4z" />
    <path d="M4 4l7 4 7-4" />
    <path d="M9 13h6M9 17h4" />
  </svg>
);

export const ProgressIcon = ({ size = 20, className, decorative = true, title }: IconProps) => (
  <svg {...baseProps(size, className, decorative, title)}>
    <path d="M3 17l5-5 4 4 7-8" />
    <path d="M14 8h5v5" />
  </svg>
);

export const SettingsIcon = ({ size = 20, className, decorative = true, title }: IconProps) => (
  <svg {...baseProps(size, className, decorative, title)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1A2 2 0 1 1 4.3 17l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8L4.3 7a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1A2 2 0 1 1 19.7 7l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
);

export const AdminIcon = ({ size = 20, className, decorative = true, title }: IconProps) => (
  <svg {...baseProps(size, className, decorative, title)}>
    <path d="M14 4l6 6-9 9-3 3-3-3-3 3-3-3 3-3 3-3 9-9z" />
    <path d="M14 4l3 3M17 7l3 3" />
  </svg>
);

/* ── Marketing / hero icons ───────────────────────────────────── */

export const SparkleIcon = ({ size = 20, className, decorative = true, title }: IconProps) => (
  <svg {...baseProps(size, className, decorative, title)}>
    <path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />
    <path d="M19 14l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM5 5l.7 1.5L7 7l-1.3.5L5 9l-.7-1.5L3 7l1.3-.5z" />
  </svg>
);

export const BrainIcon = ({ size = 20, className, decorative = true, title }: IconProps) => (
  <svg {...baseProps(size, className, decorative, title)}>
    <path d="M9 4a3 3 0 0 0-3 3v1a3 3 0 0 0-2 5 3 3 0 0 0 2 5v1a3 3 0 0 0 6 0V4a3 3 0 0 0-3 0z" />
    <path d="M15 4a3 3 0 0 1 3 3v1a3 3 0 0 1 2 5 3 3 0 0 1-2 5v1a3 3 0 0 1-6 0" />
  </svg>
);

export const SatelliteIcon = ({ size = 20, className, decorative = true, title }: IconProps) => (
  <svg {...baseProps(size, className, decorative, title)}>
    <path d="M5 14l5-7 5 7-5 7z" />
    <circle cx="10" cy="11" r="1.5" />
    <path d="M16 4l-2 3M20 4l-3 2M3 19l3-2M18 19l-2-3" />
  </svg>
);

export const ChatBubbleIcon = ({ size = 18, className, decorative = true, title }: IconProps) => (
  <svg {...baseProps(size, className, decorative, title)}>
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.3-3.7A8 8 0 1 1 21 12z" />
  </svg>
);

/* ── Theme + XP ───────────────────────────────────────────────── */

export const StarIcon = ({
  size = 14,
  className,
  decorative = true,
  title,
  /** Solid fill for emphasis; defaults to outline to match other icons. */
  filled = true,
}: IconProps & { filled?: boolean }) => (
  <svg
    {...baseProps(size, className, decorative, title)}
    fill={filled ? 'currentColor' : 'none'}
    stroke={filled ? 'currentColor' : 'currentColor'}
  >
    <path d="M12 3l2.6 5.5 6 .9-4.3 4.2 1 6-5.3-2.8-4.3 2.8 1-6L4.4 9.4l6-.9z" />
  </svg>
);

export const SunIcon = ({ size = 14, className, decorative = true, title }: IconProps) => (
  <svg {...baseProps(size, className, decorative, title)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4l1.4-1.4M17 7l1.4-1.4" />
  </svg>
);

export const MoonIcon = ({ size = 14, className, decorative = true, title }: IconProps) => (
  <svg {...baseProps(size, className, decorative, title)}>
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
  </svg>
);