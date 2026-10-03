'use client';

import { useEffect, useState } from 'react';
import type { Vocab } from '@ai-learning/shared';
import { CefrBadge } from '@/components/CefrBadge';

export default function VocabPage() {
  const [items, setItems] = useState<Vocab[]>([]);
  const [level, setLevel] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';
    const url = level ? `${base}/api/vocab?level=${level}` : `${base}/api/vocab`;
    setLoading(true);
    setErr(null);
    fetch(url, { credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`API ${r.status}`);
        return r.json() as Promise<{ items: Vocab[] }>;
      })
      .then((j) => setItems(j.items))
      .catch((e) => setErr(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [level]);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-fg">Vocabulary</h1>
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
        <p className="mt-6 text-sm text-muted">No vocabulary for this filter.</p>
      )}

      <div className="mt-6 space-y-3">
        {items.map((v) => (
          <article key={v.word} className="card">
            <div className="flex items-center justify-between gap-3">
              <div className="text-lg font-semibold text-fg">{v.word}</div>
              <div className="flex items-center gap-2 text-sm text-muted">
                <span>{v.pos}</span>
                <CefrBadge level={v.level} />
              </div>
            </div>
            <div className="mt-1 text-sm text-fg">{v.definition}</div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
              {v.examples.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
            {v.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {v.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs text-muted"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
    </main>
  );
}