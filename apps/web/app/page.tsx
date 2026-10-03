import Link from 'next/link';

export default function Home() {
  const tiles = [
    { href: '/sign-in', title: 'Sign in', desc: 'Email magic-link, then access everything.' },
    { href: '/chat', title: 'Chat with a tutor', desc: 'Ask anything about English grammar, IELTS, vocabulary.' },
    { href: '/quiz', title: 'Take a quiz', desc: 'AI-generated questions on any topic, any CEFR level.' },
    { href: '/vocab', title: 'Browse vocabulary', desc: 'Authored word lists with examples and level tags.' },
    { href: '/grammar', title: 'Grammar topics', desc: 'Curated grammar explanations with examples.' },
  ];
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-4xl font-bold">AI Learning</h1>
      <p className="mt-3 text-zinc-600">Practice English with an AI tutor. Built for IELTS, grammar, vocabulary.</p>
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href} className="rounded-2xl border border-zinc-200 bg-white p-5 transition hover:border-accent hover:shadow">
            <div className="text-lg font-semibold">{t.title}</div>
            <div className="mt-1 text-sm text-zinc-500">{t.desc}</div>
          </Link>
        ))}
      </div>
    </main>
  );
}