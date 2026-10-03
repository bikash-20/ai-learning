'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/useSession';
import { PageHeader } from '@/components/ui/PageHeader';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/ui/LoadingState';

const tiles = [
  { href: '/chat', title: 'Chat with a tutor', desc: 'Ask anything about English grammar, IELTS, vocabulary.' },
  { href: '/quiz', title: 'Take a quiz', desc: 'AI-generated questions on any topic, any CEFR level.' },
  { href: '/vocab', title: 'Browse vocabulary', desc: 'Authored word lists with examples and level tags.' },
  { href: '/grammar', title: 'Grammar topics', desc: 'Curated grammar explanations with examples.' },
];

export default function ExplorePage() {
  const router = useRouter();
  const { loading, user, signOut } = useSession();

  useEffect(() => {
    if (!loading && !user) router.replace('/sign-in');
  }, [loading, user, router]);

  if (loading) {
    return (
      <main className="mx-auto max-w-xl">
        <LoadingState>
          <div className="text-sm text-muted">Checking your session…</div>
        </LoadingState>
      </main>
    );
  }

  if (!user) return null;

  return (
    <main className="relative">
      <PageHeader
        title="Explore"
        subtitle={user.name ? `Hi ${user.name} — pick a learning mode.` : `Hi ${user.email} — pick a learning mode.`}
        right={
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            Sign out
          </Button>
        }
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
        <div className="mt-1 text-sm text-fg">{user.email}</div>
      </GlassCard>
    </main>
  );
}