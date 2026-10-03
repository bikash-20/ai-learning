import Link from 'next/link';
import { NavLink } from '@/components/NavLink';
import { ThemeToggle } from '@/components/ThemeToggle';
import { UserMenu } from '@/components/UserMenu';
import { BrandMark, BrandWordmark } from '@/components/Brand';
import { navItems } from '@/components/ui/navItems';

/**
 * Desktop navbar (md and up). On mobile we render MobileTopBar + BottomTabBar
 * from the (app) layout — this component hides itself below md so we don't
 * double-stack chrome.
 *
 * Logo goes to /explore (the hub) so the navbar is a true "home" — never
 * to the marketing root, which is now a quiet fall-through.
 */
export const Navbar = () => (
  <header className="sticky top-3 z-50 mx-auto mt-3 hidden max-w-5xl px-3 md:block sm:px-4">
    <nav className="glass relative flex items-center justify-between gap-3 rounded-glass px-3 py-2 sm:px-6">
      <Link
        href="/explore"
        className="flex items-center gap-2 whitespace-nowrap text-fg"
        aria-label="Quantara — go to Explore"
      >
        <BrandMark size={28} />
        <BrandWordmark size="md" />
      </Link>
      {/* Desktop links */}
      <div className="hidden items-center gap-1 text-sm md:flex">
        {navItems.map((it) => (
          <NavLink key={it.href} href={it.href}>{it.label}</NavLink>
        ))}
        <ThemeToggle />
        <UserMenu />
      </div>
    </nav>
  </header>
);