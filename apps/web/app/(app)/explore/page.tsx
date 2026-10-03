'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BRAND, todaysTip } from '@/lib/brand';
import { GRID_TILES, ICONS, TILE_ACCENT, type HubTile } from '@/lib/hubConfig';
import { useSession } from '@/lib/useSession';
import { useRole } from '@/lib/useRole';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { BrandMark, BrandWordmark, FounderCredit } from '@/components/Brand';
import { ChatBubbleIcon, SparkleIcon } from '@/components/ui/icons';

type HealthState = 'unknown' | 'live' | 'offline';

const useHealthState = (): HealthState => {
  const [state, setState] = useState<HealthState>('unknown');
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';
    if (!base) {
      setState('offline');
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4_000);
    fetch(`${base}/api/health/models`, { signal: ctrl.signal, credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`API ${r.status}`))))
      .then((j: { providers?: { workers?: Array<{ ok: boolean }> } }) => {
        const anyOk = (j.providers?.workers ?? []).some((m) => m.ok);
        setState(anyOk ? 'live' : 'offline');
      })
      .catch(() => setState('offline'))
      .finally(() => clearTimeout(t));
    return () => ctrl.abort();
  }, []);
  return state;
};

const HealthChip = ({ state }: { state: HealthState }) => {
  if (state === 'live') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-pill border border-success/30 bg-success/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-success">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
        </span>
        Live now
      </span>
    );
  }
  if (state === 'offline') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-pill border border-glass-border bg-glass-bg px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
        <span className="h-2 w-2 rounded-full bg-muted" />
        Offline
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-pill border border-glass-border bg-glass-bg px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
      <span className="h-2 w-2 rounded-full bg-muted/60" />
      Checking
    </span>
  );
};

const Tile = ({ tile, onChip }: { tile: HubTile; onChip?: (label: string) => void }) => {
  const accent = TILE_ACCENT[tile.accent ?? 'accent'];
  return (
    <Link
      href={tile.href}
      className="block min-h-[44px] rounded-glass focus:outline-none"
      aria-label={`${tile.title}: ${tile.desc}`}
    >
      <GlassCard hoverable className="flex h-full flex-col gap-2">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-card border ${accent}`}
          >
            {(() => {
              const Icon = ICONS[tile.iconId];
              return <Icon size={18} className="text-current" />;
            })()}
          </span>
          <div className="font-display text-lg tracking-display text-fg">{tile.title}</div>
        </div>
        <p className="text-sm text-muted">{tile.desc}</p>
        {tile.extras?.kind === 'progress' && (
          <div className="mt-1">
            <div className="h-1.5 w-full overflow-hidden rounded-pill bg-glass-bg">
              <div
                className="h-full rounded-pill bg-accent"
                style={{ width: `${Math.max(0, Math.min(100, tile.extras.value))}%` }}
                aria-label={`${tile.extras.value}% complete`}
              />
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-wide text-muted">
              {tile.extras.value}% mastered
            </div>
          </div>
        )}
        {tile.extras?.kind === 'chips' && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {tile.extras.chips.map((c) => (
              <button
                key={c.label}
                type="button"
                onClick={(e) => { e.preventDefault(); onChip?.(c.label); }}
                className="rounded-pill border border-glass-border bg-glass-bg px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fg hover:border-accent"
              >
                {c.label}
              </button>
            ))}
          </div>
        )}
      </GlassCard>
    </Link>
  );
};

export default function ExplorePage() {
  const router = useRouter();
  const { user } = useSession();
  const role = useRole();
  const health = useHealthState();
  const [tip] = useState<string>(() => todaysTip());
  const tiles = GRID_TILES(role === 'admin');

  const onTileChip = (tileId: string, label: string) => {
    // Map a "Easy" / "Hard" chip into a quiz level query string.
    const level = label === 'Easy' ? 'A2' : label === 'Hard' ? 'C1' : null;
    if (level) router.push(`${tileId === 'quiz' ? '/quiz' : '/quiz'}?level=${level}`);
    else router.push('/quiz');
  };

  return (
    <main className="space-y-6">
      {/* === HERO ===
           Theme toggle is rendered by the shared Navbar (desktop) and
           MobileTopBar (mobile) — do NOT duplicate it here.
           Exam shortcut is rendered by the tile grid below — do NOT
           duplicate it in the hero. */}
      <GlassCard className="space-y-5">
        <div className="flex items-center gap-2">
          <HealthChip state={health} />
        </div>

        <div className="flex items-start gap-4">
          <BrandMark size={56} className="text-fg shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wide text-muted">
              {BRAND.founder.title} · {BRAND.founder.name}
            </p>
            <h1
              className="mt-1 text-3xl font-semibold leading-tight text-fg sm:text-4xl"
              style={{ fontFamily: 'var(--font-hero), serif' }}
            >
              Explore <span className="text-accent">{BRAND.appName}</span>
            </h1>
            <p className="mt-2 text-sm text-muted sm:text-base">
              {BRAND.tagline}
            </p>
          </div>
        </div>

        {/* Hero CTA: Chat with Quantara.
            The full set of features (Quiz, Vocab, Exam, Progress, Settings,
            Admin) is exposed in the tile grid below. The hero stays focused
            on the marquee flow: start a chat session. */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <SparkleIcon size={18} className="text-accent" decorative />
            <span className="font-display text-xl tracking-display text-fg">
              Chat with {BRAND.appName}
            </span>
          </div>
          <p className="text-sm text-muted">
            One-on-one with the tutor. Streaming answers, real explanations, model chip on every reply.
          </p>

          {/* Daily tip — quote/box with the brand avatar. */}
          <div className="flex items-start gap-3 rounded-card border border-glass-border bg-glass-bg/50 p-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
              <BrandMark size={22} />
            </div>
            <p className="text-sm italic text-fg/90">"{tip}"</p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={() => router.push('/chat')} className="flex-1 sm:flex-none">
              <ChatBubbleIcon size={16} className="mr-1.5" decorative />
              Start chatting
            </Button>
          </div>
        </div>
      </GlassCard>

      {/* === TILES GRID ===
           Single source of truth for navigation: `HUB_TILES` in hubConfig.ts.
           Adding/removing a feature here automatically syncs the mobile
           tab bar (`TAB_TILES`) and the desktop navbar (`navItems`/`HUB_TILES`). */}
      <section aria-label="Features" className="space-y-3">
        <h2 className="font-display text-sm uppercase tracking-display text-muted">
          Learn
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((t) => (
            <Tile
              key={t.id}
              tile={t}
              onChip={(label) => onTileChip(t.id, label)}
            />
          ))}
        </div>
      </section>

      {/* === ACCOUNT AREA ===
           Logout lives in the Navbar's UserMenu (desktop) and the
           MobileTopBar's avatar menu (mobile). We keep a slim user info
           card here so the user can confirm their account without
           scrolling up to the navbar. */}
      <GlassCard className="space-y-3">
        <h2 className="font-display text-sm uppercase tracking-display text-muted">
          Account
        </h2>
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-glass-border bg-primary/15 text-sm font-semibold text-primary"
          >
            {(user?.name || user?.email || '·').slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-fg">
              {user?.name ?? user?.email ?? 'Not signed in'}
            </div>
            {user?.name && user.email && (
              <div className="truncate text-xs text-muted">{user.email}</div>
            )}
          </div>
        </div>
      </GlassCard>

      <div className="flex flex-col items-center gap-1 pt-2">
        <BrandWordmark size="sm" />
        <FounderCredit compact />
      </div>
    </main>
  );
}