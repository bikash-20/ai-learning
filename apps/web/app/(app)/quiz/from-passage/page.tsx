'use client';

import { useEffect, useRef, useState } from 'react';
import type { Level, QuizItem, QuizExplainRequest, QuizExplainResponse, QuizFromPassageRequest } from '@quantara/shared';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { GlassCard } from '@/components/ui/GlassCard';
import { ErrorState } from '@/components/ui/ErrorState';
import { OptionButton, type OptionState } from '@/components/ui/OptionButton';
import { ModelChip } from '@/components/ui/ModelChip';
import { usePrefs } from '@/lib/usePrefs';

const LEVELS: Level[] = ['A2', 'B1', 'B2', 'C1'];
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
const FOCUS_OPTIONS = [
  { value: 'mixed', label: 'Mixed' },
  { value: 'detail', label: 'Detail' },
  { value: 'inference', label: 'Inference' },
  { value: 'vocab', label: 'Vocabulary' },
  { value: 'tone', label: 'Tone' },
] as const;
type FocusKind = (typeof FOCUS_OPTIONS)[number]['value'];

type State =
  | { kind: 'idle' }
  | { kind: 'generating' }
  | {
      kind: 'playing';
      quizId: string;
      items: QuizItem[];
      idx: number;
      picks: Record<number, number>;
      revealed: Record<number, true>;
      aiExplain: Record<number, { text: string; model: string; provider: string } | undefined>;
      explainPending: Record<number, true>;
    }
  | {
      kind: 'submitted';
      items: QuizItem[];
      picks: Record<number, number>;
      score: number;
      total: number;
      explanations: Record<string, string>;
      aiExplain: Record<number, { text: string; model: string; provider: string } | undefined>;
    };

type ErrInfo = { title: string; detail: string; retryable: boolean };

const friendlyFromResponse = async (res: Response): Promise<ErrInfo> => {
  let msg: string | undefined;
  let code: string | undefined;
  try {
    const j = (await res.clone().json()) as { code?: string; message?: string };
    msg = typeof j.message === 'string' ? j.message : undefined;
    code = typeof j.code === 'string' ? j.code : undefined;
  } catch {
    /* not JSON */
  }
  if (res.status === 401) return { title: 'Please sign in again', detail: 'Your session expired.', retryable: false };
  if (res.status === 429) return { title: 'Too many requests', detail: 'Please wait a moment, then try again.', retryable: true };
  if (res.status >= 500 || code === 'UPSTREAM_UNAVAILABLE') {
    return { title: 'All AI models are busy', detail: msg ?? 'Please try again.', retryable: true };
  }
  if (code === 'AI_INVALID_OUTPUT' || msg) {
    return { title: "Couldn't generate questions", detail: msg ?? 'Please try again or paste a longer passage.', retryable: true };
  }
  return { title: 'Something went wrong', detail: `Request failed (${res.status}).`, retryable: true };
};

const letterFor = (i: number) => LETTERS[i] ?? `${i + 1}`;

export default function PassageQuizPage() {
  const [passage, setPassage] = useState(
    'In a quiet village on the coast of Portugal, Maria tends to her grandmother\'s garden every Sunday. She insists that the roses there have always known her name, a story she heard as a child. Whether or not this is true, the garden is undeniably beautiful.',
  );
  const [level, setLevel] = useState<Level>('B2');
  const [n, setN] = useState(5);
  const [focus, setFocus] = useState<FocusKind>('mixed');
  const [s, setState] = useState<State>({ kind: 'idle' });
  const [err, setErr] = useState<ErrInfo | null>(null);
  const nextBtnRef = useRef<HTMLButtonElement>(null);
  const prefs = usePrefs();
  const aiExplainEnabled = prefs?.aiExplain !== false;

  useEffect(() => {
    if (s.kind === 'playing' && s.revealed[s.idx]) {
      const t = setTimeout(() => nextBtnRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [s]);

  const start = async () => {
    setErr(null);
    setState({ kind: 'generating' });
    try {
      const body: QuizFromPassageRequest = { passage, level, n, focus };
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/quiz/from-passage`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setErr(await friendlyFromResponse(res));
        setState({ kind: 'idle' });
        return;
      }
      const j = (await res.json()) as { quizId: string; items: QuizItem[] };
      setState({
        kind: 'playing',
        quizId: j.quizId,
        items: j.items,
        idx: 0,
        picks: {},
        revealed: {},
        aiExplain: {},
        explainPending: {},
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Network error';
      setErr({ title: 'Something went wrong', detail: msg, retryable: true });
      setState({ kind: 'idle' });
    }
  };

  const checkCurrent = async () => {
    if (s.kind !== 'playing') return;
    const picked = s.picks[s.idx];
    if (picked === undefined) return;
    if (s.revealed[s.idx]) return;
    setState({ ...s, revealed: { ...s.revealed, [s.idx]: true }, explainPending: { ...s.explainPending, [s.idx]: true } });
    if (!aiExplainEnabled) {
      setState((cur) => {
        if (cur.kind !== 'playing') return cur;
        return { ...cur, explainPending: { ...cur.explainPending, [cur.idx]: undefined as never } };
      });
      return;
    }
    try {
      const body: QuizExplainRequest = { quizId: s.quizId, itemId: s.items[s.idx]!.id ?? '', pickedIdx: picked, level };
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/quiz/explain`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const j = (await res.json()) as QuizExplainResponse;
        setState((cur) => {
          if (cur.kind !== 'playing') return cur;
          return {
            ...cur,
            aiExplain: { ...cur.aiExplain, [cur.idx]: { text: j.explanation, model: j.model, provider: j.provider } },
            explainPending: { ...cur.explainPending, [cur.idx]: undefined as never },
          };
        });
      } else {
        setState((cur) => {
          if (cur.kind !== 'playing') return cur;
          return { ...cur, explainPending: { ...cur.explainPending, [cur.idx]: undefined as never } };
        });
      }
    } catch {
      setState((cur) => {
        if (cur.kind !== 'playing') return cur;
        return { ...cur, explainPending: { ...cur.explainPending, [cur.idx]: undefined as never } };
      });
    }
  };

  const goNext = () => {
    if (s.kind !== 'playing') return;
    if (s.idx < s.items.length - 1) setState({ ...s, idx: s.idx + 1 });
  };

  const submit = async () => {
    if (s.kind !== 'playing') return;
    const answers = s.items.map((it, i) => ({ itemId: it.id ?? '', picked: s.picks[i] }));
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/quiz/attempt`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quizId: s.quizId, answers }),
      });
      if (!res.ok) {
        setErr(await friendlyFromResponse(res));
        return;
      }
      const j = (await res.json()) as {
        score: number;
        total: number;
        results: Array<{ itemId: string; aiExplanation?: string }>;
      };
      const explanations: Record<string, string> = {};
      for (const r of j.results) if (r.aiExplanation) explanations[r.itemId] = r.aiExplanation;
      setState({
        kind: 'submitted',
        items: s.items,
        picks: s.picks,
        score: j.score,
        total: j.total,
        explanations,
        aiExplain: s.aiExplain,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Network error';
      setErr({ title: 'Something went wrong', detail: msg, retryable: true });
    }
  };

  const errorBlock = err && (
    <ErrorState title={err.title} detail={err.detail}>
      {err.retryable && (
        <div className="mt-3">
          <Button size="sm" variant="ghost" onClick={() => { setErr(null); if (s.kind !== 'idle') start(); }}>Retry</Button>
        </div>
      )}
    </ErrorState>
  );

  if (s.kind === 'idle' || s.kind === 'generating') {
    return (
      <main className="mx-auto max-w-xl">
        <PageHeader title="Quiz from passage" subtitle="Paste any article, dialogue, or report." />
        <GlassCard className="space-y-4">
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-muted">Passage</span>
            <textarea
              value={passage}
              onChange={(e) => setPassage(e.target.value)}
              rows={8}
              minLength={80}
              maxLength={8000}
              className="mt-1 w-full rounded-card border border-glass-border bg-glass px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
            />
            <div className="mt-1 text-[11px] text-muted">{passage.length} / 8000 chars · 80 minimum</div>
          </label>
          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              <span className="text-xs uppercase tracking-wide text-muted">Level</span>
              <Select value={level} onChange={(e) => setLevel(e.target.value as Level)} className="mt-1">
                {LEVELS.map((l) => (<option key={l}>{l}</option>))}
              </Select>
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-wide text-muted">Questions</span>
              <Select value={String(n)} onChange={(e) => setN(Number(e.target.value))} className="mt-1">
                {[3, 5, 7, 10].map((v) => (<option key={v} value={v}>{v}</option>))}
              </Select>
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-wide text-muted">Focus</span>
              <Select value={focus} onChange={(e) => setFocus(e.target.value as FocusKind)} className="mt-1">
                {FOCUS_OPTIONS.map((f) => (<option key={f.value} value={f.value}>{f.label}</option>))}
              </Select>
            </label>
          </div>
          <Button onClick={start} disabled={s.kind === 'generating' || passage.length < 80} className="w-full">
            {s.kind === 'generating' ? 'Generating…' : 'Generate questions'}
          </Button>
          {errorBlock}
        </GlassCard>
      </main>
    );
  }

  if (s.kind === 'playing') {
    const it = s.items[s.idx]!;
    const picked = s.picks[s.idx];
    const revealed = !!s.revealed[s.idx];
    const isCorrect = picked === it.answerIdx;
    const aiText = s.aiExplain[s.idx];
    const aiPending = !!s.explainPending[s.idx];
    const last = s.idx === s.items.length - 1;
    return (
      <main className="mx-auto max-w-2xl">
        <PageHeader title="Quiz from passage" subtitle={`Question ${s.idx + 1} of ${s.items.length}`} />
        <GlassCard>
          <h2 className="font-display text-2xl tracking-display text-fg">{it.prompt}</h2>
          <details className="mt-3 text-xs">
            <summary className="cursor-pointer text-muted">Show passage</summary>
            <p className="mt-2 whitespace-pre-wrap text-fg/90">{passage}</p>
          </details>
          <div className="mt-6 space-y-2" role="radiogroup" aria-label={it.prompt}>
            {it.options.map((opt, i) => {
              const isCorrectOpt = i === it.answerIdx;
              const isPicked = picked === i;
              let st: OptionState = 'idle';
              if (!revealed) st = isPicked ? 'selected' : 'idle';
              else if (isCorrectOpt) st = 'correct';
              else if (isPicked) st = 'wrong';
              else st = 'disabled';
              return (
                <OptionButton
                  key={i}
                  letter={letterFor(i)}
                  state={st}
                  onClick={() => { if (!revealed) setState({ ...s, picks: { ...s.picks, [s.idx]: i } }); }}
                  aria-label={`Option ${letterFor(i)}: ${opt}`}
                >
                  {opt}
                </OptionButton>
              );
            })}
          </div>
          {revealed && (
            <div className={`mt-5 rounded-card border p-4 ${isCorrect ? 'border-success/50 bg-success/10' : 'border-danger/50 bg-danger/10'}`}>
              <div className="flex items-center justify-between">
                <div className={`text-xs uppercase tracking-wide ${isCorrect ? 'text-success' : 'text-danger'}`}>
                  {isCorrect ? 'Correct' : 'Not quite'}
                </div>
                {aiText && <ModelChip modelId={aiText.model} />}
              </div>
              <p className="mt-2 text-sm text-fg">{it.explanation}</p>
              {aiPending && <p className="mt-2 text-xs text-muted">Loading AI explanation…</p>}
              {!aiPending && aiText && <p className="mt-2 text-sm text-fg">{aiText.text}</p>}
              {!aiPending && !aiText && (
                <p className="mt-2 text-xs text-muted">AI explanation unavailable — showing the static one above.</p>
              )}
            </div>
          )}
          <div className="mt-6 flex items-center justify-between gap-2">
            <div className="text-xs text-muted">{Object.keys(s.revealed).length} / {s.items.length} answered</div>
            <div className="flex gap-2">
              {!revealed ? (
                <Button onClick={checkCurrent} disabled={picked === undefined}>Check</Button>
              ) : last ? (
                <Button onClick={submit} disabled={Object.keys(s.revealed).length !== s.items.length}>See results</Button>
              ) : (
                <Button ref={nextBtnRef} onClick={goNext}>Next →</Button>
              )}
            </div>
          </div>
          {err && <div className="mt-4">{errorBlock}</div>}
        </GlassCard>
      </main>
    );
  }

  // Submitted
  const pct = s.total === 0 ? 0 : Math.round((s.score / s.total) * 100);
  return (
    <main className="mx-auto max-w-2xl">
      <PageHeader title="Results" subtitle={`${s.score} / ${s.total} • ${pct}%`} />
      <GlassCard className="space-y-5">
        <div className="flex items-baseline gap-3">
          <span className="font-display text-5xl tracking-display text-fg">{pct}%</span>
          <span className="text-sm text-muted">{s.score} of {s.total} correct</span>
        </div>
        <ol className="space-y-4">
          {s.items.map((it, i) => {
            const picked = s.picks[i];
            const correct = picked === it.answerIdx;
            const aiText = s.aiExplain[i];
            return (
              <li key={it.id ?? i} className="rounded-card border border-glass-border p-4">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${correct ? 'bg-success text-[#06222D]' : 'bg-danger text-white'}`}>
                    {i + 1}
                  </span>
                  <div className="text-sm font-medium text-fg">{it.prompt}</div>
                </div>
                <div className="mt-3 grid gap-1 pl-8">
                  {it.options.map((opt, j) => {
                    const isCorrectOpt = j === it.answerIdx;
                    const isPicked = picked === j;
                    let cls = 'text-sm text-muted';
                    if (isCorrectOpt) cls = 'text-sm text-success font-semibold';
                    else if (isPicked) cls = 'text-sm text-danger font-semibold';
                    return (
                      <div key={j} className={cls}>
                        <span className="mr-2 font-mono text-xs text-muted">{letterFor(j)}</span>
                        {opt}
                        {isPicked && <span className="ml-2 text-xs">(your answer)</span>}
                        {isCorrectOpt && !isPicked && <span className="ml-2 text-xs">(correct)</span>}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 pl-8 text-xs text-muted">
                  <div className="uppercase tracking-wide">Explanation</div>
                  <p className="mt-1 text-sm text-fg">{it.explanation}</p>
                </div>
                {aiText && (
                  <div className="mt-3 pl-8 text-xs text-muted">
                    <div className="flex items-center gap-2">
                      <span className="uppercase tracking-wide">AI explain</span>
                      <ModelChip modelId={aiText.model} />
                    </div>
                    <p className="mt-1 text-sm text-fg">{aiText.text}</p>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        <div className="flex flex-wrap gap-2">
          <Button onClick={start}>New passage quiz</Button>
          <Button variant="secondary" onClick={() => setState({ kind: 'idle' })}>Change passage</Button>
        </div>
        {errorBlock}
      </GlassCard>
    </main>
  );
}