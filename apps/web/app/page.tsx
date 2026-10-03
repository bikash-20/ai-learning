import Link from 'next/link';
import { GlassCard } from '@/components/ui/GlassCard';
import { Watermark, ArcWithDots, GlassIconButton } from '@/components/ui/Decoration';

const tiles = [
  { href: '/sign-in', title: 'Sign in', desc: 'Email magic-link, then access everything.' },
  { href: '/chat', title: 'Chat with a tutor', desc: 'Ask anything about English grammar, IELTS, vocabulary.' },
  { href: '/quiz', title: 'Take a quiz', desc: 'AI-generated questions on any topic, any CEFR level.' },
  { href: '/vocab', title: 'Browse vocabulary', desc: 'Authored word lists with examples and level tags.' },
  { href: '/grammar', title: 'Grammar topics', desc: 'Curated grammar explanations with examples.' },
];

export default function Home() {
  return (
    <main className="relative overflow-hidden pt-2 sm:pt-6">
      <Watermark>LEARN</Watermark>

      <section className="relative">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="fluid-display-xl text-fg">AI LEARNING</h1>
            <p className="mt-3 max-w-md text-sm text-muted">
              Practice English with an AI tutor. Built for IELTS, grammar, vocabulary.
            </p>
          </div>
          <GlassIconButton aria-label="Brand">⚡</GlassIconButton>
        </div>
        <ArcWithDots className="mt-4 h-12 w-56" />
      </section>

      <section className="relative mt-8 grid gap-4 sm:mt-10 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href} className="block focus:outline-none">
            <GlassCard hoverable className="h-full transition-transform hover:-translate-y-0.5">
              <div className="fluid-display-md text-fg">{t.title}</div>
              <div className="mt-2 text-sm text-muted">{t.desc}</div>
            </GlassCard>
          </Link>
        ))}
      </section>
    </main>
  );
}