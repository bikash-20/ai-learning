'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export const NavLink = ({ href, children }: { href: string; children: React.ReactNode }) => {
  const pathname = usePathname();
  const active = pathname === href || (href !== '/' && pathname?.startsWith(href));
  return (
    <Link
      href={href}
      className={`relative rounded-pill px-3 py-1.5 text-sm transition-colors ${
        active ? 'text-fg after:absolute after:inset-x-3 after:-bottom-0.5 after:h-0.5 after:rounded-full after:bg-accent' : 'text-muted hover:text-fg'
      }`}
    >
      {children}
    </Link>
  );
};