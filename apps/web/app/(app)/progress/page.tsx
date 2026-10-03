'use client';

import { useEffect, useState } from 'react';
import type { ProgressT } from '@quantara/shared';
import { PageHeader } from '@/components/ui/PageHeader';
import { GlassCard } from '@/components/ui/GlassCard';
import { ErrorState } from '@/components/ui/ErrorState';
import { Button } from '@/components/ui/Button';

const LEVELS: Array<keyof ProgressT['byLevel']> = ['A2', 'B1', 'B2', 'C1'];

type LoadState = 'loading' | 'ready' | 'error';

export default function ProgressPage() {
  const [data, setData] = useState<ProgressT | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { void load(); }, []);

  async function load() {
    setState('loading');
    setErr(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/me/progress`, { credentials: 'include' });
      if (!res.ok) {
        setErr(`Status ${res.status}`);
        setState('error');
        return;
      }
      const j = (await res.json()) as ProgressT;
      setData(j);
      setState('ready');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Network error');
      setState('error');
    }
  }

  if (state === 'loading') {
    return (
      <main className="mx-auto max-w-3xl space-y-5">
        <PageHeader title="Progress" subtitle="Your accuracy, level breakdown, and weak areas." />
        <GlassCard><p className="text-sm text-muted">Loading…</p></GlassCard>
      </main>
    );
  }
  if (state === 'error' || !data) {
    return (
      <main className="mx-auto max-w-3xl space-y-5">
        <PageHeader title="Progress" subtitle="Your accuracy, level breakdown, and weak areas." />
        <ErrorState title="Could not load progress" detail={err ?? 'Unknown error'}>
          <div className="mt-3"><Button size="sm" variant="ghost" onClick={load}>Retry</Button></div>
        </ErrorState>
      </main>
    );
  }
  if (data.totalAttempts === 0) {
    return (
      <main className="mx-auto max-w-3xl space-y-5">
        <PageHeader title="Progress" subtitle="Your accuracy, level breakdown, and weak areas." />
        <GlassCard>
          <p className="text-sm text-fg">
            No data yet — finish a quiz to see your accuracy and weak areas here.
          </p>
          <p className="mt-2 text-xs text-muted">
            Try a quick quiz from the hub. Each attempt feeds the analytics below.
          </p>
        </GlassCard>
      </main>
    );
  }

  const accuracyPct = Math.round(data.accuracy * 100);
  return (
    <main className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="Progress" subtitle="Your accuracy, level breakdown, and weak areas." />

      <GlassCard>
        <div className="flex items-baseline gap-4">
          <span className="font-display text-5xl tracking-display text-fg">{accuracyPct}%</span>
          <span className="text-sm text-muted">
            {data.totalCorrect} of {data.totalItems} correct · {data.totalAttempts} attempts
          </span>
        </div>
        <div className="mt-4">
          <div className="text-xs uppercase tracking-wide text-muted">By CEFR level</div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {LEVELS.map((lvl) => {
              const row = data.byLevel[lvl];
              if (!row || row.total === 0) {
                return (
                  <div key={lvl} className="rounded-card border border-glass-border bg-glass/30 p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-fg">{lvl}</span>
                      <span className="text-xs text-muted">no data</span>
                    </div>
                  </div>
                );
              }
              const pct = Math.round((row.correct / row.total) * 100);
              const heat = heatColor(row.correct / row.total);
              return (
                <div key={lvl} className="rounded-card border border-glass-border bg-glass p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-fg">{lvl}</span>
                    <span className="font-mono text-xs text-muted">{row.correct}/{row.total}</span>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-glass-border">
                    <div className={`h-full ${heat}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-1 text-xs text-muted">{pct}%</div>
                </div>
              );
            })}
          </div>
        </div>
      </GlassCard>

      <div className="grid gap-5 sm:grid-cols-2">
        <GlassCard>
          <div className="font-display text-lg tracking-display text-fg">Weak areas</div>
          <p className="mt-1 text-xs text-muted">Topics where you miss the most. Drill these.</p>
          {data.weak.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Need ≥ 3 items in a topic before we surface it. Keep practising.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {data.weak.map((t) => (
                <li key={t.topic} className="flex items-center justify-between rounded-card border border-glass-border bg-glass px-3 py-2 text-sm">
                  <span className="truncate text-fg">{t.topic}</span>
                  <span className="ml-2 shrink-0 font-mono text-xs text-danger">{Math.round(t.pct * 100)}% · {t.correct}/{t.total}</span>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>

        <GlassCard>
          <div className="font-display text-lg tracking-display text-fg">Strongest topics</div>
          <p className="mt-1 text-xs text-muted">Where you already land the answer.</p>
          {data.best.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Need ≥ 3 items in a topic before we surface it.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {data.best.map((t) => (
                <li key={t.topic} className="flex items-center justify-between rounded-card border border-glass-border bg-glass px-3 py-2 text-sm">
                  <span className="truncate text-fg">{t.topic}</span>
                  <span className="ml-2 shrink-0 font-mono text-xs text-success">{Math.round(t.pct * 100)}% · {t.correct}/{t.total}</span>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
      </div>

      <GlassCard>
        <div className="font-display text-lg tracking-display text-fg">Recent attempts</div>
        {data.recent.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No finished attempts yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-glass-border">
            {data.recent.map((r) => {
              const pct = r.total === 0 ? 0 : Math.round((r.score / r.total) * 100);
              return (
                <li key={r.quizId} className="flex items-center justify-between py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate text-fg">{r.topic}</div>
                    <div className="text-xs text-muted">{r.level}{r.finishedAt ? ` · ${formatDate(r.finishedAt)}` : ''}</div>
                  </div>
                  <div className="ml-3 shrink-0 font-mono text-xs text-fg">{r.score}/{r.total} · {pct}%</div>
                </li>
              );
            })}
          </ul>
        )}
      </GlassCard>
    </main>
  );
}

function heatColor(pct: number) {
  if (pct >= 0.8) return 'bg-success';
  if (pct >= 0.6) return 'bg-primary';
  if (pct >= 0.4) return 'bg-warning';
  return 'bg-danger';
}

function formatDate(unixSec: number) {
  const d = new Date(unixSec * 1000);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}