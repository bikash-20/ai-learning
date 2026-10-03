'use client';

import { useEffect, useRef, useState } from 'react';
import type { Level, QuizItem, QuizExplainRequest, QuizExplainResponse } from '@quantara/shared';
import { PageHeader } from '@/components/ui/PageHeader';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { GlassCard } from '@/components/ui/GlassCard';
import { ErrorState } from '@/components/ui/ErrorState';
import { OptionButton, type OptionState } from '@/components/ui/OptionButton';
import { ModelChip } from '@/components/ui/ModelChip';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

const LEVELS: Level[] = ['A2', 'B1', 'B2', 'C1'];

type State =
  | { kind: 'idle' }
  | { kind: 'generating' }
  | {
      kind: 'playing';
      quizId: string;
      items: QuizItem[];
      idx: number;
      /** Per-question: which option the learner picked (0-based). */
      picks: Record<number, number>;
      /** Per-question: which question has been checked. */
      revealed: Record<number, true>;
      /** Per-question AI explain (Phase 1): cached server-side. */
      aiExplain: Record<number, { text: string; model: string; provider: string } | undefined>;
      /** Per-question AI explain loading state. */
      explainPending: Record<number, true>;
      startedAt: number;
    }
  | {
      kind: 'submitted';
      items: QuizItem[];
      picks: Record<number, number>;
      score: number;
      total: number;
      explanations: Record<string, string>;
      aiExplain: Record<number, { text: string; model: string; provider: string } | undefined>;
      startedAt: number;
      finishedAt: number;
    };

type ErrInfo = {
  title: string;
  detail: string;
  technical?: string;
  retryable: boolean;
};

const friendlyFromResponse = async (res: Response): Promise<ErrInfo> => {
  let serverMsg: string | undefined;
  let serverCode: string | undefined;
  try {
    const j = (await res.clone().json()) as { code?: string; message?: string };
    serverMsg = typeof j.message === 'string' ? j.message : undefined;
    serverCode = typeof j.code === 'string' ? j.code : undefined;
  } catch {
    /* not JSON */
  }
  if (res.status === 401) return { title: 'Please sign in again', detail: 'Your session expired.', retryable: false };
  if (res.status === 429) return { title: 'Too many requests', detail: 'Please wait a moment, then try again.', retryable: true };
  if (res.status >= 500 || serverCode === 'UPSTREAM_UNAVAILABLE') {
    return {
      title: 'All AI models are busy',
      detail: serverMsg ?? "We couldn't reach the tutor right now. Please try again.",
      ...(process.env.NODE_ENV !== 'production' && serverCode ? { technical: serverCode } : {}),
      retryable: true,
    };
  }
  if (serverCode === 'AI_INVALID_OUTPUT' || serverMsg) {
    return { title: 'We couldn\u2019t generate a quiz', detail: serverMsg ?? 'Please try again with a different topic.', retryable: true };
  }
  return { title: 'Something went wrong', detail: `Request failed (${res.status}). Please try again.`, retryable: true };
};

const isNetworkError = (msg: string) =>
  /fetch|network|failed to fetch/i.test(msg) || (typeof navigator !== 'undefined' && !navigator.onLine);

const networkErr = (): ErrInfo => ({ title: 'No connection', detail: 'Check your connection and try again.', retryable: true });

const letterFor = (i: number) => LETTERS[i] ?? `${i + 1}`;

export default function QuizPage() {
  const [topic, setTopic] = useState('IELTS grammar');
  const [level, setLevel] = useState<Level>('B2');
  const [n, setN] = useState(5);
  const [s, setState] = useState<State>({ kind: 'idle' });
  const [err, setErr] = useState<ErrInfo | null>(null);
  const startedAtRef = useRef<number>(0);

  // Re-focus Check / Next button after reveal so keyboard learners can keep going.
  const nextBtnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (s.kind === 'playing' && s.revealed[s.idx]) {
      // Don't steal focus from a freshly-clicked option, but DO move focus
      // to "Next" once the explain is on screen.
      const t = setTimeout(() => nextBtnRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [s]);

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
      if (!res.ok) {
        setErr(await friendlyFromResponse(res));
        setState({ kind: 'idle' });
        return;
      }
      const j = (await res.json()) as { quizId: string; items: QuizItem[] };
      const now = Date.now();
      startedAtRef.current = now;
      setState({
        kind: 'playing',
        quizId: j.quizId,
        items: j.items,
        idx: 0,
        picks: {},
        revealed: {},
        aiExplain: {},
        explainPending: {},
        startedAt: now,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Network error';
      setErr(isNetworkError(msg) ? networkErr() : { title: 'Something went wrong', detail: msg, retryable: true });
      setState({ kind: 'idle' });
    }
  };

  const checkCurrent = async () => {
    if (s.kind !== 'playing') return;
    const picked = s.picks[s.idx];
    if (picked === undefined) return;
    if (s.revealed[s.idx]) return;
    setState({
      ...s,
      revealed: { ...s.revealed, [s.idx]: true },
      explainPending: { ...s.explainPending, [s.idx]: true },
    });
    // Fire the AI explain (cached server-side, may be a cache hit).
    try {
      const body: QuizExplainRequest = {
        quizId: s.quizId,
        itemId: s.items[s.idx]!.id ?? '',
        pickedIdx: picked,
        level,
      };
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
        // Don't surface a scary error for explain — fall back to the static
        // explanation that's already on the item. Mark pending done.
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
    setErr(null);
    const answers = s.items
      .map((it, i) => ({ itemId: it.id ?? '', picked: s.picks[i] }))
      .filter((a) => a.picked !== undefined);
    if (answers.length !== s.items.length) return; // must have checked every question
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
        results: Array<{ itemId: string; aiExplanation?: string; correct: boolean; correctIdx: number }>;
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
        startedAt: s.startedAt,
        finishedAt: Date.now(),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Network error';
      setErr(isNetworkError(msg) ? networkErr() : { title: 'Something went wrong', detail: msg, retryable: true });
    }
  };

  const retryStart = () => {
    setErr(null);
    if (s.kind === 'playing') return start();
    if (s.kind === 'submitted') return start();
    start();
  };

  // ---------- Render ----------

  const errorBlock = err && (
    <ErrorState title={err.title} detail={err.detail}>
      {err.technical && process.env.NODE_ENV !== 'production' && (
        <div className="mt-1 text-xs text-muted/80">dev: {err.technical}</div>
      )}
      {err.retryable && (
        <div className="mt-3">
          <Button type="button" size="sm" variant="ghost" onClick={retryStart}>Retry</Button>
        </div>
      )}
    </ErrorState>
  );

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
        <PageHeader
          title="Quiz"
          subtitle={`Question ${s.idx + 1} of ${s.items.length}`}
        />
        <GlassCard>
          <h2 className="font-display text-2xl tracking-display text-fg">{it.prompt}</h2>
          <div className="mt-6 space-y-2" role="radiogroup" aria-label={it.prompt}>
            {it.options.map((opt, i) => {
              const isCorrectOpt = i === it.answerIdx;
              const isPicked = picked === i;
              let st: OptionState = 'idle';
              if (!revealed) {
                st = isPicked ? 'selected' : 'idle';
              } else {
                if (isCorrectOpt) st = 'correct';
                else if (isPicked) st = 'wrong';
                else st = 'disabled';
              }
              return (
                <OptionButton
                  key={i}
                  letter={letterFor(i)}
                  state={st}
                  onClick={() => {
                    if (revealed) return;
                    setState({ ...s, picks: { ...s.picks, [s.idx]: i } });
                  }}
                  aria-label={`Option ${letterFor(i)}: ${opt}`}
                >
                  {opt}
                </OptionButton>
              );
            })}
          </div>

          {/* Explanation panel — appears immediately on Check. */}
          {revealed && (
            <div
              className={`mt-5 rounded-card border p-4 ${
                isCorrect
                  ? 'border-success/50 bg-success/10'
                  : 'border-danger/50 bg-danger/10'
              }`}
              role="status"
              aria-live="polite"
            >
              <div className="flex items-center justify-between">
                <div className={`text-xs uppercase tracking-wide ${isCorrect ? 'text-success' : 'text-danger'}`}>
                  {isCorrect ? 'Correct' : 'Not quite'}
                </div>
                {aiText && <ModelChip modelId={aiText.model} />}
              </div>
              <p className="mt-2 text-sm text-fg">{it.explanation}</p>
              {aiPending && (
                <p className="mt-2 text-xs text-muted">Loading AI explanation…</p>
              )}
              {!aiPending && aiText && (
                <p className="mt-2 text-sm text-fg">{aiText.text}</p>
              )}
              {!aiPending && !aiText && (
                <p className="mt-2 text-xs text-muted">
                  AI explanation unavailable — showing the static one above.
                </p>
              )}
            </div>
          )}

          <div className="mt-6 flex items-center justify-between gap-2">
            <div className="text-xs text-muted">
              {Object.keys(s.revealed).length} / {s.items.length} answered
            </div>
            <div className="flex gap-2">
              {!revealed ? (
                <Button
                  onClick={checkCurrent}
                  disabled={picked === undefined}
                  data-testid="check-btn"
                >
                  Check
                </Button>
              ) : last ? (
                <Button
                  onClick={submit}
                  disabled={Object.keys(s.revealed).length !== s.items.length}
                  data-testid="see-results-btn"
                >
                  See results
                </Button>
              ) : (
                <Button ref={nextBtnRef} onClick={goNext} data-testid="next-btn">
                  Next →
                </Button>
              )}
            </div>
          </div>
          {err && <div className="mt-4">{errorBlock}</div>}
        </GlassCard>
      </main>
    );
  }

  // Submitted — Results screen.
  const pct = s.total === 0 ? 0 : Math.round((s.score / s.total) * 100);
  const durationSec = Math.max(1, Math.round((s.finishedAt - s.startedAt) / 1000));
  return (
    <main className="mx-auto max-w-2xl">
      <PageHeader title="Results" subtitle={`${s.score} / ${s.total} • ${pct}% • ${formatTime(durationSec)}`} />
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
                  <span
                    className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      correct ? 'bg-success text-[#06222D]' : 'bg-danger text-white'
                    }`}
                    aria-label={correct ? 'Correct' : 'Wrong'}
                  >
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
                {s.explanations[it.id ?? ''] && (
                  <div className="mt-3 pl-8 text-xs text-muted">
                    <span className="uppercase tracking-wide">Tutor follow-up</span>
                    <p className="mt-1 text-sm text-fg">{s.explanations[it.id ?? '']}</p>
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        <div className="flex flex-wrap gap-2">
          <Button onClick={start}>New quiz</Button>
          <Button variant="secondary" onClick={() => setState({ kind: 'idle' })}>Change topic</Button>
        </div>
        {errorBlock}
      </GlassCard>
    </main>
  );
}

function formatTime(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}