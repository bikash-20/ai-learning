'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { GlassCard } from '@/components/ui/GlassCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';

type FetchResult<T> = { items: T[] };

export type FilteredListPageProps<T> = {
  title: string;
  subtitle: string;
  endpoint: string; // e.g. '/api/vocab'
  filterParam?: string; // 'level'
  filterValue: string;
  onFilterChange: (v: string) => void;
  filterControl?: ReactNode; // right slot
  emptyTitle: string;
  emptyHint: string;
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
};

export function FilteredListPage<T>({
  title,
  subtitle,
  endpoint,
  filterParam = 'level',
  filterValue,
  filterControl,
  emptyTitle,
  emptyHint,
  getKey,
  renderItem,
}: FilteredListPageProps<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';
    const qs = filterValue ? `?${filterParam}=${encodeURIComponent(filterValue)}` : '';
    setLoading(true);
    setErr(null);
    fetch(`${base}${endpoint}${qs}`, { credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`API ${r.status}`);
        return r.json() as Promise<FetchResult<T>>;
      })
      .then((j) => setItems(j.items))
      .catch((e) => setErr(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [endpoint, filterParam, filterValue]);

  return (
    <main>
      <PageHeader title={title} subtitle={subtitle} right={filterControl} />

      {err && <ErrorState detail={`${err}. Check that NEXT_PUBLIC_API_BASE_URL points to the live Worker.`} />}

      {!err && loading && <LoadingState />}

      {!err && !loading && items.length === 0 && (
        <EmptyState title={emptyTitle} hint={emptyHint} />
      )}

      <div className="space-y-3">
        {items.map((item) => (
          <GlassCard key={getKey(item)}>{renderItem(item)}</GlassCard>
        ))}
      </div>
    </main>
  );
}