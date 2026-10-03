'use client';

import { useEffect, useRef, useState } from 'react';
import type {
  Level as LevelT,
  ExamStartResponse,
  ExamSubmitResponse,
  ExamItem as ExamItemT,
} from '@quantara/shared';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { GlassCard } from '@/components/ui/GlassCard';
import { ErrorState } from '@/components/ui/ErrorState';
import { OptionButton } from '@/components/ui/OptionButton';

const LEVELS: LevelT[] = ['A2', 'B1', 'B2', 'C1'];
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

type State =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | {
      kind: 'in-progress';
      examId: string;
      durationSec: number;
      items: ExamItemT[];
      idx: number;
      picks: Record<number, number>;
      startedAt: number;
      /** Server deadline as ms epoch. */
      deadlineAt: number;
    }
  | {
      kind: 'submitted';
      examId: string;
      score: number;
      total: number;
      band: ExamSubmitResponse['band'];
      results: ExamSubmitResponse['results'];
      items: ExamItemT[];
      picks: Record<number, number>;
      startedAt: number;
      finishedAt: number;
    };

type ErrInfo = {
  title: string;
  detail: string;
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
      retryable: true,
    };
  }
  if (serverCode === 'AI_INVALID_OUTPUT' || serverMsg) {
    return { title: 'We couldn\u2019t start an exam', detail: serverMsg ?? 'Please try again.', retryable: true };
  }
  return { title: 'Something went wrong', detail: `Request failed (${res.status}). Please try again.`, retryable: true };
};

const letterFor = (i: number) => LETTERS[i] ?? `${i + 1}`;

export default function ExamPage() {
  const [level, setLevel] = useState<LevelT>('B2');
  const [n, setN] = useState(20);
  const [s, setState] = useState<State>({ kind: 'idle' });
  const [err, setErr] = useState<ErrInfo | null>(null);
  const [now, setNow] = useState<number>(0);
  const submittingRef = useRef(false);

  // Global countdown ticker — drives the visible seconds-remaining chip
  // AND auto-submits when the timer hits zero (the server uses the
  // persisted `durationSec` to enforce the deadline independently).
  useEffect(() => {
    if (s.kind !== 'in-progress') return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [s.kind]);

  // Trigger auto-submit when timer expires. Guarded by submittingRef so
  // we don't fire twice if React re-renders during the async submit.
  // `doSubmit` is read from the closure of the latest render; that's
  // fine for a one-shot auto-submit.
  useEffect(() => {
    if (s.kind !== 'in-progress') return;
    if (now < s.deadlineAt) return;
    if (submittingRef.current) return;
    submittingRef.current = true;
    void doSubmit();
  }, [now, s.kind]);

  const start = async () => {
    setErr(null);
    setState({ kind: 'starting' });
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/exam/run`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'ielts-mini-mock', level, n, difficulty: 'hard' }),
      });
      if (!res.ok) {
        setErr(await friendlyFromResponse(res));
        setState({ kind: 'idle' });
        return;
      }
      const j = (await res.json()) as ExamStartResponse;
      submittingRef.current = false;
      setState({
        kind: 'in-progress',
        examId: j.examId,
        durationSec: j.durationSec,
        items: j.items,
        idx: 0,
        picks: {},
        startedAt: Date.now(),
        deadlineAt: Date.now() + j.durationSec * 1000,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Network error';
      setErr({ title: 'Something went wrong', detail: msg, retryable: true });
      setState({ kind: 'idle' });
    }
  };

  const doSubmit = async () => {
    if (s.kind !== 'in-progress') return;
    setErr(null);
    const allAnswers = s.items.map((it, i) => ({
      itemId: it.id,
      picked: s.picks[i] ?? -1,
    }));
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/exam/submit`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examId: s.examId, answers: allAnswers }),
      });
      if (!res.ok) {
        setErr(await friendlyFromResponse(res));
        return;
      }
      const j = (await res.json()) as ExamSubmitResponse;
      setState({
        kind: 'submitted',
        examId: j.examId,
        score: j.score,
        total: j.total,
        band: j.band,
        results: j.results,
        items: s.items,
        picks: s.picks,
        startedAt: s.startedAt,
        finishedAt: Date.now(),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Network error';
      setErr({ title: 'Something went wrong', detail: msg, retryable: true });
    }
  };

  // ---------- Render ----------

  const errorBlock = err && (
    <ErrorState title={err.title} detail={err.detail}>
      {err.retryable && (
        <div className="mt-3">
          <Button type="button" size="sm" variant="ghost" onClick={() => { setErr(null); if (s.kind === 'submitted') start(); }}>
            Retry
          </Button>
        </div>
      )}
    </ErrorState>
  );

  if (s.kind === 'idle' || s.kind === 'starting') {
    return (
      <main className="mx-auto max-w-xl">
        <PageHeader title="Exam" subtitle="Timed mini-mock. Server-verified verdict." />
        <GlassCard className="space-y-4">
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-muted">Level</span>
            <Select value={level} onChange={(e) => setLevel(e.target.value as LevelT)} className="mt-1">
              {LEVELS.map((l) => (<option key={l}>{l}</option>))}
            </Select>
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-muted">Questions</span>
            <Select value={String(n)} onChange={(e) => setN(Number(e.target.value))} className="mt-1">
              {[10, 20, 30, 40].map((v) => (<option key={v} value={v}>{v}</option>))}
            </Select>
          </label>
          <div className="rounded-card border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
            <div className="font-semibold uppercase tracking-wide">Exam mode</div>
            <p className="mt-1 text-fg/90">
              60 seconds per question. Once you tap Start, the timer begins. The
              server stores the deadline — even if your network drops, unanswered
              questions will count as wrong on submit.
            </p>
          </div>
          <Button onClick={start} disabled={s.kind === 'starting'} className="w-full">
            {s.kind === 'starting' ? 'Starting…' : 'Start exam'}
          </Button>
          {errorBlock}
        </GlassCard>
      </main>
    );
  }

  if (s.kind === 'in-progress') {
    const it = s.items[s.idx]!;
    const picked = s.picks[s.idx];
    const remainingMs = Math.max(0, s.deadlineAt - now);
    const remainingSec = Math.ceil(remainingMs / 1000);
    const timerCritical = remainingSec > 0 && remainingSec <= 10;
    const last = s.idx === s.items.length - 1;
    return (
      <main className="mx-auto max-w-2xl">
        <PageHeader
          title="Exam"
          subtitle={`Question ${s.idx + 1} of ${s.items.length}`}
        />
        <GlassCard>
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-display text-2xl tracking-display text-fg">{it.prompt}</h2>
            <span
              aria-live="polite"
              className={`shrink-0 rounded-full border px-3 py-1 font-mono text-base tabular-nums ${
                timerCritical
                  ? 'border-danger bg-danger/15 text-danger animate-pulse'
                  : 'border-glass-border bg-glass text-fg'
              }`}
              data-testid="exam-timer"
            >
              {formatTime(remainingSec)}
            </span>
          </div>
          <div className="mt-6 space-y-2" role="radiogroup" aria-label={it.prompt}>
            {it.options.map((opt, i) => {
              const isPicked = picked === i;
              return (
                <OptionButton
                  key={i}
                  letter={letterFor(i)}
                  state={isPicked ? 'selected' : 'idle'}
                  onClick={() => {
                    setState({ ...s, picks: { ...s.picks, [s.idx]: i } });
                  }}
                  aria-label={`Option ${letterFor(i)}: ${opt}`}
                >
                  {opt}
                </OptionButton>
              );
            })}
          </div>

          <div className="mt-6 flex items-center justify-between gap-2">
            <div className="text-xs text-muted">
              {Object.keys(s.picks).length} / {s.items.length} answered
            </div>
            <div className="flex gap-2">
              {s.idx > 0 && (
                <Button variant="secondary" onClick={() => setState({ ...s, idx: s.idx - 1 })} data-testid="prev-btn">
                  ← Previous
                </Button>
              )}
              {last ? (
                <Button
                  onClick={() => {
                    if (submittingRef.current) return;
                    submittingRef.current = true;
                    void doSubmit();
                  }}
                  data-testid="submit-btn"
                >
                  Submit exam
                </Button>
              ) : (
                <Button onClick={() => setState({ ...s, idx: s.idx + 1 })} data-testid="next-btn">
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
  const bandLabel = s.band.toUpperCase();
  return (
    <main className="mx-auto max-w-2xl">
      <PageHeader
        title="Exam results"
        subtitle={`${s.score} / ${s.total} • ${pct}% • ${formatTime(durationSec)}`}
      />
      <GlassCard className="space-y-5">
        <div className="flex flex-wrap items-baseline gap-4">
          <span className="font-display text-5xl tracking-display text-fg">{pct}%</span>
          <span className="rounded-full border border-warning/30 bg-warning/15 px-3 py-1 text-sm font-semibold text-warning">
            CEFR band: {bandLabel}
          </span>
          <span className="text-sm text-muted">{s.score} of {s.total} correct</span>
        </div>

        <ol className="space-y-4">
          {s.results.map((r, i) => {
            const it = s.items[i];
            if (!it) return null;
            return (
              <li key={r.itemId} className="rounded-card border border-glass-border p-4">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      r.correct ? 'bg-success text-[#06222D]' : 'bg-danger text-white'
                    }`}
                    aria-label={r.correct ? 'Correct' : 'Wrong'}
                  >
                    {i + 1}
                  </span>
                  <div className="text-sm font-medium text-fg">{it.prompt}</div>
                </div>
                <div className="mt-3 grid gap-1 pl-8">
                  {it.options.map((opt, j) => {
                    const isCorrectOpt = j === r.correctIdx;
                    const isPicked = r.picked === j;
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
                  <p className="mt-1 text-sm text-fg">{r.explanation}</p>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="flex flex-wrap gap-2">
          <Button onClick={start}>New exam</Button>
          <Button variant="secondary" onClick={() => setState({ kind: 'idle' })}>Change level</Button>
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