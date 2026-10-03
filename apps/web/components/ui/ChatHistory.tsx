'use client';

import { useEffect, useState } from 'react';
import { Button } from './Button';
import { XIcon, ArrowRightIcon, HistoryIcon, PlusIcon } from './icons';

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

const formatDate = (raw: string | number): string => {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const modeLabel: Record<ConversationSummary['mode'], string> = {
  general: 'General',
  code: 'Code',
  math: 'Math',
  theory: 'Theory',
  explain: 'Explain',
};

export const ChatHistory = ({
  selectedId,
  onSelect,
  onNew,
  refreshKey,
  mobileOpen,
  onCloseMobile,
  collapsed,
  onToggleCollapsed,
}: ChatHistoryProps) => {
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [error, setError] = useState<string | null>(null);

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

  const startRename = (c: ConversationSummary) => {
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
  const showRail = !!collapsed && !mobileOpen;

  return (
    <aside
      aria-label="Chat history"
      className={`chat-sidebar-shell glass flex h-full flex-col gap-3 rounded-glass p-3 ${mobileOpen ? 'fixed inset-0 z-40 w-full' : 'hidden sm:flex'} ${showRail ? 'sm:w-16 lg:w-16' : 'w-full sm:w-72 lg:w-80'}`}
    >
      <div className="flex items-center justify-between gap-2">
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
            <h2 className="font-display text-sm uppercase tracking-display text-fg">History</h2>
            <div className="flex items-center gap-1">
              {onToggleCollapsed && (
                <button
                  type="button"
                  onClick={onToggleCollapsed}
                  aria-label="Collapse history"
                  className="hidden sm:inline-flex h-8 w-8 items-center justify-center rounded-full border border-glass-border bg-glass-bg text-muted hover:text-fg"
                  title="Collapse history"
                >
                  <HistoryIcon size={14} />
                </button>
              )}
              <Button type="button" size="sm" onClick={onNew}>
                New chat
              </Button>
              {mobileOpen && onCloseMobile && (
                <button
                  type="button"
                  onClick={onCloseMobile}
                  aria-label="Close history"
                  className="rounded-full p-1 text-muted hover:text-fg"
                >
                  <XIcon size={18} />
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {!showRail && (
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
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

        {items.map((c) => {
          const isSelected = c.id === selectedId;
          const isRenaming = renamingId === c.id;
          return (
            <div
              key={c.id}
              className={`group relative rounded-card border px-2.5 py-2 transition-colors ${
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
                    <div className="flex items-center gap-2">
                      <span className="rounded-pill border border-glass-border bg-glass-bg px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted">
                        {modeLabel[c.mode]}
                      </span>
                      <span className="ml-auto text-[10px] text-muted">{formatDate(c.updatedAt)}</span>
                    </div>
                    <div className="mt-0.5 truncate text-sm text-fg">{c.title}</div>
                  </div>
                  {isSelected && (
                    <ArrowRightIcon size={14} className="mt-1 shrink-0 text-accent" decorative />
                  )}
                </button>
              )}

              {!isRenaming && (
                <div className="absolute right-1.5 top-1.5 hidden gap-1 group-hover:flex">
                  <button
                    type="button"
                    onClick={() => startRename(c)}
                    aria-label="Rename conversation"
                    className="rounded-full border border-glass-border bg-glass-bg px-1.5 py-0.5 text-[10px] text-muted hover:text-fg"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteConversation(c.id)}
                    aria-label="Delete conversation"
                    className="rounded-full border border-glass-border bg-glass-bg px-1.5 py-0.5 text-[10px] text-danger hover:border-danger"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          );
        })}
        </div>
      )}
    </aside>
  );
};