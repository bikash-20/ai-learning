'use client';

import { useEffect, useState } from 'react';
import type { Grammar } from '@ai-learning/shared';

export default function GrammarPage() {
  const [items, setItems] = useState<Grammar[]>([]);
  const [level, setLevel] = useState<string>('');

  useEffect(() => {
    const url = level ? `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/grammar?level=${level}` : `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/grammar`;
    fetch(url, { credentials: 'include' })
      .then((r) => r.json() as Promise<{ items: Grammar[] }>)
      .then((j) => setItems(j.items))
      .catch(() => setItems([]));
  }, [level]);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Grammar</h1>
      <select value={level} onChange={(e) => setLevel(e.target.value)} className="mt-4 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm">
        <option value="">All levels</option>
        {['A1','A2','B1','B2','C1','C2'].map((l) => <option key={l}>{l}</option>)}
      </select>
      <div className="mt-6 space-y-3">
        {items.map((g) => (
          <div key={g.topic} className="rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="text-lg font-semibold">{g.topic} <span className="ml-2 text-sm text-zinc-500">{g.level}</span></div>
            <p className="mt-1 text-sm text-zinc-700">{g.explanation}</p>
            <ul className="mt-2 list-disc pl-5 text-sm text-zinc-500">{g.examples.map((e, i) => <li key={i}>{e}</li>)}</ul>
          </div>
        ))}
      </div>
    </main>
  );
}