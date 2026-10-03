'use client';

import { useState } from 'react';
import type { Level, QuizItem } from '@ai-learning/shared';
import { PageHeader } from '@/components/ui/PageHeader';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { GlassCard } from '@/components/ui/GlassCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';

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
  const [err, setErr] = useState<string | null>(null);

  const start = async () => {
    setErr(null);
    setState({ kind: 'generating' });
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/quiz/from-topic`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, level, n }),
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const j = (await res.json()) as { quizId: string; items: QuizItem[] };
      setState({ kind: 'playing', quizId: j.quizId, items: j.items, idx: 0, picks: {} });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to generate quiz');
      setState({ kind: 'idle' });
    }
  };

  const submit = async () => {
    if (s.kind !== 'playing') return;
    setErr(null);
    const answers = s.items
      .map((it, i) => ({ itemId: it.id ?? '', picked: s.picks[i] }))
      .filter((a) => a.picked !== undefined);
    if (answers.length === 0) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/quiz/attempt`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quizId: s.quizId, answers }),
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const j = (await res.json()) as {
        score: number;
        total: number;
        results: Array<{ itemId: string; aiExplanation?: string; correct: boolean; correctIdx: number }>;
      };
      const explanations: Record<string, string> = {};
      for (const r of j.results) if (r.aiExplanation) explanations[r.itemId] = r.aiExplanation;
      setState({ kind: 'submitted', score: j.score, total: j.total, explanations });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to submit');
    }
  };

  if (s.kind === 'idle' || s.kind === 'generating') {
    return (
      <main className="mx-auto max-w-xl">
        <PageHeader title="Quiz" subtitle="AI-generated on any topic, any CEFR level." />
        <GlassCard className="space-y-4">
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-muted">Topic</span>
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. IELTS grammar, conditionals, vocabulary"
              className="mt-1"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-muted">Level</span>
            <Select value={level} onChange={(e) => setLevel(e.target.value as Level)} className="mt-1">
              {LEVELS.map((l) => (<option key={l}>{l}</option>))}
            </Select>
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-muted">Questions</span>
            <Input
              type="number"
              min={1}
              max={20}
              value={n}
              onChange={(e) => setN(Number(e.target.value))}
              className="mt-1"
            />
          </label>
          <Button onClick={start} disabled={s.kind === 'generating'} className="w-full">
            {s.kind === 'generating' ? 'Generating…' : 'Generate quiz'}
          </Button>
          {err && <ErrorState detail={err} />}
        </GlassCard>
      </main>
    );
  }

  if (s.kind === 'playing') {
    const it = s.items[s.idx]!;
    const picked = s.picks[s.idx];
    const last = s.idx === s.items.length - 1;
    return (
      <main className="mx-auto max-w-2xl">
        <PageHeader title="Quiz" subtitle={`Question ${s.idx + 1} of ${s.items.length}`} />
        <GlassCard>
          <h2 className="font-display text-2xl tracking-display text-fg">{it.prompt}</h2>
          <div className="mt-6 space-y-2">
            {it.options.map((opt, i) => {
              const selected = picked === i;
              return (
                <button
                  key={i}
                  onClick={() => setState({ ...s, picks: { ...s.picks, [s.idx]: i } })}
                  className={`glass min-h-[44px] w-full rounded-card px-4 py-3 text-left text-sm transition-shadow ${
                    selected ? 'border-accent shadow-glow' : ''
                  }`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
          <div className="mt-6 flex justify-end gap-2">
            {!last ? (
              <Button onClick={() => setState({ ...s, idx: s.idx + 1 })} disabled={picked === undefined}>
                Next
              </Button>
            ) : (
              <Button onClick={submit} disabled={Object.keys(s.picks).length !== s.items.length}>
                Submit
              </Button>
            )}
          </div>
          {err && <div className="mt-4"><ErrorState detail={err} /></div>}
        </GlassCard>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl">
      <PageHeader title="Result" subtitle={`${s.score} / ${s.total}`} />
      <GlassCard className="space-y-4">
        {Object.keys(s.explanations).length === 0 ? (
          <EmptyState title="Nice work" hint="No explanations needed — you got everything right." />
        ) : (
          Object.entries(s.explanations).map(([id, text]) => (
            <div key={id} className="glass-sm p-4">
              <div className="text-xs uppercase tracking-wide text-muted">Explanation</div>
              <div className="mt-1 text-sm text-fg">{text}</div>
            </div>
          ))
        )}
        <Button variant="ghost" onClick={() => setState({ kind: 'idle' })}>New quiz</Button>
      </GlassCard>
    </main>
  );
}