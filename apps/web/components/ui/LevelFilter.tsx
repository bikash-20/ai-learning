'use client';

import { Select } from '@/components/ui/Select';

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

export const LevelFilter = ({ value, onChange, ariaLabel = 'Filter levels' }: { value: string; onChange: (v: string) => void; ariaLabel?: string }) => (
  <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label={ariaLabel}>
    <option value="">All levels</option>
    {LEVELS.map((l) => (<option key={l}>{l}</option>))}
  </Select>
);