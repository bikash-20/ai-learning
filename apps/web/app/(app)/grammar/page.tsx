'use client';

import { useState } from 'react';
import type { Grammar } from '@quantara/shared';
import { CefrBadge } from '@/components/CefrBadge';
import { LevelFilter } from '@/components/ui/LevelFilter';
import { FilteredListPage } from '@/components/ui/FilteredListPage';

export default function GrammarPage() {
  const [level, setLevel] = useState('');
  return (
    <FilteredListPage<Grammar>
      title="Grammar"
      subtitle="Curated explanations with examples."
      endpoint="/api/grammar"
      filterValue={level}
      onFilterChange={setLevel}
      filterControl={<LevelFilter value={level} onChange={setLevel} />}
      emptyTitle="No grammar topics yet"
      emptyHint="Try clearing the filter or check back soon."
      getKey={(g) => g.topic}
      renderItem={(g) => (
        <>
          <div className="flex items-center justify-between gap-3">
            <div className="font-display text-2xl tracking-display text-fg">{g.topic}</div>
            <CefrBadge level={g.level} />
          </div>
          <p className="mt-2 text-sm text-fg">{g.explanation}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
            {g.examples.map((e, i) => (<li key={i}>{e}</li>))}
          </ul>
        </>
      )}
    />
  );
}