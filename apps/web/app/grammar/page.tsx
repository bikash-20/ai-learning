'use client';

import { useEffect, useState } from 'react';
import type { Grammar } from '@ai-learning/shared';
import { CefrBadge } from '@/components/CefrBadge';

export default function GrammarPage() {
  const [items, setItems] = useState<Grammar[]>([]);
  const [level, setLevel] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';
    const url = level ? `${base}/api/grammar?level=${level}` : `${base}/api/grammar`;
    setLoading(true);
    setErr(null);
    fetch(url, { credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`API ${r.status}`);
        return r.json() as Promise<{ items: Grammar[] }>;
      })
      .then((j) => setItems(j.items))
      .catch((e) => setErr(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [level]);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-fg">Grammar</h1>
        <select
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          className="input-base max-w-[12rem]"
        >
          <option value="">All levels</option>
          {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
      </header>

      {err && (
        <p role="alert" className="mt-4 rounded-xl border border-danger/30 bg-surface-2 p-3 text-sm text-danger">
          {err}. Check that NEXT_PUBLIC_API_BASE_URL points to the live Worker.
        </p>
      )}
      {!err && loading && <p className="mt-6 text-sm text-muted">Loading…</p>}
      {!err && !loading && items.length === 0 && (
        <p className="mt-6 text-sm text-muted">No grammar topics for this filter.</p>
      )}

      <div className="mt-6 space-y-3">
        {items.map((g) => (
          <article key={g.topic} className="card">
            <div className="flex items-center justify-between gap-3">
              <div className="text-lg font-semibold text-fg">{g.topic}</div>
              <CefrBadge level={g.level} />
            </div>
            <p className="mt-2 text-sm text-fg">{g.explanation}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
              {g.examples.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </main>
  );
}