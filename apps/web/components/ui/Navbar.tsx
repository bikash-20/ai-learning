import Link from 'next/link';
import { NavLink } from '@/components/NavLink';
import { ThemeToggle } from '@/components/ThemeToggle';
import { UserMenu } from '@/components/UserMenu';
import { MobileMenu } from '@/components/MobileMenu';
import { navItems } from './navItems';

export const Navbar = () => (
  <header className="sticky top-3 z-50 mx-auto mt-3 max-w-5xl px-3 sm:px-4">
    <nav className="glass relative flex items-center justify-between gap-3 rounded-glass px-3 py-2 sm:px-6">
      <Link
        href="/"
        className="whitespace-nowrap font-display text-lg text-fg sm:text-xl"
      >
        QUANTARA
      </Link>
      {/* Desktop links */}
      <div className="hidden items-center gap-1 text-sm md:flex">
        {navItems.map((it) => (
          <NavLink key={it.href} href={it.href}>{it.label}</NavLink>
        ))}
        <ThemeToggle />
        <UserMenu />
      </div>
      {/* Mobile hamburger */}
      <MobileMenu />
    </nav>
  </header>
);