'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BRAND } from '@/lib/brand';
import { GRID_TILES, ICONS, TILE_ACCENT, type HubTile } from '@/lib/hubConfig';
import { useRole } from '@/lib/useRole';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { BrandWordmark, FounderCredit } from '@/components/Brand';
import { ChatBubbleIcon } from '@/components/ui/icons';

/**
 * /explore — mobile-first hub.
 *
 * Visual recipe:
 *  - Slim hero: tagline + ONE button (Start chatting). No tip box, no
 *    HealthChip (the API status is a developer concern, not a user
 *    surface — it lives in /admin).
 *  - 2-col tile grid on mobile, 3-col on lg. Tile content is just an
 *    icon, title, and one short line — no progress bars, no Easy/Hard
 *    chips. Flashcards keeps a one-line "% mastered" because it has
 *    real data and the spec carves out "one small stat where it
 *    matters".
 *  - No Account card here — name/email/logout live in the avatar menu
 *    (desktop Navbar's UserMenu; mobile MobileTopBar's avatar button).
 *  - The founder credit sits at the bottom, outside any card, so it
 *    doesn't compete with the tiles.
 */
const Tile = ({ tile }: { tile: HubTile }) => {
  const accent = TILE_ACCENT[tile.accent ?? 'accent'];
  const Icon = ICONS[tile.iconId];
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
            <Icon size={18} className="text-current" />
          </span>
          <div className="min-w-0 flex-1 font-display text-lg tracking-display text-fg">
            {tile.title}
          </div>
          {tile.extras?.kind === 'progress' && (
            <span className="rounded-pill border border-glass-border bg-glass-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
              {tile.extras.value}%
            </span>
          )}
        </div>
        <p className="text-sm text-muted">{tile.desc}</p>
      </GlassCard>
    </Link>
  );
};

export default function ExplorePage() {
  const router = useRouter();
  const role = useRole();
  const tiles = GRID_TILES(role === 'admin');

  return (
    <main className="space-y-6">
      {/* === HERO ===
          Theme toggle is rendered by the shared Navbar (desktop) and
          MobileTopBar (mobile) — do NOT duplicate it here.
          The full set of features (Quiz, Vocab, Exam, Progress, Admin)
          is exposed in the tile grid below. The hero stays focused on
          the marquee flow: start a chat session. */}
      <GlassCard className="space-y-4">
        <div className="space-y-1">
          <h1
            className="text-3xl font-semibold leading-tight text-fg sm:text-4xl"
            style={{ fontFamily: 'var(--font-hero), serif' }}
          >
            Explore <span className="text-accent">{BRAND.appName}</span>
          </h1>
          <p className="text-sm text-muted sm:text-base">{BRAND.tagline}</p>
        </div>

        <Button onClick={() => router.push('/chat')} className="w-full sm:w-auto">
          <ChatBubbleIcon size={16} className="mr-1.5" decorative />
          Start chatting
        </Button>
      </GlassCard>

      {/* === TILES GRID ===
          Single source of truth for navigation: `HUB_TILES` in hubConfig.ts. */}
      <section aria-label="Features" className="space-y-3">
        <h2 className="font-display text-sm uppercase tracking-display text-muted">
          Learn
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((t) => (
            <Tile key={t.id} tile={t} />
          ))}
        </div>
      </section>

      <div className="flex flex-col items-center gap-1 pt-2">
        <BrandWordmark size="sm" />
        <FounderCredit compact />
      </div>
    </main>
  );
}
