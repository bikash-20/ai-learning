'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { GlassCard } from '@/components/ui/GlassCard';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { useRole } from '@/lib/useRole';

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

type Stats = {
  users: number;
  admins: number;
  quizzes: number;
  attempts: number;
  finished: number;
  items: number;
  mcqBank: number;
  aiCache: number;
  decks: number;
  cards: number;
};

type AdminUser = {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  xp: number;
  createdAt: number;
};

type CacheRow = {
  cacheKey: string;
  kind: 'text' | 'json' | 'explanation';
  expiresAt: number;
  createdAt: number;
  payloadBytes: number;
};

export default function AdminPage() {
  const role = useRole();
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [cache, setCache] = useState<CacheRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setError(null);
    try {
      const [s, u, c] = await Promise.all([
        fetch(`${API}/api/admin/stats`, { credentials: 'include' }),
        fetch(`${API}/api/admin/users?limit=50`, { credentials: 'include' }),
        fetch(`${API}/api/admin/ai-cache?limit=50`, { credentials: 'include' }),
      ]);
      if (!s.ok || !u.ok || !c.ok) {
        throw new Error(`stats ${s.status} / users ${u.status} / cache ${c.status}`);
      }
      setStats((await s.json()) as Stats);
      setUsers((await u.json()) as AdminUser[]);
      setCache((await c.json()) as CacheRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load admin data');
    }
  }, []);

  useEffect(() => {
    if (role === 'admin') void fetchAll();
  }, [role, fetchAll]);

  const patchRole = async (id: string, role: 'admin' | 'user') => {
    try {
      const res = await fetch(`${API}/api/admin/users/${encodeURIComponent(id)}/role`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error(`role ${res.status}`);
      await fetchAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update role');
    }
  };

  if (role === 'loading') {
    return (
      <main className="space-y-4">
        <PageHeader title="Admin" subtitle="Server-side, role-gated surface." />
        <LoadingState />
      </main>
    );
  }
  if (role !== 'admin') {
    return (
      <main className="space-y-4">
        <PageHeader title="Admin" subtitle="Restricted." />
        <ErrorState
          title="Admin only"
          detail="This page is gated by user.role === 'admin'. Sign in as a promoted account to continue."
        />
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <PageHeader
        title="Admin"
        subtitle="Server-verified counts + role management."
        right={
          <button
            type="button"
            onClick={fetchAll}
            className="rounded-pill border border-glass-border bg-glass-bg px-3 py-1.5 text-xs font-semibold text-fg hover:border-accent"
          >
            Refresh
          </button>
        }
      />

      {error && <ErrorState title="Admin request failed" detail={error} />}

      {/* === STATS GRID === */}
      <section aria-label="Stats">
        <h2 className="mb-2 font-display text-sm uppercase tracking-display text-muted">
          Counts
        </h2>
        {stats ? <StatsGrid stats={stats} /> : <LoadingState />}
      </section>

      {/* === USER LIST === */}
      <section aria-label="Users" className="space-y-2">
        <h2 className="font-display text-sm uppercase tracking-display text-muted">
          Users
        </h2>
        {users ? <UserTable users={users} onPatch={patchRole} /> : <LoadingState />}
      </section>

      {/* === AI CACHE === */}
      <section aria-label="AI cache" className="space-y-2">
        <h2 className="font-display text-sm uppercase tracking-display text-muted">
          Recent AI cache
        </h2>
        {cache ? <CacheTable rows={cache} /> : <LoadingState />}
      </section>
    </main>
  );
}

const StatsGrid = ({ stats }: { stats: Stats }) => (
  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
    {(
      [
        { label: 'Users', value: stats.users, accent: 'primary' },
        { label: 'Admins', value: stats.admins, accent: 'danger' },
        { label: 'Quizzes', value: stats.quizzes, accent: 'accent' },
        { label: 'Attempts', value: stats.attempts, accent: 'primary' },
        { label: 'Finished', value: stats.finished, accent: 'success' },
        { label: 'Quiz items', value: stats.items, accent: 'accent' },
        { label: 'MCQ bank', value: stats.mcqBank, accent: 'success' },
        { label: 'AI cache', value: stats.aiCache, accent: 'warning' },
        { label: 'Flash decks', value: stats.decks, accent: 'accent' },
        { label: 'Flash cards', value: stats.cards, accent: 'primary' },
      ] as const
    ).map((c) => (
      <GlassCard key={c.label} className="space-y-1">
        <div className="text-[10px] uppercase tracking-wide text-muted">{c.label}</div>
        <div
          className={`font-display text-2xl tracking-display ${
            c.accent === 'danger'
              ? 'text-danger'
              : c.accent === 'success'
                ? 'text-success'
                : c.accent === 'warning'
                  ? 'text-warning'
                  : c.accent === 'primary'
                    ? 'text-primary'
                    : 'text-accent'
          }`}
        >
          {c.value.toLocaleString()}
        </div>
      </GlassCard>
    ))}
  </div>
);

const UserTable = ({
  users,
  onPatch,
}: {
  users: AdminUser[];
  onPatch: (id: string, role: 'admin' | 'user') => void;
}) => (
  <GlassCard className="overflow-x-auto p-0">
    <table className="w-full text-left text-sm">
      <thead className="text-[10px] uppercase tracking-wide text-muted">
        <tr className="border-b border-glass-border">
          <th className="px-4 py-2.5">Email</th>
          <th className="px-4 py-2.5">Name</th>
          <th className="px-4 py-2.5">Role</th>
          <th className="px-4 py-2.5">XP</th>
          <th className="px-4 py-2.5">Joined</th>
          <th className="px-4 py-2.5 text-right">Actions</th>
        </tr>
      </thead>
      <tbody>
        {users.map((u) => (
          <tr key={u.id} className="border-b border-glass-border/40 last:border-0">
            <td className="px-4 py-2 font-mono text-xs">{u.email}</td>
            <td className="px-4 py-2">{u.name}</td>
            <td className="px-4 py-2">
              <span
                className={`rounded-pill border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  u.role === 'admin'
                    ? 'border-danger/30 bg-danger/10 text-danger'
                    : 'border-glass-border bg-glass-bg text-muted'
                }`}
              >
                {u.role}
              </span>
            </td>
            <td className="px-4 py-2 tabular-nums">{u.xp.toLocaleString()}</td>
            <td className="px-4 py-2 text-muted">
              {new Date(u.createdAt * 1000).toLocaleDateString()}
            </td>
            <td className="px-4 py-2 text-right">
              <button
                type="button"
                onClick={() => onPatch(u.id, u.role === 'admin' ? 'user' : 'admin')}
                className="rounded-pill border border-glass-border bg-glass-bg px-2.5 py-1 text-[11px] font-semibold text-fg hover:border-accent"
              >
                {u.role === 'admin' ? 'Demote' : 'Promote'}
              </button>
            </td>
          </tr>
        ))}
        {users.length === 0 && (
          <tr>
            <td colSpan={6} className="px-4 py-4 text-center text-muted">
              No users yet.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  </GlassCard>
);

const CacheTable = ({ rows }: { rows: CacheRow[] }) => (
  <GlassCard className="overflow-x-auto p-0">
    <table className="w-full text-left text-sm">
      <thead className="text-[10px] uppercase tracking-wide text-muted">
        <tr className="border-b border-glass-border">
          <th className="px-4 py-2.5">Cache key</th>
          <th className="px-4 py-2.5">Kind</th>
          <th className="px-4 py-2.5">Bytes</th>
          <th className="px-4 py-2.5">Expires</th>
          <th className="px-4 py-2.5">Created</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.cacheKey} className="border-b border-glass-border/40 last:border-0">
            <td className="max-w-[16ch] truncate px-4 py-2 font-mono text-[11px]">{r.cacheKey}</td>
            <td className="px-4 py-2">
              <span className="rounded-pill border border-glass-border bg-glass-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                {r.kind}
              </span>
            </td>
            <td className="px-4 py-2 tabular-nums">{r.payloadBytes.toLocaleString()}</td>
            <td className="px-4 py-2 tabular-nums">{new Date(r.expiresAt * 1000).toLocaleString()}</td>
            <td className="px-4 py-2 text-muted">{new Date(r.createdAt * 1000).toLocaleString()}</td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr>
            <td colSpan={5} className="px-4 py-4 text-center text-muted">
              Cache is empty.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  </GlassCard>
);