'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { useSession } from '@/lib/useSession';
import type { FlashCardT, FlashDeckT } from '@quantara/shared';

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

/** Phase 7 UI contract — server returns these field names. See
 *  apps/api/src/routes/flashcards.ts for the Zod contract.
 */
type ReviewResponse = { card: FlashCardT; xpDelta: number };

type View =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'list'; decks: FlashDeckT[]; xp: number }
  | { kind: 'create' }
  | { kind: 'review'; deck: FlashDeckT; cards: FlashCardT[]; xp: number };

const fmtDate = (unixSec: number): string => {
  try {
    return new Date(unixSec * 1000).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '—';
  }
};

/** Simplified SM-2 grade → XP delta. Mirrors the server side
 *  (XP_BY_GRADE in apps/api/src/routes/flashcards.ts). */
const xpForGrade = (g: 0 | 1 | 2 | 3) => [0, 1, 3, 6][g]!;
const gradeLabel = (g: 0 | 1 | 2 | 3) =>
  (['Again', 'Hard', 'Good', 'Easy'] as const)[g]!;
const gradeColor = (g: 0 | 1 | 2 | 3) =>
  (['danger', 'warning', 'success', 'accent'] as const)[g]!;

export default function FlashcardsPage() {
  const { user, loading } = useSession();
  const [view, setView] = useState<View>({ kind: 'loading' });

  const refreshList = useCallback(async () => {
    if (loading) return;
    if (!user) {
      setView({ kind: 'list', decks: [], xp: 0 });
      return;
    }
    setView({ kind: 'loading' });
    try {
      const [decksRes, xpRes] = await Promise.all([
        fetch(`${API}/api/flashcards/decks`, { credentials: 'include' }),
        fetch(`${API}/api/me/xp`, { credentials: 'include' }),
      ]);
      if (!decksRes.ok) throw new Error(`decks ${decksRes.status}`);
      if (!xpRes.ok) throw new Error(`xp ${xpRes.status}`);
      const decks = (await decksRes.json()) as FlashDeckT[];
      const xp = ((await xpRes.json()) as { xp: number }).xp ?? 0;
      setView({ kind: 'list', decks, xp });
    } catch (e) {
      setView({
        kind: 'error',
        message: e instanceof Error ? e.message : 'Could not load decks',
      });
    }
  }, [loading, user]);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  if (view.kind === 'loading') {
    return (
      <main className="space-y-4">
        <PageHeader title="Flashcards" subtitle="Spaced-repetition decks" />
        <LoadingState />
      </main>
    );
  }
  if (view.kind === 'error') {
    return (
      <main className="space-y-4">
        <PageHeader title="Flashcards" subtitle="Spaced-repetition decks" />
        <ErrorState
          title="Could not load your decks"
          detail={view.message}
        >
          <button
            type="button"
            onClick={refreshList}
            className="mt-2 text-sm text-accent underline-offset-2 hover:underline"
          >
            Try again
          </button>
        </ErrorState>
      </main>
    );
  }
  if (view.kind === 'create') {
    return <CreateDeckView onDone={refreshList} onCancel={() => setView({ kind: 'list', decks: [], xp: 0 })} />;
  }
  if (view.kind === 'review') {
    return (
      <ReviewView
        deck={view.deck}
        cards={view.cards}
        xp={view.xp}
        onExit={(finalXp) => setView({ kind: 'list', decks: [], xp: finalXp })}
      />
    );
  }

  // List view
  return (
    <main className="space-y-5">
      <PageHeader
        title="Flashcards"
        subtitle="Decks that adapt to how well you remember."
        right={
          <>
            <XpChip xp={view.xp} />
            <Button size="sm" onClick={() => setView({ kind: 'create' })}>
              <span aria-hidden="true" className="mr-1">＋</span>
              New deck
            </Button>
          </>
        }
      />

      {view.decks.length === 0 ? (
        <EmptyState
          title="No decks yet"
          hint="Build your first deck to start the SRS loop. Cards start due-now and adapt as you rate each review."
        >
          <Button onClick={() => setView({ kind: 'create' })}>
            <span aria-hidden="true" className="mr-1">＋</span>
            Create your first deck
          </Button>
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {view.decks.map((d) => (
            <li key={d.id}>
              <DeckCard
                deck={d}
                onStudy={() => openReview(d, setView)}
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

const XpChip = ({ xp }: { xp: number }) => (
  <span
    className="inline-flex items-center gap-1.5 rounded-pill border border-accent/30 bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent"
    aria-label={`Total XP ${xp}`}
  >
    <span aria-hidden="true">★</span>
    {xp.toLocaleString()} XP
  </span>
);

const DeckCard = ({
  deck,
  onStudy,
}: {
  deck: FlashDeckT;
  onStudy: () => void;
}) => {
  const hasDue = deck.dueCount > 0;
  return (
    <GlassCard className="flex h-full flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-lg tracking-display text-fg">
            {deck.title}
          </div>
          <div className="truncate text-xs uppercase tracking-wide text-muted">
            {deck.topic}
          </div>
        </div>
        <SourceChip source={deck.source} />
      </div>

      <div className="flex items-center gap-2 text-xs text-muted">
        <span className="rounded-pill border border-glass-border bg-glass-bg px-2.5 py-0.5">
          {deck.cardCount} {deck.cardCount === 1 ? 'card' : 'cards'}
        </span>
        <span
          className={`rounded-pill border px-2.5 py-0.5 ${
            hasDue
              ? 'border-accent/30 bg-accent/10 text-accent'
              : 'border-glass-border bg-glass-bg text-muted'
          }`}
        >
          {deck.dueCount} due
        </span>
        <span className="ml-auto">{fmtDate(deck.createdAt)}</span>
      </div>

      <div className="mt-auto flex gap-2">
        <Button
          size="sm"
          variant={hasDue ? 'primary' : 'secondary'}
          onClick={onStudy}
          aria-label={`Review ${deck.title}`}
        >
          {hasDue ? 'Review' : 'Study all'}
        </Button>
      </div>
    </GlassCard>
  );
};

const SourceChip = ({ source }: { source: FlashDeckT['source'] }) => (
  <span
    className={`shrink-0 rounded-pill border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
      source === 'ai'
        ? 'border-primary/30 bg-primary/10 text-primary'
        : 'border-glass-border bg-glass-bg text-muted'
    }`}
  >
    {source}
  </span>
);

async function openReview(deck: FlashDeckT, setView: (v: View) => void) {
  setView({ kind: 'loading' });
  try {
    const res = await fetch(
      `${API}/api/flashcards/decks/${encodeURIComponent(deck.id)}/cards`,
      { credentials: 'include' },
    );
    if (!res.ok) throw new Error(`cards ${res.status}`);
    const cards = (await res.json()) as FlashCardT[];
    const xpRes = await fetch(`${API}/api/me/xp`, { credentials: 'include' });
    const xp = xpRes.ok ? ((await xpRes.json()) as { xp: number }).xp ?? 0 : 0;
    setView({ kind: 'review', deck, cards, xp });
  } catch (e) {
    setView({
      kind: 'error',
      message: e instanceof Error ? e.message : 'Could not open deck',
    });
  }
}

// ---------- Create-deck view ----------

type DraftCard = { front: string; back: string };

const emptyDraftCard = (): DraftCard => ({ front: '', back: '' });

const CreateDeckView = ({
  onDone,
  onCancel,
}: {
  onDone: () => void;
  onCancel: () => void;
}) => {
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [cards, setCards] = useState<DraftCard[]>([emptyDraftCard(), emptyDraftCard(), emptyDraftCard()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(
    () =>
      title.trim().length > 0 &&
      topic.trim().length > 0 &&
      cards.filter((c) => c.front.trim() && c.back.trim()).length >= 1,
    [title, topic, cards],
  );

  const updateCard = (i: number, patch: Partial<DraftCard>) => {
    setCards((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  };
  const addCard = () => setCards((prev) => [...prev, emptyDraftCard()]);
  const removeCard = (i: number) => setCards((prev) => prev.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    const clean = cards
      .map((c) => ({ front: c.front.trim(), back: c.back.trim() }))
      .filter((c) => c.front && c.back);
    try {
      const res = await fetch(`${API}/api/flashcards/decks`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), topic: topic.trim(), cards: clean }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Create failed (${res.status}): ${txt || 'no body'}`);
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create deck');
      setSubmitting(false);
    }
  };

  return (
    <main className="space-y-5">
      <PageHeader
        title="New deck"
        subtitle="Cards start due-now and adapt as you grade each review."
        right={
          <>
            <Button size="sm" variant="ghost" onClick={onCancel} disabled={submitting}>
              Cancel
            </Button>
            <Button size="sm" onClick={submit} disabled={!canSubmit || submitting}>
              {submitting ? 'Creating…' : 'Create deck'}
            </Button>
          </>
        }
      />

      <GlassCard className="space-y-3">
        <Field label="Title">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Irregular past participles"
            maxLength={80}
          />
        </Field>
        <Field label="Topic">
          <Input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. B1 grammar"
            maxLength={80}
          />
        </Field>
      </GlassCard>

      <section className="space-y-3">
        <h2 className="font-display text-sm uppercase tracking-display text-muted">
          Cards
        </h2>
        <ul className="space-y-3">
          {cards.map((c, i) => (
            <li key={i}>
              <GlassCard className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wide text-muted">
                    Card {i + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeCard(i)}
                    className="text-xs text-muted underline-offset-2 hover:text-danger hover:underline"
                    aria-label={`Remove card ${i + 1}`}
                  >
                    Remove
                  </button>
                </div>
                <Field label="Front">
                  <Input
                    value={c.front}
                    onChange={(e) => updateCard(i, { front: e.target.value })}
                    placeholder="Question / prompt"
                    maxLength={200}
                  />
                </Field>
                <Field label="Back">
                  <Input
                    value={c.back}
                    onChange={(e) => updateCard(i, { back: e.target.value })}
                    placeholder="Answer / explanation"
                    maxLength={400}
                  />
                </Field>
              </GlassCard>
            </li>
          ))}
        </ul>
        <Button variant="secondary" size="sm" onClick={addCard}>
          <span aria-hidden="true" className="mr-1">＋</span>
          Add card
        </Button>
      </section>

      {error && <ErrorState title="Could not create deck" detail={error} />}
    </main>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block space-y-1.5">
    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
      {label}
    </span>
    {children}
  </label>
);

// ---------- Review view ----------

const ReviewView = ({
  deck,
  cards,
  xp: initialXp,
  onExit,
}: {
  deck: FlashDeckT;
  cards: FlashCardT[];
  xp: number;
  onExit: (finalXp: number) => void;
}) => {
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sessionXp, setSessionXp] = useState(0);
  const [graded, setGraded] = useState<Array<{ cardId: string; grade: 0 | 1 | 2 | 3 }>>([]);
  const lastTapRef = useRef<number>(0);

  const current = cards[idx];
  const done = idx >= cards.length;

  const grade = async (g: 0 | 1 | 2 | 3) => {
    if (!current || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(
        `${API}/api/flashcards/cards/${encodeURIComponent(current.id)}/review`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ grade: g }),
        },
      );
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Review failed (${res.status}): ${txt || 'no body'}`);
      }
      const data = (await res.json()) as ReviewResponse;
      setSessionXp((s) => s + (data.xpDelta ?? 0));
      setGraded((g_) => [...g_, { cardId: current.id, grade: g }]);
      setIdx((i) => i + 1);
      setFlipped(false);
    } catch (e) {
      // Soft-fail: keep the user on the card. Console only.
      console.error('flashcard review failed', e);
    } finally {
      setSubmitting(false);
    }
  };

  // Keyboard shortcuts: Space = flip, 1-4 = grade
  useEffect(() => {
    if (done) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (['1', '2', '3', '4'].includes(e.key)) {
        const g = (Number(e.key) - 1) as 0 | 1 | 2 | 3;
        grade(g);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [idx, done, current?.id, grade]);

  if (done) {
    const finalXp = initialXp + sessionXp;
    return (
      <main className="space-y-5">
        <PageHeader
          title="Session complete"
          subtitle={deck.title}
          right={<XpChip xp={finalXp} />}
        />
        <GlassCard className="space-y-4 text-center">
          <div className="font-display text-3xl tracking-display text-fg">
            {graded.length} {graded.length === 1 ? 'card' : 'cards'} reviewed
          </div>
          <div className="text-sm text-muted">
            +{sessionXp} XP this session · total {finalXp.toLocaleString()}
          </div>
          <div className="mx-auto flex max-w-sm flex-wrap justify-center gap-1.5">
            {graded.map((g) => (
              <span
                key={g.cardId}
                className={`rounded-pill border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  gradeColor(g.grade) === 'danger'
                    ? 'border-danger/30 bg-danger/10 text-danger'
                    : gradeColor(g.grade) === 'warning'
                      ? 'border-warning/30 bg-warning/10 text-warning'
                      : gradeColor(g.grade) === 'success'
                        ? 'border-success/30 bg-success/10 text-success'
                        : 'border-accent/30 bg-accent/10 text-accent'
                }`}
                aria-label={`Card graded ${gradeLabel(g.grade)}`}
              >
                {gradeLabel(g.grade)}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <Button onClick={() => onExit(finalXp)}>Back to decks</Button>
            <Button
              variant="secondary"
              onClick={() => {
                setIdx(0);
                setFlipped(false);
                setGraded([]);
                setSessionXp(0);
              }}
            >
              Review again
            </Button>
          </div>
        </GlassCard>
      </main>
    );
  }

  const onCardTap = () => {
    // Debounce: a single user tap shouldn't double-flip.
    const now = Date.now();
    if (now - lastTapRef.current < 250) return;
    lastTapRef.current = now;
    setFlipped((f) => !f);
  };

  if (!current) {
    // Defensive — should never hit because `done` returns above.
    return (
      <main className="space-y-5">
        <PageHeader title={deck.title} subtitle={deck.topic} />
        <ErrorState title="No cards in this deck" detail="Add at least one card and try again." />
      </main>
    );
  }

  return (
    <main className="space-y-5">
      <PageHeader
        title={deck.title}
        subtitle={deck.topic}
        right={
          <>
            <XpChip xp={initialXp + sessionXp} />
            <Button size="sm" variant="ghost" onClick={() => onExit(initialXp + sessionXp)}>
              Exit
            </Button>
          </>
        }
      />

      <div className="flex items-center gap-2 text-xs text-muted">
        <span>
          Card {idx + 1} of {cards.length}
        </span>
        <span
          className="ml-auto rounded-pill border border-glass-border bg-glass-bg px-2.5 py-0.5"
          aria-label={`Progress ${Math.round(((idx) / cards.length) * 100)} percent`}
        >
          {Math.round((idx / cards.length) * 100)}%
        </span>
      </div>

      {/* Card */}
      <button
        type="button"
        onClick={onCardTap}
        className="glass w-full min-h-[200px] rounded-glass p-6 text-left focus:outline-none focus:ring-2 focus:ring-accent"
        aria-label={flipped ? 'Show front' : 'Show back'}
      >
        <div className="mb-2 text-[10px] uppercase tracking-wide text-muted">
          {flipped ? 'Back' : 'Front'}
        </div>
        <div className="whitespace-pre-wrap font-display text-2xl leading-snug text-fg sm:text-3xl">
          {flipped ? current.back : current.front}
        </div>
        <div className="mt-4 text-[11px] uppercase tracking-wide text-muted">
          Tap to flip · Space to flip · 1-4 to grade
        </div>
      </button>

      {/* Grade buttons */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {([0, 1, 2, 3] as const).map((g) => {
          const tone = gradeColor(g);
          const ring =
            tone === 'danger'
              ? 'border-danger/40 hover:bg-danger/10'
              : tone === 'warning'
                ? 'border-warning/40 hover:bg-warning/10'
                : tone === 'success'
                  ? 'border-success/40 hover:bg-success/10'
                  : 'border-accent/40 hover:bg-accent/10';
          const nextDays =
            g === 0
              ? '< 1m'
              : g === 1
                ? '< 1d'
                : g === 2
                  ? `${Math.max(1, Math.round(current.srsState.intervalDays))}d`
                  : `${Math.max(1, Math.round(current.srsState.intervalDays * 1.3))}d`;
          return (
            <button
              key={g}
              type="button"
              onClick={() => grade(g)}
              disabled={submitting}
              className={`glass flex flex-col items-center justify-center gap-0.5 rounded-card border px-3 py-3 text-sm font-semibold transition disabled:opacity-50 ${ring}`}
              aria-label={`Grade ${gradeLabel(g)}, +${xpForGrade(g)} XP`}
            >
              <span className="text-base">{gradeLabel(g)}</span>
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted">
                {nextDays}
              </span>
            </button>
          );
        })}
      </div>
    </main>
  );
};
