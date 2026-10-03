'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/useSession';
import { useTheme, type ThemeChoice } from '@/lib/useTheme';
import { SunIcon, MoonIcon } from '@/components/ui/icons';

/**
 * Shared body of the avatar menu used in BOTH the desktop `<UserMenu>`
 * (rendered as a dropdown under the navbar) and the new mobile
 * `<MobileAvatarMenu>` (rendered as a bottom sheet inside a `<Modal>`).
 *
 * Keeping a single source of truth means name/email + theme + logout
 * are rendered identically across viewports — same labels, same icons,
 * same keyboard semantics.
 *
 * Visual recipe:
 *  - Header: "Signed in as" + email (clamped to a single line).
 *  - Theme row: live label (Light/Dark/System) so the user can tell what
 *    is active without having to remember what they clicked last.
 *  - Logout row: full-width, danger-tinted border on hover.
 *
 * Touch targets: every row is `min-h-[44px]` so it satisfies Apple HIG
 * on phones and looks the same on desktop.
 */
export type AvatarMenuBodyProps = {
  /** Optional slot rendered at the top (e.g. a "Back to Explore" link in a future variant). */
  headerExtra?: ReactNode;
  /** Called after logout completes and we're about to navigate away. */
  onAfterAction?: () => void;
};

const themeLabel: Record<ThemeChoice, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
};

export const AvatarMenuBody = ({ headerExtra, onAfterAction }: AvatarMenuBodyProps) => {
  const router = useRouter();
  const { user, signOut } = useSession();
  const { theme, setTheme } = useTheme();

  const handleSignOut = async () => {
    await signOut();
    onAfterAction?.();
    router.replace('/sign-in');
  };

  const cycleTheme = () => {
    // Skip "system" — the spec is light/dark only, so we just flip between
    // the two. Persists to localStorage via useTheme.
    setTheme(theme === 'dark' ? 'light' : 'dark');
    onAfterAction?.();
  };

  return (
    <div className="flex flex-col gap-1 text-sm">
      <div className="px-2 pb-1.5 text-xs uppercase tracking-wide text-muted">Signed in as</div>
      <div className="px-2 pb-3 text-sm text-fg break-words">
        {user?.name ? (
          <>
            <div className="font-medium">{user.name}</div>
            <div className="text-xs text-muted">{user.email}</div>
          </>
        ) : (
          user?.email ?? 'Not signed in'
        )}
      </div>
      {headerExtra}

      <div className="my-1 border-t border-glass-border" />

      <button
        type="button"
        role="menuitem"
        onClick={cycleTheme}
        aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        className="flex min-h-[44px] w-full items-center gap-2 rounded-md px-2 text-left text-fg hover:bg-glass-bg/40"
      >
        <span aria-hidden="true" className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-glass-border bg-glass-bg text-fg">
          {theme === 'dark' ? <MoonIcon size={14} decorative /> : <SunIcon size={14} decorative />}
        </span>
        <span className="flex-1">Theme</span>
        <span className="text-xs text-muted">{themeLabel[theme]}</span>
      </button>

      <button
        type="button"
        role="menuitem"
        onClick={handleSignOut}
        className="flex min-h-[44px] w-full items-center gap-2 rounded-md border border-transparent px-2 text-left text-fg hover:border-danger/40 hover:bg-danger/10 hover:text-danger"
      >
        <span aria-hidden="true" className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-glass-border bg-glass-bg text-fg">
          ↩︎
        </span>
        <span className="flex-1">Logout</span>
      </button>
    </div>
  );
};
