'use client';

import { useState } from 'react';
import type { Level, QuizItem } from '@ai-learning/shared';

type State =
  | { kind: 'idle' }
  | { kind: 'generating' }
  | { kind: 'playing'; quizId: string; items: QuizItem[]; idx: number; picks: Record<number, number> }
  | { kind: 'submitted'; score: number; total: number; explanations: Record<string, string> };

const LEVELS: Level[] = ['A2', 'B1', 'B2', 'C1'];

export default function QuizPage() {
  const [topic, setTopic] = useState('IELTS grammar');
  const [level, setLevel] = useState<Level>('B2');
  const [n, setN] = useState(5);
  const [s, setState] = useState<State>({ kind: 'idle' });

  const start = async () => {
    setState({ kind: 'generating' });
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/quiz/from-topic`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, level, n }),
    });
    const j = (await res.json()) as { quizId: string; items: QuizItem[] };
    setState({ kind: 'playing', quizId: j.quizId, items: j.items, idx: 0, picks: {} });
  };

  const submit = async () => {
    if (s.kind !== 'playing') return;
    const answers = s.items
      .map((it, i) => ({ itemId: it.id ?? '', picked: s.picks[i] }))
      .filter((a) => a.picked !== undefined);
    if (answers.length === 0) return;
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/quiz/attempt`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quizId: s.quizId, answers }),
    });
    const j = (await res.json()) as { score: number; total: number; results: Array<{ itemId: string; aiExplanation?: string; correct: boolean; correctIdx: number }> };
    const explanations: Record<string, string> = {};
    for (const r of j.results) if (r.aiExplanation) explanations[r.itemId] = r.aiExplanation;
    setState({ kind: 'submitted', score: j.score, total: j.total, explanations });
  };

  if (s.kind === 'idle' || s.kind === 'generating') {
    return (
      <main className="mx-auto max-w-xl px-6 py-12">
        <h1 className="text-2xl font-semibold">Quiz</h1>
        <div className="mt-6 space-y-3">
          <label className="block">
            <span className="text-sm text-zinc-600">Topic</span>
            <input value={topic} onChange={(e) => setTopic(e.target.value)} className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="text-sm text-zinc-600">Level</span>
            <select value={level} onChange={(e) => setLevel(e.target.value as Level)} className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm">
              {LEVELS.map((l) => <option key={l}>{l}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-zinc-600">Questions</span>
            <input type="number" min={1} max={20} value={n} onChange={(e) => setN(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm" />
          </label>
          <button onClick={start} disabled={s.kind === 'generating'} className="rounded-xl bg-accent px-5 py-2 text-sm font-medium text-white disabled:opacity-50">
            {s.kind === 'generating' ? 'Generating…' : 'Generate quiz'}
          </button>
        </div>
      </main>
    );
  }

  if (s.kind === 'playing') {
    const it = s.items[s.idx];
    const picked = s.picks[s.idx];
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <div className="text-sm text-zinc-500">Question {s.idx + 1} / {s.items.length}</div>
        <h2 className="mt-2 text-xl font-semibold">{it.prompt}</h2>
        <div className="mt-6 space-y-2">
          {it.options.map((opt, i) => (
            <button
              key={i}
              onClick={() => setState({ ...s, picks: { ...s.picks, [s.idx]: i } })}
              className={`block w-full border px-4 py-3 text-left text-sm rounded-xl ${picked === i ? 'border-accent bg-accent/10' : 'border-zinc-200 bg-white'}`}
            >
              {opt}
            </button>
          ))}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          {s.idx < s.items.length - 1 ? (
            <button onClick={() => setState({ ...s, idx: s.idx + 1 })} disabled={picked === undefined} className="rounded-xl bg-accent px-5 py-2 text-sm font-medium text-white disabled:opacity-50">Next</button>
          ) : (
            <button onClick={submit} disabled={Object.keys(s.picks).length !== s.items.length} className="rounded-xl bg-accent px-5 py-2 text-sm font-medium text-white disabled:opacity-50">Submit</button>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Result: {s.score} / {s.total}</h1>
      <button onClick={() => setState({ kind: 'idle' })} className="mt-4 rounded-xl border border-zinc-200 bg-white px-5 py-2 text-sm">New quiz</button>
    </main>
  );
}