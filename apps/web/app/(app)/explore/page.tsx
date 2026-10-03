'use client';

import Link from 'next/link';
import { useSession } from '@/lib/useSession';
import { PageHeader } from '@/components/ui/PageHeader';
import { GlassCard } from '@/components/ui/GlassCard';

const tiles = [
  { href: '/chat', title: 'Chat with a tutor', desc: 'Ask anything about English grammar, IELTS, vocabulary.' },
  { href: '/quiz', title: 'Take a quiz', desc: 'AI-generated questions on any topic, any CEFR level.' },
  { href: '/vocab', title: 'Browse vocabulary', desc: 'Authored word lists with examples and level tags.' },
  { href: '/grammar', title: 'Grammar topics', desc: 'Curated grammar explanations with examples.' },
];

export default function ExplorePage() {
  // The (app) layout has already verified the session and will redirect to
  // /sign-in if not signed in. We still read the user here so the greeting
  // can be personalised.
  const { user } = useSession();

  return (
    <main className="relative">
      <PageHeader
        title="Explore"
        subtitle={user ? (user.name ? `Hi ${user.name} — pick a learning mode.` : `Hi ${user.email} — pick a learning mode.`) : 'Loading…'}
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href} className="block focus:outline-none">
            <GlassCard hoverable className="h-full transition-transform hover:-translate-y-0.5">
              <div className="fluid-display-md text-fg">{t.title}</div>
              <div className="mt-2 text-sm text-muted">{t.desc}</div>
            </GlassCard>
          </Link>
        ))}
      </section>

      <GlassCard className="mt-8">
        <div className="text-xs uppercase tracking-wide text-muted">Account</div>
        <div className="mt-1 text-sm text-fg">{user?.email ?? ''}</div>
      </GlassCard>
    </main>
  );
}