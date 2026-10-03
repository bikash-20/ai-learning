'use client';

import { useEffect, useState } from 'react';
import type { UserPrefsT } from '@quantara/shared';
import { PageHeader } from '@/components/ui/PageHeader';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { useTheme } from '@/lib/useTheme';

type LoadState = 'loading' | 'ready' | 'saving' | 'saved' | 'error';

export default function SettingsPage() {
  const [prefs, setPrefs] = useState<UserPrefsT | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [err, setErr] = useState<{ title: string; detail: string } | null>(null);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setState('loading');
    setErr(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/me/prefs`, {
        credentials: 'include',
      });
      if (!res.ok) {
        setErr({ title: 'Could not load settings', detail: `Status ${res.status}` });
        setState('error');
        return;
      }
      const j = (await res.json()) as UserPrefsT;
      setPrefs(j);
      setTheme(j.theme);
      setState('ready');
    } catch (e) {
      setErr({ title: 'Network error', detail: e instanceof Error ? e.message : 'Unknown' });
      setState('error');
    }
  }

  async function patch(p: Partial<UserPrefsT>) {
    if (!prefs) return;
    setState('saving');
    setErr(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/me/prefs`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p),
      });
      if (!res.ok) {
        setErr({ title: 'Could not save', detail: `Status ${res.status}` });
        setState('error');
        return;
      }
      const j = (await res.json()) as UserPrefsT;
      setPrefs(j);
      setTheme(j.theme);
      setState('saved');
      setTimeout(() => setState('ready'), 1200);
    } catch (e) {
      setErr({ title: 'Network error', detail: e instanceof Error ? e.message : 'Unknown' });
      setState('error');
    }
  }

  return (
    <main className="mx-auto max-w-xl space-y-5">
      <PageHeader title="Settings" subtitle="Per-user preferences" />

      <GlassCard className="space-y-5">
        <div>
          <div className="font-display text-lg tracking-display text-fg">AI explanations</div>
          <p className="mt-1 text-sm text-muted">
            When you tap Check on a quiz, we fetch an AI explanation in addition to the
            static one. Turn this off to skip the AI call — the static explanation stays
            on screen, no extra latency, no free-tier quota used.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <Toggle
              checked={prefs?.aiExplain ?? true}
              disabled={state === 'saving' || state === 'loading'}
              onChange={(v) => patch({ aiExplain: v })}
              label={prefs?.aiExplain ? 'On' : 'Off'}
            />
            <span className="text-xs text-muted">
              {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved ✓' : ''}
            </span>
          </div>
        </div>

        <div className="border-t border-glass-border pt-5">
          <div className="font-display text-lg tracking-display text-fg">Theme</div>
          <p className="mt-1 text-sm text-muted">
            System follows your OS. Pick Light or Dark to override.
          </p>
          <div className="mt-3 flex gap-2" role="radiogroup" aria-label="Theme">
            {(['system', 'light', 'dark'] as const).map((t) => {
              const active = theme === t;
              return (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={state === 'saving' || state === 'loading'}
                  onClick={() => patch({ theme: t })}
                  className={`flex-1 rounded-card border px-3 py-2 text-sm capitalize transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] ${
                    active
                      ? 'border-accent bg-accent text-[color:var(--primary-fg)] shadow-glow'
                      : 'border-glass-border bg-glass text-fg hover:border-accent'
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>
      </GlassCard>

      {err && (
        <ErrorState title={err.title} detail={err.detail}>
          <div className="mt-3">
            <Button size="sm" variant="ghost" onClick={load}>Retry</Button>
          </div>
        </ErrorState>
      )}
    </main>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <label className={`inline-flex items-center gap-2 ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
      <span className="sr-only">Toggle AI explanations</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 rounded-full border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] ${
          checked
            ? 'border-accent bg-accent'
            : 'border-glass-border bg-glass'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
            checked ? 'left-6' : 'left-0.5'
          }`}
        />
      </button>
      <span className="text-sm font-medium text-fg">{label}</span>
    </label>
  );
}