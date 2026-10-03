'use client';

import { useState } from 'react';
import type { Vocab } from '@ai-learning/shared';
import { CefrBadge } from '@/components/CefrBadge';
import { Badge } from '@/components/ui/Badge';
import { LevelFilter } from '@/components/ui/LevelFilter';
import { FilteredListPage } from '@/components/ui/FilteredListPage';

export default function VocabPage() {
  const [level, setLevel] = useState('');
  return (
    <FilteredListPage<Vocab>
      title="Vocabulary"
      subtitle="Authored word lists with examples and level tags."
      endpoint="/api/vocab"
      filterValue={level}
      onFilterChange={setLevel}
      filterControl={<LevelFilter value={level} onChange={setLevel} />}
      emptyTitle="No vocabulary yet"
      emptyHint="Try clearing the filter or check back soon."
      getKey={(v) => v.word}
      renderItem={(v) => (
        <>
          <div className="flex items-center justify-between gap-3">
            <div className="font-display text-2xl tracking-display text-fg">{v.word}</div>
            <div className="flex items-center gap-2 text-sm text-muted">
              <span>{v.pos}</span>
              <CefrBadge level={v.level} />
            </div>
          </div>
          <div className="mt-2 text-sm text-fg">{v.definition}</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
            {v.examples.map((e, i) => (<li key={i}>{e}</li>))}
          </ul>
          {v.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {v.tags.map((t) => (<Badge key={t}>{t}</Badge>))}
            </div>
          )}
        </>
      )}
    />
  );
}