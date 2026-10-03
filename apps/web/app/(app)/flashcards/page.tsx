'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Modal } from '@/components/ui/Modal';
import { Tabs } from '@/components/ui/Tabs';
import { ModelChip } from '@/components/ui/ModelChip';
import { Markdown } from '@/components/ui/Markdown';
import { StarIcon } from '@/components/ui/icons';
import { useSession } from '@/lib/useSession';
import {
  addMoreCards,
  deleteDeck,
  downloadDeck,
  explainCard,
  generateDeck,
  getHint,
  importDeck,
  listCards,
  listDecks,
  renameDeck,
  resetDeck,
  reviewCard,
  saveDeck,
} from '@/lib/flashcards';
import type {
  FlashCardGenT,
  FlashCardT,
  FlashDeckGenRequestT,
  FlashDeckGenResponseT,
  FlashDeckT,
} from '@quantara/shared';

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

type View =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'list'; decks: FlashDeckT[]; xp: number }
  | { kind: 'create'; tab: 'ai' | 'manual' }
  | { kind: 'review'; deck: FlashDeckT; cards: FlashCardT[]; xp: number };

type ExplainDepth = 'normal' | 'simpler' | 'deeper';

const xpForGrade = (g: 0 | 1 | 2 | 3) => [0, 1, 3, 6][g]!;
const gradeLabel = (g: 0 | 1 | 2 | 3) =>
  (['Again', 'Hard', 'Good', 'Easy'] as const)[g]!;
const gradeColor = (g: 0 | 1 | 2 | 3) =>
  (['danger', 'warning', 'success', 'accent'] as const)[g]!;

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

const getXp = async () => {
  const res = await fetch(`${API}/api/me/xp`, { credentials: 'include' });
  if (!res.ok) return 0;
  return ((await res.json()) as { xp: number }).xp ?? 0;
};

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
      const [decks, xp] = await Promise.all([listDecks(), getXp()]);
      setView({ kind: 'list', decks, xp });
    } catch (e) {
      setView({
        kind: 'error',
        message: e instanceof Error ? e.message : 'Could not load decks',
      });
    }
  }, [loading, user]);

  useEffect(() => {
    void refreshList();
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
        <ErrorState title="Could not load your decks" detail={view.message}>
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
    return (
      <NewDeckView
        initialTab={view.tab}
        onDone={() => void refreshList()}
        onCancel={() => setView({ kind: 'list', decks: [], xp: 0 })}
      />
    );
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

  return (
    <ListView
      decks={view.decks}
      xp={view.xp}
      onRefresh={refreshList}
      onCreate={(tab) => setView({ kind: 'create', tab })}
      onStudy={(deck) => openReview(deck, setView)}
    />
  );
}

// =====================================================================
// List view
// =====================================================================

const ListView = ({
  decks,
  xp,
  onRefresh,
  onCreate,
  onStudy,
}: {
  decks: FlashDeckT[];
  xp: number;
  onRefresh: () => Promise<void>;
  onCreate: (tab: 'ai' | 'manual') => void;
  onStudy: (deck: FlashDeckT) => Promise<void>;
}) => {
  return (
    <main className="space-y-5">
      <PageHeader
        title="Flashcards"
        subtitle="Decks that adapt to how well you remember."
        right={
          <>
            <XpChip xp={xp} />
            <Button size="sm" onClick={() => onCreate('ai')}>
              <span aria-hidden="true" className="mr-1">＋</span>
              New deck
            </Button>
          </>
        }
      />

      {decks.length === 0 ? (
        <EmptyState
          title="No decks yet"
          hint="Generate a deck with AI for any topic — or build one by hand."
        >
          <div className="mt-1 flex flex-wrap justify-center gap-2">
            <Button onClick={() => onCreate('ai')}>
              <span aria-hidden="true" className="mr-1">✨</span>
              Generate with AI
            </Button>
            <Button variant="secondary" onClick={() => onCreate('manual')}>
              <span aria-hidden="true" className="mr-1">＋</span>
              Manual deck
            </Button>
          </div>
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {decks.map((d) => (
            <li key={d.id}>
              <DeckCard deck={d} onStudy={() => void onStudy(d)} onRefresh={onRefresh} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
};

const XpChip = ({ xp }: { xp: number }) => (
  <span
    className="inline-flex items-center gap-1.5 rounded-pill border border-accent/30 bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent"
    aria-label={`Total XP ${xp}`}
  >
    <StarIcon size={12} decorative />
    {xp.toLocaleString()} XP
  </span>
);

const DeckCard = ({
  deck,
  onStudy,
  onRefresh,
}: {
  deck: FlashDeckT;
  onStudy: () => void;
  onRefresh: () => Promise<void>;
}) => {
  const hasDue = deck.dueCount > 0;
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState(deck.title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setMenuOpen(false);
    setRenaming(false);
    setRenameVal(deck.title);
  };

  const doRename = async () => {
    const next = renameVal.trim();
    if (!next || next === deck.title) {
      close();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await renameDeck(deck.id, { title: next });
      await onRefresh();
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rename failed');
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    if (!confirm(`Delete "${deck.title}"? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteDeck(deck.id);
      await onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
      setBusy(false);
    }
  };

  const doReset = async () => {
    if (!confirm(`Reset all cards in "${deck.title}"? They become due now and your review history clears.`)) return;
    setBusy(true);
    setError(null);
    try {
      await resetDeck(deck.id);
      await onRefresh();
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reset failed');
    } finally {
      setBusy(false);
    }
  };

  const doExport = async (format: 'json' | 'csv') => {
    try {
      await downloadDeck(deck.id, format);
    } catch (e) {
      setError(e instanceof Error ? e.message : `Export ${format} failed`);
    }
  };

  return (
    <GlassCard className="flex h-full flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <div className="flex gap-1">
              <Input
                value={renameVal}
                onChange={(e) => setRenameVal(e.target.value)}
                maxLength={80}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void doRename();
                  if (e.key === 'Escape') close();
                }}
              />
              <Button size="sm" variant="secondary" onClick={() => void doRename()} disabled={busy}>
                Save
              </Button>
            </div>
          ) : (
            <>
              <div className="truncate font-display text-lg tracking-display text-fg">{deck.title}</div>
              <div className="truncate text-xs uppercase tracking-wide text-muted">{deck.topic}</div>
            </>
          )}
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

      {error && <ErrorState detail={error} />}

      <div className="mt-auto flex items-center gap-2">
        <Button
          size="sm"
          variant={hasDue ? 'primary' : 'secondary'}
          onClick={onStudy}
          aria-label={`Review ${deck.title}`}
        >
          {hasDue ? 'Review' : 'Study all'}
        </Button>
        <div className="relative ml-auto">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={`Deck actions for ${deck.title}`}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            className="glass-pill flex h-9 w-9 items-center justify-center rounded-pill border border-glass-border text-muted hover:text-fg"
          >
            ⋯
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="glass absolute right-0 z-10 mt-1 flex w-48 flex-col rounded-card border border-glass-border p-1 text-left shadow-xl"
              onMouseLeave={close}
            >
              <MenuItem
                onClick={() => {
                  setRenaming(true);
                  setMenuOpen(false);
                }}
              >
                Rename
              </MenuItem>
              <MenuItem
                onClick={() => {
                  void doReset();
                  setMenuOpen(false);
                }}
              >
                Reset progress
              </MenuItem>
              <MenuItem onClick={() => doExport('json')}>Export JSON</MenuItem>
              <MenuItem onClick={() => doExport('csv')}>Export CSV</MenuItem>
              <MenuItem
                onClick={() => {
                  void doDelete();
                  setMenuOpen(false);
                }}
                danger
              >
                Delete
              </MenuItem>
            </div>
          )}
        </div>
      </div>
    </GlassCard>
  );
};

const MenuItem = ({
  onClick,
  children,
  danger = false,
}: {
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) => (
  <button
    type="button"
    role="menuitem"
    onClick={onClick}
    className={`rounded-pill px-3 py-1.5 text-left text-xs hover:bg-glass-bg ${
      danger ? 'text-danger' : 'text-fg'
    }`}
  >
    {children}
  </button>
);

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
    const [cards, xp] = await Promise.all([listCards(deck.id), getXp()]);
    setView({ kind: 'review', deck, cards, xp });
  } catch (e) {
    setView({
      kind: 'error',
      message: e instanceof Error ? e.message : 'Could not open deck',
    });
  }
}

// =====================================================================
// Create-deck view (AI tab + Manual tab)
// =====================================================================

type DraftCard = FlashCardGenT;

const emptyDraftCard = (): DraftCard => ({
  front: '',
  back: '',
  hint: '',
  explanation: '',
  tags: [],
  difficulty: 'easy',
});

const NewDeckView = ({
  initialTab,
  onDone,
  onCancel,
}: {
  initialTab: 'ai' | 'manual';
  onDone: () => void;
  onCancel: () => void;
}) => {
  const [tab, setTab] = useState<'ai' | 'manual'>(initialTab);

  return (
    <main className="space-y-5">
      <PageHeader
        title="New deck"
        subtitle="Cards start due-now and adapt as you grade each review."
        right={
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        }
      />

      <Tabs
        ariaLabel="Deck creation mode"
        items={[
          { id: 'ai', label: 'Generate with AI', badge: 'new' },
          { id: 'manual', label: 'Manual' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'ai' ? (
        <AiDeckTab onDone={onDone} onCancel={onCancel} />
      ) : (
        <ManualDeckTab onDone={onDone} onCancel={onCancel} />
      )}
    </main>
  );
};

// ---------- AI tab ----------

const AiDeckTab = ({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) => {
  const [topic, setTopic] = useState('');
  const [level, setLevel] = useState<'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'>('B2');
  const [count, setCount] = useState<10 | 20 | 30>(10);
  const [language, setLanguage] = useState<'en' | 'bn' | 'bn-en'>('en');
  const [difficulty, setDifficulty] = useState<'easy' | 'hard'>('easy');
  const [sourceText, setSourceText] = useState('');
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState<(FlashDeckGenResponseT & { partial?: boolean; requested?: number }) | null>(null);
  const [cards, setCards] = useState<DraftCard[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState<number | null>(null);

  const canGenerate =
    topic.trim().length > 0 && !generating && (sourceText.length === 0 || sourceText.length >= 80);

  const doGenerate = async () => {
    setError(null);
    setGenerating(true);
    setPreview(null);
    try {
      const req: FlashDeckGenRequestT = {
        topic: topic.trim(),
        level,
        n: count,
        language,
        difficulty,
        ...(sourceText.trim().length >= 80 ? { sourceText: sourceText.trim() } : {}),
      };
      const res = await generateDeck(req);
      setPreview(res);
      setCards(res.cards);
    } catch (e) {
      // Map server-classified failures to friendly copy + leave the error
      // visible so the user can decide to Retry.
      const code = (e as { code?: string }).code;
      const friendly =
        code === 'UPSTREAM_UNAVAILABLE' || code === 'AI_INVALID'
          ? 'AI is busy right now — we couldn\'t generate flashcards. Please try again in a moment.'
          : code === 'UNAUTHORIZED'
            ? 'Please sign in again to continue.'
            : code === 'RATE_LIMITED'
              ? 'You\'re generating decks quickly. Wait a moment, then retry.'
              : e instanceof Error
                ? e.message
                : 'Generate failed';
      setError(friendly);
    } finally {
      setGenerating(false);
    }
  };

  const updateCard = (i: number, patch: Partial<DraftCard>) => {
    setCards((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  };
  const removeCard = (i: number) => setCards((prev) => prev.filter((_, idx) => idx !== i));

  const regenerateOne = async (i: number) => {
    if (regenerating !== null) return;
    setRegenerating(i);
    setError(null);
    try {
      // Generate a fresh batch and pick the first non-dup card.
      const others = cards.filter((_, idx) => idx !== i);
      const req: FlashDeckGenRequestT = {
        topic: topic.trim(),
        level,
        n: 3,
        difficulty,
        language,
        ...(sourceText.trim().length >= 80 ? { sourceText: sourceText.trim() } : {}),
      };
      const res = await generateDeck(req);
      const existingFronts = new Set(others.map((c) => c.front.trim().toLowerCase()));
      existingFronts.add(cards[i]!.front.trim().toLowerCase());
      const fresh = res.cards.find((c) => !existingFronts.has(c.front.trim().toLowerCase()));
      if (fresh) updateCard(i, fresh);
      else setError('Could not find a new card — try again.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Regenerate failed');
    } finally {
      setRegenerating(null);
    }
  };

  const addOne = async () => {
    setError(null);
    try {
      const req: FlashDeckGenRequestT = {
        topic: topic.trim(),
        level,
        n: 3,
        difficulty,
        language,
        ...(sourceText.trim().length >= 80 ? { sourceText: sourceText.trim() } : {}),
      };
      const res = await generateDeck(req);
      const existing = new Set(cards.map((c) => c.front.trim().toLowerCase()));
      const fresh = res.cards.find((c) => !existing.has(c.front.trim().toLowerCase()));
      if (!fresh) {
        setError('Could not find a new card — try again.');
        return;
      }
      setCards((prev) => [...prev, fresh]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Add card failed');
    }
  };

  const canSave = cards.filter((c) => c.front.trim() && c.back.trim()).length >= 1 && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const clean = cards
        .filter((c) => c.front.trim() && c.back.trim())
        .map((c) => ({
          front: c.front.trim(),
          back: c.back.trim(),
          hint: c.hint?.trim() || undefined,
          explanation: c.explanation?.trim() || undefined,
          tags: c.tags ?? [],
          difficulty: c.difficulty ?? 'easy',
        }));
      const title = preview?.title?.trim() || topic.trim();
      const aiMeta = preview
        ? { provider: preview.provider, model: preview.model, generatedAt: Date.now() }
        : undefined;
      await saveDeck({
        title,
        topic: topic.trim(),
        cards: clean,
        source: 'ai',
        ...(aiMeta ? { aiMeta } : {}),
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <GlassCard className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Topic">
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Binary search trees, B1 grammar, photosynthesis"
              maxLength={80}
            />
          </Field>
          <Field label="Level">
            <Select value={level} onChange={(e) => setLevel(e.target.value as typeof level)}>
              <option value="A1">A1 — beginner</option>
              <option value="A2">A2 — elementary</option>
              <option value="B1">B1 — intermediate</option>
              <option value="B2">B2 — upper-int</option>
              <option value="C1">C1 — advanced</option>
              <option value="C2">C2 — mastery</option>
            </Select>
          </Field>
          <Field label="Card count">
            <Select value={count} onChange={(e) => setCount(Number(e.target.value) as 10 | 20 | 30)}>
              <option value="10">10 cards</option>
              <option value="20">20 cards</option>
              <option value="30">30 cards</option>
            </Select>
          </Field>
          <Field label="Language">
            <Select value={language} onChange={(e) => setLanguage(e.target.value as typeof language)}>
              <option value="en">English</option>
              <option value="bn">Bengali</option>
              <option value="bn-en">Bilingual (en → bn)</option>
            </Select>
          </Field>
          <Field label="Difficulty">
            <Select value={difficulty} onChange={(e) => setDifficulty(e.target.value as 'easy' | 'hard')}>
              <option value="easy">Easy</option>
              <option value="hard">Hard</option>
            </Select>
          </Field>
        </div>

        <Field
          label="From my text (optional)"
          hint={
            sourceText.length === 0 || sourceText.length >= 80
              ? 'Cards come only from what you write here. Min 80 chars.'
              : `Need ${80 - sourceText.length} more characters.`
          }
        >
          <Textarea
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value.slice(0, 3000))}
            placeholder="Paste notes, a chapter, an article…"
            rows={4}
            maxLength={3000}
          />
          <div className="mt-1 text-right text-[10px] uppercase tracking-wide text-muted">
            {sourceText.length}/3000
          </div>
        </Field>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          {preview ? (
            <ModelChip modelId={preview.model} cached={preview.cached} />
          ) : (
            <span className="text-xs text-muted">
              Generate a draft, edit cards, then save.
            </span>
          )}
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void doGenerate()} disabled={!canGenerate}>
              {generating ? 'Generating…' : preview ? 'Regenerate all' : 'Generate'}
            </Button>
          </div>
        </div>

        {generating && (
          <div className="pt-2" aria-live="polite">
            <LoadingState>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </LoadingState>
          </div>
        )}
        {error && !generating && (
          <ErrorState
            detail={error}
            onRetry={() => void doGenerate()}
            retryLabel="Try again"
          />
        )}
      </GlassCard>

      {cards.length > 0 && (
        <section className="space-y-3">
          {preview?.partial && (
            <div
              role="status"
              aria-live="polite"
              className="glass rounded-glass border border-warn/40 p-3 text-sm text-warn"
            >
              We got {cards.length} of {preview.requested ?? cards.length} cards —
              some batches didn't make it. Save what you have, then add more.
            </div>
          )}
          <header className="flex items-center justify-between">
            <h2 className="font-display text-sm uppercase tracking-display text-muted">
              Preview · {cards.length} cards
            </h2>
            <Button size="sm" variant="secondary" onClick={() => void addOne()}>
              <span aria-hidden="true" className="mr-1">＋</span>
              Add one more
            </Button>
          </header>

          <ul className="space-y-3">
            {cards.map((c, i) => (
              <li key={i}>
                <PreviewCard
                  card={c}
                  busy={regenerating === i}
                  onChange={(patch) => updateCard(i, patch)}
                  onRegenerate={() => void regenerateOne(i)}
                  onRemove={() => removeCard(i)}
                />
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <Button size="sm" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void save()} disabled={!canSave}>
              {saving
                ? 'Saving…'
                : `Save deck (${cards.filter((c) => c.front.trim() && c.back.trim()).length})`}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
};

const PreviewCard = ({
  card,
  busy,
  onChange,
  onRegenerate,
  onRemove,
}: {
  card: DraftCard;
  busy: boolean;
  onChange: (patch: Partial<DraftCard>) => void;
  onRegenerate: () => void;
  onRemove: () => void;
}) => (
  <GlassCard className="space-y-2">
    <div className="flex items-center justify-between">
      <span className="text-xs uppercase tracking-wide text-muted">Card</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRegenerate}
          disabled={busy}
          className="text-xs text-accent underline-offset-2 hover:underline disabled:opacity-50"
        >
          {busy ? 'Regenerating…' : 'Regenerate'}
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-muted underline-offset-2 hover:text-danger hover:underline"
          aria-label="Remove card"
        >
          Remove
        </button>
      </div>
    </div>
    <Field label="Front">
      <Input
        value={card.front}
        onChange={(e) => onChange({ front: e.target.value })}
        maxLength={200}
        placeholder="Question / prompt"
      />
    </Field>
    <Field label="Back">
      <Textarea
        value={card.back}
        onChange={(e) => onChange({ back: e.target.value })}
        maxLength={400}
        rows={2}
        placeholder="Answer / explanation"
      />
    </Field>
    <details className="text-xs">
      <summary className="cursor-pointer text-muted hover:text-fg">
        Hint, explanation, tags (optional)
      </summary>
      <div className="mt-2 space-y-2">
        <Field label="Hint">
          <Input
            value={card.hint ?? ''}
            onChange={(e) => onChange({ hint: e.target.value })}
            maxLength={200}
            placeholder="A nudge without revealing the answer"
          />
        </Field>
        <Field label="Explanation">
          <Textarea
            value={card.explanation ?? ''}
            onChange={(e) => onChange({ explanation: e.target.value })}
            maxLength={600}
            rows={2}
            placeholder="One sentence plain-English explanation"
          />
        </Field>
        <Field label="Tags (comma-separated)">
          <Input
            value={(card.tags ?? []).join(', ')}
            onChange={(e) =>
              onChange({
                tags: e.target.value
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
            placeholder="e.g. grammar, present-perfect"
          />
        </Field>
      </div>
    </details>
  </GlassCard>
);

const SkeletonRow = () => (
  <div className="space-y-2">
    <div className="h-3 w-3/4 rounded-glass bg-glass-bg" />
    <div className="h-3 w-1/2 rounded-glass bg-glass-bg" />
  </div>
);

// ---------- Manual tab ----------

const ManualDeckTab = ({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) => {
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [cards, setCards] = useState<DraftCard[]>([
    emptyDraftCard(),
    emptyDraftCard(),
    emptyDraftCard(),
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

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
      .filter((c) => c.front.trim() && c.back.trim())
      .map((c) => ({
        front: c.front.trim(),
        back: c.back.trim(),
        hint: c.hint?.trim() || undefined,
        explanation: c.explanation?.trim() || undefined,
        tags: c.tags ?? [],
        difficulty: c.difficulty ?? 'easy',
      }));
    try {
      await saveDeck({
        title: title.trim(),
        topic: topic.trim(),
        cards: clean,
        source: 'manual',
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
      setSubmitting(false);
    }
  };

  const importFile = async (file: File) => {
    setImporting(true);
    setError(null);
    try {
      const data = await file.text();
      const format: 'json' | 'csv' = file.name.toLowerCase().endsWith('.csv') ? 'csv' : 'json';
      const res = await importDeck({ format, data, source: 'manual' });
      console.log(`Imported deck ${res.deckId} (${res.createdCount} cards)`);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <GlassCard className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-sm uppercase tracking-display text-muted">
            Manual deck
          </h2>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-pill border border-glass-border bg-glass-bg px-3 py-1.5 text-xs text-muted hover:text-fg">
            <input
              type="file"
              accept=".json,.csv,application/json,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importFile(f);
              }}
            />
            {importing ? 'Importing…' : 'Import JSON or CSV'}
          </label>
        </div>

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
        <header className="flex items-center justify-between">
          <h2 className="font-display text-sm uppercase tracking-display text-muted">
            Cards
          </h2>
          <Button size="sm" variant="secondary" onClick={addCard}>
            <span aria-hidden="true" className="mr-1">＋</span>
            Add card
          </Button>
        </header>

        <ul className="space-y-3">
          {cards.map((c, i) => (
            <li key={i}>
              <PreviewCard
                card={c}
                busy={false}
                onChange={(patch) => updateCard(i, patch)}
                onRegenerate={() => {
                  /* no-op on manual tab */
                }}
                onRemove={() => removeCard(i)}
              />
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={!canSubmit || submitting}>
          {submitting ? 'Creating…' : 'Create deck'}
        </Button>
      </div>

      {error && <ErrorState detail={error} />}
    </div>
  );
};

const Field = ({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) => (
  <label className="block space-y-1.5">
    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</span>
    {children}
    {hint && <span className="block text-[11px] text-muted">{hint}</span>}
  </label>
);

// =====================================================================
// Review view
// =====================================================================

const ReviewView = ({
  deck,
  cards: initialCards,
  xp: initialXp,
  onExit,
}: {
  deck: FlashDeckT;
  cards: FlashCardT[];
  xp: number;
  onExit: (finalXp: number) => void;
}) => {
  const [cards, setCards] = useState<FlashCardT[]>(initialCards);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sessionXp, setSessionXp] = useState(0);
  const [graded, setGraded] = useState<Array<{ cardId: string; grade: 0 | 1 | 2 | 3 }>>([]);
  const [hintShown, setHintShown] = useState<{ cardId: string; text: string } | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [explainOpen, setExplainOpen] = useState(false);
  const [explainText, setExplainText] = useState<string | null>(null);
  const [explainModel, setExplainModel] = useState<string | null>(null);
  const [explainCached, setExplainCached] = useState(false);
  const [explainDepth, setExplainDepth] = useState<ExplainDepth>('normal');
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);
  const lastTapRef = useRef<number>(0);

  const current = cards[idx];
  const done = idx >= cards.length;

  const grade = async (g: 0 | 1 | 2 | 3) => {
    if (!current || submitting) return;
    setSubmitting(true);
    try {
      const res = await reviewCard(current.id, g);
      setSessionXp((s) => s + (res.xpDelta ?? 0));
      setGraded((g_) => [...g_, { cardId: current.id, grade: g }]);
      setIdx((i) => i + 1);
      setFlipped(false);
      setHintShown(null);
      setExplainOpen(false);
      setExplainText(null);
      setExplainError(null);
    } catch (e) {
      console.error('flashcard review failed', e);
    } finally {
      setSubmitting(false);
    }
  };

  const showHint = async () => {
    if (!current) return;
    if (hintShown?.cardId === current.id) return; // already shown
    setHintLoading(true);
    try {
      const res = await getHint(current.id);
      setHintShown({ cardId: current.id, text: res.hint });
      setCards((prev) => prev.map((c) => (c.id === current.id ? { ...c, hint: res.hint } : c)));
    } catch (e) {
      console.error('hint failed', e);
    } finally {
      setHintLoading(false);
    }
  };

  const openExplain = async (depth: ExplainDepth = 'normal') => {
    if (!current) return;
    setExplainOpen(true);
    setExplainDepth(depth);
    setExplainLoading(true);
    setExplainError(null);
    setExplainText(null);
    setExplainModel(null);
    setExplainCached(false);
    try {
      const res = await explainCard(current.id, { depth });
      setExplainText(res.explanation);
      setExplainModel(res.model);
      setExplainCached(res.cached);
    } catch (e) {
      setExplainError(e instanceof Error ? e.message : 'Could not fetch explanation');
    } finally {
      setExplainLoading(false);
    }
  };

  useEffect(() => {
    if (done) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (['1', '2', '3', '4'].includes(e.key)) {
        const g = (Number(e.key) - 1) as 0 | 1 | 2 | 3;
        void grade(g);
      } else if (e.key.toLowerCase() === 'h') {
        void showHint();
      } else if (e.key.toLowerCase() === 'e') {
        void openExplain('normal');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [idx, done, current?.id]);

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
              onClick={async () => {
                try {
                  const fresh = await listCards(deck.id);
                  setCards(fresh);
                  setIdx(0);
                  setFlipped(false);
                  setGraded([]);
                  setSessionXp(0);
                  setHintShown(null);
                  setExplainOpen(false);
                  setExplainText(null);
                } catch (e) {
                  console.error('reload failed', e);
                }
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
    const now = Date.now();
    if (now - lastTapRef.current < 250) return;
    lastTapRef.current = now;
    setFlipped((f) => !f);
  };

  if (!current) {
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
          aria-label={`Progress ${Math.round((idx / cards.length) * 100)} percent`}
        >
          {Math.round((idx / cards.length) * 100)}%
        </span>
      </div>

      <button
        type="button"
        onClick={onCardTap}
        className="glass w-full min-h-[200px] rounded-glass p-6 text-left focus:outline-none focus:ring-2 focus:ring-accent"
        aria-label={flipped ? 'Show front' : 'Show back'}
      >
        <div className="mb-2 text-[10px] uppercase tracking-wide text-muted">
          {flipped ? 'Back' : 'Front'}
        </div>
        {flipped ? (
          <Markdown>{current.back}</Markdown>
        ) : (
          <div className="whitespace-pre-wrap font-display text-2xl leading-snug text-fg sm:text-3xl">
            {current.front}
          </div>
        )}

        {flipped && (current.hint || hintShown) && (
          <div className="mt-4 rounded-card border border-glass-border bg-glass-bg/40 px-3 py-2 text-xs text-muted">
            <span className="font-semibold uppercase tracking-wide">Hint</span>
            <div className="mt-1 text-fg">{current.hint ?? hintShown?.text}</div>
          </div>
        )}

        {flipped && current.explanation && (
          <div className="mt-3 rounded-card border border-glass-border bg-glass-bg/40 px-3 py-2 text-xs text-muted">
            <span className="font-semibold uppercase tracking-wide">Note</span>
            <div className="mt-1 text-fg">{current.explanation}</div>
          </div>
        )}

        <div className="mt-4 text-[11px] uppercase tracking-wide text-muted">
          Tap to flip · Space to flip · 1-4 to grade · H for hint · E for AI explain
        </div>
      </button>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void showHint()}
          disabled={hintLoading || hintShown?.cardId === current.id || flipped}
        >
          {hintLoading
            ? 'Loading hint…'
            : hintShown?.cardId === current.id || current.hint
              ? 'Hint shown'
              : 'Hint (H)'}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => void openExplain('normal')} disabled={!flipped}>
          AI Explain (E)
        </Button>
      </div>

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
              onClick={() => void grade(g)}
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

      <Modal
        open={explainOpen}
        onClose={() => setExplainOpen(false)}
        title="AI Explain"
        headerRight={<ModelChip modelId={explainModel ?? undefined} cached={explainCached} />}
        variant="wide"
      >
        <div className="flex flex-wrap gap-2 pb-3">
          {(['normal', 'simpler', 'deeper'] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => void openExplain(d)}
              disabled={explainLoading}
              className={`rounded-pill px-3 py-1 text-xs ${
                explainDepth === d
                  ? 'bg-primary text-primary-fg'
                  : 'border border-glass-border text-muted hover:text-fg'
              }`}
            >
              {d === 'normal' ? 'Normal' : d === 'simpler' ? 'Simpler' : 'Go deeper'}
            </button>
          ))}
        </div>
        {explainLoading ? (
          <LoadingState>
            <SkeletonRow />
            <SkeletonRow />
          </LoadingState>
        ) : explainError ? (
          <ErrorState detail={explainError}>
            <button
              type="button"
              onClick={() => void openExplain(explainDepth)}
              className="mt-2 text-sm text-accent underline-offset-2 hover:underline"
            >
              Retry
            </button>
          </ErrorState>
        ) : (
          <Markdown>{explainText ?? ''}</Markdown>
        )}
      </Modal>
    </main>
  );
};

// Suppress unused-import warnings for helpers that may be wired up later.
void addMoreCards;