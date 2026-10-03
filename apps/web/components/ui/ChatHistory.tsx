'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from './Button';
import {
  XIcon,
  HistoryIcon,
  PlusIcon,
  SearchIcon,
  MoreIcon,
  PencilIcon,
  TrashIcon,
} from './icons';

/**
 * Conversation row used in the sidebar list. We keep the metadata lean:
 * id, title, mode, updatedAt. Mode gets a small badge so the user can
 * distinguish Code / Math sessions at a glance.
 */
export type ConversationSummary = {
  id: string;
  title: string;
  mode: 'general' | 'code' | 'math' | 'theory' | 'explain';
  createdAt: string | number;
  updatedAt: string | number;
};

export type ChatHistoryProps = {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  /** Tell the list to re-fetch (e.g. after the user creates / deletes one). */
  refreshKey: number;
  /** Mobile: when true, the sidebar overlays the page instead of sitting inline. */
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  /** Desktop / tablet (≥ sm): when true, render a slim 64px icon rail
   *  instead of the full panel. Toggling re-opens to the full panel. */
  collapsed?: boolean;
  /** Called when the user clicks the rail's toggle / new-chat buttons. */
  onToggleCollapsed?: () => void;
};

const modeLabel: Record<ConversationSummary['mode'], string> = {
  general: 'General',
  code: 'Code',
  math: 'Math',
  theory: 'Theory',
  explain: 'Explain',
};

/** Friendly group label for a date, used to bucket conversations. */
const groupFor = (raw: string | number): string => {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return 'Older';
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const dayDiff = Math.floor(
    (startOf(now).getTime() - startOf(d).getTime()) / (24 * 60 * 60 * 1000),
  );
  if (dayDiff <= 0) return 'Today';
  if (dayDiff === 1) return 'Yesterday';
  if (dayDiff < 7) return 'Previous 7 days';
  if (dayDiff < 30) return 'Previous 30 days';
  return 'Older';
};

/** Stable ordering for the group buckets so headers render top→bottom. */
const groupOrder = ['Today', 'Yesterday', 'Previous 7 days', 'Previous 30 days', 'Older'];

/** Compress a title for the rail-less layout. Strips leading emoji + whitespace. */
const previewText = (raw: string): string => {
  const trimmed = raw.replace(/^[\s\u200B]+/, '');
  return trimmed.length > 64 ? `${trimmed.slice(0, 61)}…` : trimmed;
};

export const ChatHistory = ({
  selectedId,
  onSelect,
  onNew,
  refreshKey,
  mobileOpen,
  onCloseMobile,
  collapsed: collapsedProp,
  onToggleCollapsed,
}: ChatHistoryProps) => {
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/chat/conversations`, {
      credentials: 'include',
      signal: ctrl.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error(`API ${r.status}`);
        return r.json() as Promise<{ conversations: ConversationSummary[] }>;
      })
      .then((j) => {
        if (!cancelled) setItems(j.conversations ?? []);
      })
      .catch((e) => {
        if (cancelled || (e instanceof Error && e.name === 'AbortError')) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; ctrl.abort(); };
  }, [refreshKey]);

  // Click-outside closes any open row menu.
  useEffect(() => {
    if (!openMenuId) return undefined;
    const onDown = (e: MouseEvent) => {
      if (!menuRootRef.current) return;
      if (!menuRootRef.current.contains(e.target as Node)) setOpenMenuId(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenuId(null);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [openMenuId]);

  const startRename = (c: ConversationSummary) => {
    setOpenMenuId(null);
    setRenamingId(c.id);
    setRenameValue(c.title);
  };

  const commitRename = async (id: string) => {
    const next = renameValue.trim();
    if (!next) { setRenamingId(null); return; }
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/chat/conversations/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: next }),
      });
      setItems((cur) => cur.map((c) => (c.id === id ? { ...c, title: next } : c)));
    } catch {
      /* swallow — user can retry */
    } finally {
      setRenamingId(null);
    }
  };

  const deleteConversation = async (id: string) => {
    setOpenMenuId(null);
    if (typeof window !== 'undefined' && !window.confirm('Delete this conversation?')) return;
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/chat/conversations/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      setItems((cur) => cur.filter((c) => c.id !== id));
      if (selectedId === id) {
        // Tell the parent to start a fresh conversation.
        onNew();
      }
    } catch {
      /* swallow */
    }
  };

  // The collapsed (rail) variant only applies on ≥ sm — on phones the
  // sidebar is a slide-in drawer, not an inline rail.
  const showRail = !!collapsedProp && !mobileOpen;

  // Filter + group the conversation list. Search is case-insensitive
  // substring match on title; "Today" group stays sticky on top.
  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? items.filter((c) => (c.title || '').toLowerCase().includes(q))
      : items;
    const buckets = new Map<string, ConversationSummary[]>();
    for (const c of filtered) {
      const g = groupFor(c.updatedAt);
      const arr = buckets.get(g);
      if (arr) arr.push(c);
      else buckets.set(g, [c]);
    }
    return groupOrder
      .filter((g) => buckets.has(g))
      .map((g) => ({ label: g, items: buckets.get(g) ?? [] }));
  }, [items, query]);

  return (
    <aside
      aria-label="Chat history"
      className={`chat-sidebar-shell glass flex h-full flex-col gap-3 overflow-hidden p-3 ${mobileOpen ? 'fixed inset-0 z-40 w-full' : 'hidden sm:flex'} ${showRail ? 'w-full sm:w-16 sm:flex-col sm:items-stretch lg:w-16' : 'w-full sm:w-72 sm:flex-col lg:w-80'}`}
    >
      {/* === Header === */}
      <div className="flex shrink-0 items-center justify-between gap-2">
        {showRail ? (
          <>
            <span className="sr-only">Chat history (collapsed)</span>
            <button
              type="button"
              onClick={onToggleCollapsed}
              aria-label="Open history"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-glass-border bg-glass-bg text-fg hover:border-accent"
            >
              <HistoryIcon size={18} />
            </button>
            <button
              type="button"
              onClick={onNew}
              aria-label="New chat"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-glass-border bg-glass-bg text-fg hover:border-accent"
            >
              <PlusIcon size={16} decorative />
            </button>
          </>
        ) : (
          <>
            <h2 className="font-display text-sm uppercase tracking-display text-fg">Chats</h2>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="sm"
                onClick={onNew}
                aria-label="Start new chat"
                className="!min-h-0 !h-9 !px-3"
              >
                <PlusIcon size={14} decorative />
                <span className="ml-1">New chat</span>
              </Button>
              {mobileOpen && onCloseMobile && (
                <button
                  type="button"
                  onClick={onCloseMobile}
                  aria-label="Close history"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-glass-border bg-glass-bg text-muted hover:text-fg"
                >
                  <XIcon size={16} />
                </button>
              )}
              {onToggleCollapsed && !mobileOpen && (
                <button
                  type="button"
                  onClick={onToggleCollapsed}
                  aria-label="Collapse history"
                  title="Collapse history"
                  className="hidden h-9 w-9 items-center justify-center rounded-full border border-glass-border bg-glass-bg text-muted hover:text-fg sm:inline-flex"
                >
                  <HistoryIcon size={14} />
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* === Search (panel only) === */}
      {!showRail && (
        <div className="relative shrink-0">
          <SearchIcon
            size={14}
            decorative
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats…"
            aria-label="Search chats"
            className="h-9 w-full rounded-pill border border-glass-border bg-glass-bg pl-8 pr-3 text-sm text-fg placeholder:text-muted focus-visible:border-accent focus-visible:outline-none"
          />
        </div>
      )}

      {/* === List === */}
      {!showRail && (
        <div ref={menuRootRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-0.5">
          {loading && (
            <div className="space-y-2" role="status" aria-live="polite">
              <div className="h-10 rounded-card bg-glass-bg/60" />
              <div className="h-10 rounded-card bg-glass-bg/40" />
              <div className="h-10 rounded-card bg-glass-bg/20" />
            </div>
          )}

          {!loading && error && (
            <p className="rounded-card border border-danger/30 bg-danger/10 p-2 text-xs text-danger">
              Couldn&apos;t load conversations: {error}
            </p>
          )}

          {!loading && !error && items.length === 0 && (
            <p className="rounded-card border border-glass-border bg-glass-bg/30 p-3 text-xs text-muted">
              No conversations yet. Start one with the button above.
            </p>
          )}

          {!loading && !error && items.length > 0 && grouped.length === 0 && (
            <p className="rounded-card border border-glass-border bg-glass-bg/30 p-3 text-xs text-muted">
              No chats match &ldquo;{query}&rdquo;.
            </p>
          )}

          {grouped.map((bucket) => (
            <section key={bucket.label} aria-label={bucket.label} className="space-y-1">
              <h3 className="px-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted/80">
                {bucket.label}
              </h3>
              {bucket.items.map((c) => {
                const isSelected = c.id === selectedId;
                const isRenaming = renamingId === c.id;
                const menuOpen = openMenuId === c.id;
                return (
                  <div
                    key={c.id}
                    className={`group relative rounded-card border px-2 py-1.5 transition-colors ${
                      isSelected
                        ? 'border-accent bg-accent/10'
                        : 'border-transparent hover:border-glass-border hover:bg-glass-bg/40'
                    }`}
                  >
                    {isRenaming ? (
                      <form
                        onSubmit={(e) => { e.preventDefault(); commitRename(c.id); }}
                        className="flex items-center gap-1"
                      >
                        <input
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={() => commitRename(c.id)}
                          autoFocus
                          maxLength={80}
                          aria-label="Rename conversation"
                          className="min-h-0 w-full rounded-md border border-glass-border bg-glass-bg px-2 py-1 text-sm text-fg focus-visible:outline-none"
                        />
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSelect(c.id)}
                        className="flex w-full items-start gap-2 text-left focus-visible:outline-none"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm text-fg">{previewText(c.title)}</div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted">
                            <span className="rounded-pill border border-glass-border bg-glass-bg px-1.5 py-0.5 font-semibold uppercase tracking-wide">
                              {modeLabel[c.mode]}
                            </span>
                          </div>
                        </div>
                      </button>
                    )}

                    {!isRenaming && (
                      <>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId(menuOpen ? null : c.id);
                          }}
                          aria-label="More actions"
                          aria-haspopup="menu"
                          aria-expanded={menuOpen}
                          className={`absolute right-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full border border-transparent bg-glass-bg text-muted hover:border-glass-border hover:text-fg ${
                            menuOpen ? 'flex' : 'hidden group-hover:flex'
                          }`}
                        >
                          <MoreIcon size={14} />
                        </button>

                        {menuOpen && (
                          <div
                            role="menu"
                            aria-label="Conversation actions"
                            className="absolute right-1.5 top-9 z-10 min-w-[140px] rounded-card border border-glass-border bg-glass-bg p-1 shadow-lg"
                          >
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => startRename(c)}
                              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-fg hover:bg-glass-bg/60"
                            >
                              <PencilIcon size={14} decorative />
                              Rename
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => deleteConversation(c.id)}
                              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-danger hover:bg-danger/10"
                            >
                              <TrashIcon size={14} decorative />
                              Delete
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      )}
    </aside>
  );
};