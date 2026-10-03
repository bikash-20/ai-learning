import Link from 'next/link';

const tiles = [
  { href: '/sign-in', title: 'Sign in', desc: 'Email magic-link, then access everything.' },
  { href: '/chat', title: 'Chat with a tutor', desc: 'Ask anything about English grammar, IELTS, vocabulary.' },
  { href: '/quiz', title: 'Take a quiz', desc: 'AI-generated questions on any topic, any CEFR level.' },
  { href: '/vocab', title: 'Browse vocabulary', desc: 'Authored word lists with examples and level tags.' },
  { href: '/grammar', title: 'Grammar topics', desc: 'Curated grammar explanations with examples.' },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-4xl font-bold text-fg">AI Learning</h1>
      <p className="mt-3 text-muted">Practice English with an AI tutor. Built for IELTS, grammar, vocabulary.</p>
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href} className="card transition hover:border-secondary hover:shadow-sm">
            <div className="text-lg font-semibold text-fg">{t.title}</div>
            <div className="mt-1 text-sm text-muted">{t.desc}</div>
          </Link>
        ))}
      </div>
    </main>
  );
}