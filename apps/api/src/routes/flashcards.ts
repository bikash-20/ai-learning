import { Hono } from 'hono';
import type { Env } from '../env';
import { requireAuth } from '../lib/requireAuth';
import { rateLimit } from '../lib/ratelimit';
import { handleError } from '../lib/errors';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../db/schema';
import { eq, sql } from 'drizzle-orm';
import {
  FlashDeckCreate,
  FlashReview,
  SrsState,
  type SrsStateT,
  ErrorCode,
} from '@quantara/shared';

/**
 * Simplified SM-2 step:
 *   grade 0 = Again (forgot)      — ease -0.2, interval = 0 (due now)
 *   grade 1 = Hard (struggled)    — ease unchanged, interval *= 1.2
 *   grade 2 = Good (recalled)     — interval *= ease
 *   grade 3 = Easy (perfect)      — ease +0.15, interval *= ease * 1.3
 *
 * `ease` is clamped to a [1.3, 3.0] range to keep intervals sane.
 * XP delta is +0/1/3/6 for grades 0/1/2/3.
 */
const srsStep = (cur: SrsStateT, grade: 0 | 1 | 2 | 3): SrsStateT => {
  let ease = cur.ease;
  let intervalDays = cur.intervalDays;
  switch (grade) {
    case 0:
      ease = Math.max(1.3, ease - 0.2);
      intervalDays = 0; // due immediately
      break;
    case 1:
      intervalDays = Math.max(0, cur.intervalDays * 1.2);
      break;
    case 2:
      intervalDays = Math.max(1, cur.intervalDays * ease);
      break;
    case 3:
      ease = Math.min(3.0, ease + 0.15);
      intervalDays = Math.max(1, cur.intervalDays * ease * 1.3);
      break;
  }
  // Floor the new ease so we don't drift too high.
  if (ease < 1.3) ease = 1.3;
  if (ease > 3.0) ease = 3.0;
  return {
    ease,
    intervalDays,
    dueAt: Date.now() + intervalDays * 86400 * 1000,
  };
};

const XP_BY_GRADE = [0, 1, 3, 6] as const;

export const flashcardsRoute = new Hono<{ Bindings: Env; Variables: { userId: string } }>()
  /** List decks for the signed-in user with counts. */
  .get('/api/flashcards/decks', requireAuth, async (c) => {
    try {
      const db = drizzle(c.env.DB, { schema });
      const userId = c.get('userId');
      const decks = await db.select().from(schema.flashDeck).where(eq(schema.flashDeck.ownerId, userId)).all();
      if (decks.length === 0) return c.json([]);
      const ids = decks.map((d) => d.id);
      const allCards = await db
        .select()
        .from(schema.flashCard)
        .where(sql`${schema.flashCard.deckId} IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`)
        .all();
      const byDeck = new Map<string, { total: number; due: number }>();
      const now = Date.now();
      for (const card of allCards) {
        const e = byDeck.get(card.deckId) ?? { total: 0, due: 0 };
        e.total += 1;
        if (card.srsState.dueAt <= now) e.due += 1;
        byDeck.set(card.deckId, e);
      }
      return c.json(
        decks.map((d) => {
          const stats = byDeck.get(d.id) ?? { total: 0, due: 0 };
          return {
            id: d.id,
            title: d.title,
            topic: d.topic,
            source: d.source,
            cardCount: stats.total,
            dueCount: stats.due,
            createdAt: Math.floor(d.createdAt.getTime() / 1000),
          };
        }),
      );
    } catch (e) {
      return handleError(c, e);
    }
  })

  /** Create a deck with N cards in one shot. */
  .post('/api/flashcards/decks', requireAuth, async (c) => {
    try {
      const rl = await rateLimit(c, 'flashcardsGen');
      if (rl) return rl;
      const body = FlashDeckCreate.parse(await c.req.json());
      const db = drizzle(c.env.DB, { schema });
      const userId = c.get('userId');
      const deckId = crypto.randomUUID();
      const now = new Date();
      await db.insert(schema.flashDeck).values({
        id: deckId,
        ownerId: userId,
        title: body.title,
        topic: body.topic,
        source: 'manual',
      });
      const initialSrs: SrsStateT = { intervalDays: 0, ease: 2.5, dueAt: now.getTime() };
      await db.insert(schema.flashCard).values(
        body.cards.map((card) => ({
          id: crypto.randomUUID(),
          deckId,
          front: card.front,
          back: card.back,
          srsState: initialSrs,
        })),
      );
      return c.json({ deckId, createdCount: body.cards.length });
    } catch (e) {
      return handleError(c, e);
    }
  })

  /** List cards in a deck — used by the review screen. */
  .get('/api/flashcards/decks/:id/cards', requireAuth, async (c) => {
    try {
      const db = drizzle(c.env.DB, { schema });
      const deckId = c.req.param('id')!;
      const userId = c.get('userId');
      const deck = await db.select().from(schema.flashDeck).where(eq(schema.flashDeck.id, deckId)).limit(1).all();
      if (deck[0]?.ownerId !== userId) {
        return c.json({ code: ErrorCode.NotFound, message: 'Deck not found' }, 404);
      }
      const cards = await db.select().from(schema.flashCard).where(eq(schema.flashCard.deckId, deckId)).all();
      const now = Date.now();
      // Order: due-now first, then by dueAt asc, then by createdAt.
      cards.sort((a, b) => {
        const aDue = a.srsState.dueAt <= now ? 0 : 1;
        const bDue = b.srsState.dueAt <= now ? 0 : 1;
        if (aDue !== bDue) return aDue - bDue;
        return a.srsState.dueAt - b.srsState.dueAt;
      });
      return c.json(
        cards.map((card) => ({
          id: card.id,
          front: card.front,
          back: card.back,
          srsState: card.srsState,
        })),
      );
    } catch (e) {
      return handleError(c, e);
    }
  })

  /** Review a card. Updates srsState + writes to review table + bumps user.xp. */
  .post('/api/flashcards/cards/:id/review', requireAuth, async (c) => {
    try {
      const rl = await rateLimit(c, 'flashcardsReview');
      if (rl) return rl;
      const body = FlashReview.parse(await c.req.json());
      const grade = body.grade as 0 | 1 | 2 | 3;
      const db = drizzle(c.env.DB, { schema });
      const cardId = c.req.param('id')!;
      const userId = c.get('userId');

      const rows = await db.select().from(schema.flashCard).where(eq(schema.flashCard.id, cardId)).limit(1).all();
      const card = rows[0];
      if (!card) return c.json({ code: ErrorCode.NotFound, message: 'Card not found' }, 404);
      // Verify ownership via the deck.
      const deckRows = await db.select().from(schema.flashDeck).where(eq(schema.flashDeck.id, card.deckId)).limit(1).all();
      if (deckRows[0]?.ownerId !== userId) {
        return c.json({ code: ErrorCode.Forbidden, message: 'Not your deck' }, 403);
      }

      // Validate stored state then compute next state.
      const cur = SrsState.parse(card.srsState);
      const next = srsStep(cur, grade);
      await db
        .update(schema.flashCard)
        .set({ srsState: next })
        .where(eq(schema.flashCard.id, cardId));
      await db.insert(schema.review).values({
        id: crypto.randomUUID(),
        userId,
        cardId,
        grade,
      });

      // XP grant — atomic increment.
      const xpDelta = XP_BY_GRADE[grade]!;
      if (xpDelta > 0) {
        await db
          .update(schema.user)
          .set({ xp: sql`${schema.user.xp} + ${xpDelta}` })
          .where(eq(schema.user.id, userId));
      }

      return c.json({
        card: { id: cardId, front: card.front, back: card.back, srsState: next },
        xpDelta,
      });
    } catch (e) {
      return handleError(c, e);
    }
  })

  /** Total XP for the signed-in user. */
  .get('/api/me/xp', requireAuth, async (c) => {
    try {
      const db = drizzle(c.env.DB, { schema });
      const userId = c.get('userId');
      const rows = await db.select({ xp: schema.user.xp }).from(schema.user).where(eq(schema.user.id, userId)).limit(1).all();
      return c.json({ xp: rows[0]?.xp ?? 0 });
    } catch (e) {
      return handleError(c, e);
    }
  });