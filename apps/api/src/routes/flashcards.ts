import { Hono, type Context } from 'hono';
import type { Env } from '../env';
import { requireAuth } from '../lib/requireAuth';
import { rateLimit } from '../lib/ratelimit';
import { handleError } from '../lib/errors';
import { chatJson, myChat } from '../ai/provider';
import {
  FLASHCARD_GEN_PROMPT,
  FLASHCARD_HINT_PROMPT,
  FLASHCARD_EXPLAIN_PROMPT,
} from '../ai/prompt';
import {
  AllUpstreamError,
  JsonCascadeError,
  UpstreamAuthError,
} from '../ai/cascade';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../db/schema';
import { eq, sql } from 'drizzle-orm';
import {
  FlashDeckCreate,
  FlashDeckGenRequest,
  FlashDeckGenJson,
  FlashDeckAddMoreRequest,
  FlashDeckPatch,
  FlashDeckImportRequest,
  FlashReview,
  FlashHintRequest,
  FlashExplainRequest,
  SrsState,
  type SrsStateT,
  type FlashCardGenT,
  type FlashDeckGenJsonT,
  type FlashDeckGenResponseT,
  ErrorCode,
  Level,
} from '@quantara/shared';

type Ctx = Context<{ Bindings: Env; Variables: { userId: string } }>;

/**
 * Map every cascade-level failure to a friendly, CORS-stamped JSON response.
 * Returns `null` when the failure isn't cascade-related (let `handleError`
 * deal with it).
 */
const cascadeError = (c: Ctx, e: unknown): Response | null => {
  if (e instanceof UpstreamAuthError) {
    return c.json({ code: ErrorCode.UpstreamAuth, message: 'AI provider authentication failed.' }, 502);
  }
  if (e instanceof JsonCascadeError) {
    return c.json(
      { code: ErrorCode.AIInvalid, message: "We couldn't generate flashcards right now — please try again." },
      502,
    );
  }
  if (e instanceof AllUpstreamError) {
    return c.json(
      { code: ErrorCode.UpstreamUnavailable, message: e.message, details: { cause: e.cause } },
      503,
    );
  }
  return null;
};

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
  if (ease < 1.3) ease = 1.3;
  if (ease > 3.0) ease = 3.0;
  return {
    ease,
    intervalDays,
    dueAt: Date.now() + intervalDays * 86400 * 1000,
  };
};

const XP_BY_GRADE = [0, 1, 3, 6] as const;
const initialSrs = (): SrsStateT => ({ intervalDays: 0, ease: 2.5, dueAt: Date.now() });

/** Max cards per AI call. Smaller batches complete inside the cascade
 *  budget (Workers AI + OpenRouter combined < 22s) and one bad batch
 *  doesn't burn the whole request. */
const DECK_BATCH_SIZE = 5;

type GenerateBatchArgs = {
  env: Env;
  topic: string;
  level: Level;
  totalN: number;
  language: 'en' | 'bn' | 'bn-en';
  sourceText?: string | undefined;
  difficulty: 'easy' | 'hard';
  route: string;
  /** Optional list of fronts to de-dupe against within this call. */
  excludeFronts?: string[] | undefined;
  /** If supplied, callers reuse this user prompt shape (e.g. add-more). */
  userPrompt?: string | undefined;
  /**
   * Optional per-request deadline in ms (absolute epoch time). All batches
   * share this budget so a misbehaving upstream can't burn 22s × N batches.
   * Defaults to a sane per-request budget (60s for up to 4 batches).
   */
  deadlineMs?: number | undefined;
};

/**
 * Generate `totalN` cards in batches of DECK_BATCH_SIZE. Runs each batch
 * through the JSON cascade independently. If one batch fails the others
 * still return — the caller decides how to surface partial results.
 *
 * Returns `{ title, cards, partial, providers, models, cached }` where
 * `partial = true` means at least one batch failed but we have cards
 * from the others.
 */
async function generateDeckBatch(args: GenerateBatchArgs): Promise<{
  title: string;
  cards: FlashCardGenT[];
  partial: boolean;
  providers: Array<'workers' | 'openrouter'>;
  models: string[];
  cached: boolean;
}> {
  const sizes: number[] = [];
  let remaining = args.totalN;
  while (remaining > 0) {
    const take = Math.min(DECK_BATCH_SIZE, remaining);
    sizes.push(take);
    remaining -= take;
  }
  // Shared envelope across all batches in this request. Each batch's chatJson
  // is told its own budget (= remaining ms), so one bad batch can't burn
  // 22s × N and make the user wait minutes for a 503.
  const start = Date.now();
  const totalBudgetMs = args.deadlineMs !== undefined
    ? Math.max(0, args.deadlineMs - start)
    : 30_000; // up to 4×5 cards + headroom; tighter than per-batch × N
  const cards: FlashCardGenT[] = [];
  const providers: Array<'workers' | 'openrouter'> = [];
  const models: string[] = [];
  let cached = true;
  let title = '';
  let partial = false;
  // Track fronts across batches so we don't duplicate within a single request.
  const seen = new Set<string>(
    (args.excludeFronts ?? []).map((f) => f.trim().toLowerCase()),
  );

  for (let i = 0; i < sizes.length; i++) {
    const batchN = sizes[i]!;
    const remainingBatches = sizes.length - i;
    const elapsed = Date.now() - start;
    // Give this batch whatever time is left, divided across the remaining
    // batches with a 4s floor so even the last batch has a chance to succeed.
    const perBatchMs = Math.max(4_000, Math.floor((totalBudgetMs - elapsed) / remainingBatches));
    // If the envelope is already exhausted, abort early — no point starting a
    // batch we can't possibly finish.
    if (perBatchMs <= 0 || Date.now() >= start + totalBudgetMs) {
      console.warn('flashcards_batches_skipped', {
        route: args.route,
        done: i,
        remaining: sizes.length - i,
        elapsed,
        totalBudgetMs,
      });
      partial = true;
      break;
    }
    const system = FLASHCARD_GEN_PROMPT(
      args.topic,
      args.level,
      batchN,
      args.language,
      args.sourceText,
      args.difficulty,
    );
    const userPrompt =
      args.userPrompt ?? `Generate ${batchN} flashcards on "${args.topic}".`;
    try {
      const { parsed, out } = await chatJson<FlashDeckGenJsonT>(
        args.env,
        args.route,
        {
          system,
          messages: [{ role: 'user', content: userPrompt }],
          temperature: 0.5,
          maxTokens: 2048,
        },
        (raw) => FlashDeckGenJson.parse(raw),
        { budgetMs: perBatchMs },
      );
      // Take the title from the first batch that produced one.
      if (!title && parsed.title) title = parsed.title;
      providers.push(out.provider);
      models.push(out.model);
      if (!out.cached) cached = false;
      for (const card of parsed.cards) {
        const key = card.front.trim().toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        cards.push(card);
      }
    } catch (e) {
      // One bad batch shouldn't kill the whole deck — surface the partial
      // result and let the route decide what to do.
      console.warn('flashcards_generate_batch_failed', {
        route: args.route,
        batch: i + 1,
        batchN,
        err: String(e).slice(0, 200),
      });
      partial = true;
    }
  }

  return {
    title: title || `${args.topic} — flashcards`,
    cards,
    partial,
    providers,
    models,
    cached,
  };
}

/** Tag list helper — defends against null/empty cells from old rows. */
const parseTags = (raw: string | null | undefined): string[] => {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((s) => typeof s === 'string') : [];
  } catch {
    return [];
  };
};

/** Escape a value for CSV output (RFC 4180-ish). */
const csvCell = (v: unknown): string => {
  const s = v === undefined || v === null ? '' : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

/** Parse CSV text into an array of {front, back, hint, explanation, tags, difficulty}.
 *  Headers are case-insensitive. Missing columns become empty. */
const parseCsv = (text: string): FlashCardGenT[] => {
  const rows: string[][] = [];
  let cur: string[] = [];
  let buf = '';
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"' && text[i + 1] === '"') {
        buf += '"';
        i++;
      } else if (ch === '"') {
        inQuote = false;
      } else {
        buf += ch;
      }
    } else if (ch === '"') {
      inQuote = true;
    } else if (ch === ',') {
      cur.push(buf);
      buf = '';
    } else if (ch === '\n') {
      cur.push(buf);
      rows.push(cur);
      cur = [];
      buf = '';
    } else if (ch === '\r') {
      // ignore — handled by \n
    } else {
      buf += ch;
    }
  }
  if (buf.length > 0 || cur.length > 0) {
    cur.push(buf);
    rows.push(cur);
  }
  if (rows.length === 0) return [];
  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const fIdx = idx('front');
  const bIdx = idx('back');
  const hIdx = idx('hint');
  const eIdx = idx('explanation');
  const tIdx = idx('tags');
  const dIdx = idx('difficulty');
  const out: FlashCardGenT[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]!;
    if (row.length === 1 && row[0] === '') continue;
    const front = (row[fIdx] ?? '').trim();
    const back = (row[bIdx] ?? '').trim();
    if (!front || !back) continue;
    const tagsRaw = tIdx >= 0 ? (row[tIdx] ?? '').trim() : '';
    const tags = tagsRaw ? tagsRaw.split(/[;,]/).map((s) => s.trim()).filter(Boolean) : [];
    const diffRaw = (dIdx >= 0 ? (row[dIdx] ?? '') : '').trim().toLowerCase();
    const difficulty: 'easy' | 'hard' = diffRaw === 'hard' ? 'hard' : 'easy';
    out.push({
      front,
      back,
      hint: hIdx >= 0 ? (row[hIdx] ?? '').trim() || undefined : undefined,
      explanation: eIdx >= 0 ? (row[eIdx] ?? '').trim() || undefined : undefined,
      tags: tags.slice(0, 8),
      difficulty,
    });
  }
  return out;
};

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

  /** AI deck preview. Calls chatJson cascade, returns the parsed result,
   *  stamps X-Model-Used, and does NOT persist anything. Runs in batches
   *  of DECK_BATCH_SIZE so large requests don't burn the cascade budget
   *  on a single call. */
  .post('/api/flashcards/decks/generate', requireAuth, async (c) => {
    try {
      const rl = await rateLimit(c, 'flashcardsGen');
      if (rl) return rl;
      const body = FlashDeckGenRequest.parse(await c.req.json());
      const result = await generateDeckBatch({
        env: c.env,
        topic: body.topic,
        level: body.level,
        totalN: body.n,
        language: body.language,
        sourceText: body.sourceText,
        difficulty: body.difficulty,
        route: 'flashcardsGen',
      });
      // No cards at all → upstream failed for every batch. Surface a
      // friendly error so the UI can show "Retry" instead of an empty deck.
      if (result.cards.length === 0) {
        return c.json(
          {
            code: ErrorCode.UpstreamUnavailable,
            message: 'AI is busy right now. Please retry in a moment.',
          },
          503,
        );
      }
      // Pick a representative provider/model — the first batch that succeeded.
      const model = result.models[0] ?? 'unknown';
      const provider = result.providers[0] ?? 'openrouter';
      c.header('X-Model-Used', model);
      const resp: FlashDeckGenResponseT = {
        title: result.title,
        cards: result.cards,
        provider,
        model,
        cached: result.cached,
      };
      // Include a flag for the UI so partial decks can show "we got N of M".
      return c.json({ ...resp, partial: result.partial, requested: body.n } as typeof resp & {
        partial?: boolean;
        requested?: number;
      });
    } catch (e) {
      const ce = cascadeError(c, e);
      if (ce) return ce;
      return handleError(c, e);
    }
  })

  /** Create a deck with N cards in one shot. Now accepts source + aiMeta. */
  .post('/api/flashcards/decks', requireAuth, async (c) => {
    try {
      const rl = await rateLimit(c, 'flashcardsGen');
      if (rl) return rl;
      const body = FlashDeckCreate.parse(await c.req.json());
      const db = drizzle(c.env.DB, { schema });
      const userId = c.get('userId');
      const deckId = crypto.randomUUID();
      await db.insert(schema.flashDeck).values({
        id: deckId,
        ownerId: userId,
        title: body.title,
        topic: body.topic,
        source: body.source ?? 'manual',
      });
      const initial = initialSrs();
      const rows = body.cards.map((card) => ({
        id: crypto.randomUUID(),
        deckId,
        front: card.front.trim(),
        back: card.back.trim(),
        hint: card.hint?.trim() || null,
        explanation: card.explanation?.trim() || null,
        tags: JSON.stringify(card.tags ?? []),
        difficulty: card.difficulty ?? 'easy',
        aiMeta: body.aiMeta ? JSON.stringify(body.aiMeta) : null,
        srsState: initial,
      }));
      await db.insert(schema.flashCard).values(rows);
      return c.json({ deckId, createdCount: rows.length });
    } catch (e) {
      return handleError(c, e);
    }
  })

  /** Add more AI-generated cards to an existing deck. The body must
   *  include `topic` (the deck's topic — we don't trust the client to
   *  override it). Excludes existing fronts. Batched like /generate. */
  .post('/api/flashcards/decks/:id/cards/more', requireAuth, async (c) => {
    try {
      const rl = await rateLimit(c, 'flashcardsAddMore');
      if (rl) return rl;
      const body = FlashDeckAddMoreRequest.parse(await c.req.json());
      const db = drizzle(c.env.DB, { schema });
      const userId = c.get('userId');
      const deckId = c.req.param('id')!;
      const deckRows = await db.select().from(schema.flashDeck).where(eq(schema.flashDeck.id, deckId)).limit(1).all();
      const deck = deckRows[0];
      if (!deck || deck.ownerId !== userId) {
        return c.json({ code: ErrorCode.NotFound, message: 'Deck not found' }, 404);
      }
      const existing = await db.select({ front: schema.flashCard.front }).from(schema.flashCard).where(eq(schema.flashCard.deckId, deckId)).all();
      const existingFronts = new Set(existing.map((r) => r.front.trim().toLowerCase()));
      for (const f of body.excludeFronts ?? []) existingFronts.add(f.trim().toLowerCase());

      const result = await generateDeckBatch({
        env: c.env,
        topic: body.topic,
        level: body.level,
        totalN: body.n,
        language: body.language,
        sourceText: body.sourceText,
        difficulty: body.difficulty,
        route: 'flashcardsAddMore',
        excludeFronts: [...existingFronts],
        userPrompt: `Generate ${body.n} more flashcards on "${body.topic}".`,
      });

      const model = result.models[0] ?? 'unknown';
      const provider = result.providers[0] ?? 'openrouter';
      c.header('X-Model-Used', model);

      // De-dupe against existing fronts (the batcher already de-duped within
      // its own excludeFronts list — existingFronts — so this is just a
      // belt-and-braces guard).
      const fresh = result.cards.filter((card) => !existingFronts.has(card.front.trim().toLowerCase()));
      const initial = initialSrs();
      let inserted = 0;
      if (fresh.length > 0) {
        await db.insert(schema.flashCard).values(
          fresh.map((card) => ({
            id: crypto.randomUUID(),
            deckId,
            front: card.front.trim(),
            back: card.back.trim(),
            hint: card.hint?.trim() || null,
            explanation: card.explanation?.trim() || null,
            tags: JSON.stringify(card.tags ?? []),
            difficulty: card.difficulty ?? 'easy',
            aiMeta: JSON.stringify({ provider, model, generatedAt: Date.now() }),
            srsState: initial,
          })),
        );
        inserted = fresh.length;
      }
      // Zero cards returned AND all batches failed → upstream unavailable.
      if (result.cards.length === 0) {
        return c.json(
          {
            code: ErrorCode.UpstreamUnavailable,
            message: 'AI is busy right now. Please retry in a moment.',
          },
          503,
        );
      }
      return c.json({
        addedCount: inserted,
        generated: result.cards.length,
        provider,
        model,
        partial: result.partial,
      });
    } catch (e) {
      const ce = cascadeError(c, e);
      if (ce) return ce;
      return handleError(c, e);
    }
  })

  /** Rename or re-topic a deck. */
  .patch('/api/flashcards/decks/:id', requireAuth, async (c) => {
    try {
      const body = FlashDeckPatch.parse(await c.req.json());
      const db = drizzle(c.env.DB, { schema });
      const userId = c.get('userId');
      const deckId = c.req.param('id')!;
      const deckRows = await db.select().from(schema.flashDeck).where(eq(schema.flashDeck.id, deckId)).limit(1).all();
      const deck = deckRows[0];
      if (!deck || deck.ownerId !== userId) {
        return c.json({ code: ErrorCode.NotFound, message: 'Deck not found' }, 404);
      }
      const patch: { title?: string; topic?: string } = {};
      if (body.title !== undefined) patch.title = body.title;
      if (body.topic !== undefined) patch.topic = body.topic;
      await db.update(schema.flashDeck).set(patch).where(eq(schema.flashDeck.id, deckId));
      return c.json({ ok: true, deck: { id: deckId, ...patch } });
    } catch (e) {
      return handleError(c, e);
    }
  })

  /** Delete a deck (cascade deletes its cards + reviews via FK). */
  .delete('/api/flashcards/decks/:id', requireAuth, async (c) => {
    try {
      const db = drizzle(c.env.DB, { schema });
      const userId = c.get('userId');
      const deckId = c.req.param('id')!;
      const deckRows = await db.select().from(schema.flashDeck).where(eq(schema.flashDeck.id, deckId)).limit(1).all();
      const deck = deckRows[0];
      if (!deck || deck.ownerId !== userId) {
        return c.json({ code: ErrorCode.NotFound, message: 'Deck not found' }, 404);
      }
      await db.delete(schema.flashDeck).where(eq(schema.flashDeck.id, deckId));
      return c.json({ ok: true });
    } catch (e) {
      return handleError(c, e);
    }
  })

  /** Reset SRS state for every card in a deck (intervalDays 0, ease 2.5, due now)
   *  + delete the per-card review rows. */
  .post('/api/flashcards/decks/:id/reset', requireAuth, async (c) => {
    try {
      const db = drizzle(c.env.DB, { schema });
      const userId = c.get('userId');
      const deckId = c.req.param('id')!;
      const deckRows = await db.select().from(schema.flashDeck).where(eq(schema.flashDeck.id, deckId)).limit(1).all();
      const deck = deckRows[0];
      if (!deck || deck.ownerId !== userId) {
        return c.json({ code: ErrorCode.NotFound, message: 'Deck not found' }, 404);
      }
      const initial = initialSrs();
      // Reset srsState on every card in the deck.
      await db
        .update(schema.flashCard)
        .set({ srsState: initial })
        .where(eq(schema.flashCard.deckId, deckId));
      // Wipe review rows for cards that belonged to this deck. Drizzle doesn't
      // support multi-table delete easily; we grab the card ids first.
      const cardIds = (await db
        .select({ id: schema.flashCard.id })
        .from(schema.flashCard)
        .where(eq(schema.flashCard.deckId, deckId))
        .all()).map((r) => r.id);
      if (cardIds.length > 0) {
        await db
          .delete(schema.review)
          .where(sql`${schema.review.cardId} IN (${sql.join(cardIds.map((id) => sql`${id}`), sql`, `)})`);
      }
      return c.json({ ok: true, resetCount: cardIds.length });
    } catch (e) {
      return handleError(c, e);
    }
  })

  /** Export a deck as JSON or CSV download. */
  .get('/api/flashcards/decks/:id/export', requireAuth, async (c) => {
    try {
      const db = drizzle(c.env.DB, { schema });
      const userId = c.get('userId');
      const deckId = c.req.param('id')!;
      const format = (c.req.query('format') ?? 'json').toLowerCase();
      if (format !== 'json' && format !== 'csv') {
        return c.json({ code: ErrorCode.BadRequest, message: 'format must be json or csv' }, 400);
      }
      const deckRows = await db.select().from(schema.flashDeck).where(eq(schema.flashDeck.id, deckId)).limit(1).all();
      const deck = deckRows[0];
      if (!deck || deck.ownerId !== userId) {
        return c.json({ code: ErrorCode.NotFound, message: 'Deck not found' }, 404);
      }
      const cards = await db.select().from(schema.flashCard).where(eq(schema.flashCard.deckId, deckId)).all();
      if (format === 'json') {
        const body = JSON.stringify(
          {
            title: deck.title,
            topic: deck.topic,
            source: deck.source,
            cards: cards.map((card) => ({
              front: card.front,
              back: card.back,
              hint: card.hint ?? '',
              explanation: card.explanation ?? '',
              tags: parseTags(card.tags),
              difficulty: card.difficulty ?? 'easy',
            })),
          },
          null,
          2,
        );
        return new Response(body, {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Disposition': `attachment; filename="${deck.title.replace(/[^a-z0-9-_ ]/gi, '_')}.json"`,
          },
        });
      }
      // CSV
      const lines: string[] = ['front,back,hint,explanation,tags,difficulty'];
      for (const card of cards) {
        const tags = parseTags(card.tags).join(';');
        lines.push(
          [
            csvCell(card.front),
            csvCell(card.back),
            csvCell(card.hint ?? ''),
            csvCell(card.explanation ?? ''),
            csvCell(tags),
            csvCell(card.difficulty ?? 'easy'),
          ].join(','),
        );
      }
      const body = lines.join('\n');
      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${deck.title.replace(/[^a-z0-9-_ ]/gi, '_')}.csv"`,
        },
      });
    } catch (e) {
      return handleError(c, e);
    }
  })

  /** Import a deck from JSON or CSV. The body carries the raw text payload. */
  .post('/api/flashcards/decks/import', requireAuth, async (c) => {
    try {
      const rl = await rateLimit(c, 'flashcardsGen');
      if (rl) return rl;
      const body = FlashDeckImportRequest.parse(await c.req.json());
      let cards: FlashCardGenT[];
      let inferredTitle: string | undefined;
      let inferredTopic: string | undefined;
      try {
        if (body.format === 'json') {
          const parsed = JSON.parse(body.data);
          if (Array.isArray(parsed)) {
            cards = parsed as FlashCardGenT[];
          } else {
            cards = parsed.cards as FlashCardGenT[];
            if (typeof parsed.title === 'string') inferredTitle = parsed.title;
            if (typeof parsed.topic === 'string') inferredTopic = parsed.topic;
          }
        } else {
          cards = parseCsv(body.data);
        }
      } catch {
        return c.json({ code: ErrorCode.BadRequest, message: 'Could not parse ' + body.format + ' payload' }, 400);
      }
      if (!Array.isArray(cards) || cards.length === 0) {
        return c.json({ code: ErrorCode.BadRequest, message: 'No cards found in payload' }, 400);
      }
      // Validate via Zod (one at a time so a single bad card rejects the
      // whole import — caller wanted "either all good or none").
      const validated: FlashCardGenT[] = [];
      for (const raw of cards) {
        const v = FlashDeckGenJson.shape.cards.element.safeParse(raw);
        if (!v.success) {
          return c.json({ code: ErrorCode.ValidationError, message: 'Invalid card: ' + v.error.message }, 400);
        }
        validated.push(v.data);
      }
      const title = body.title ?? inferredTitle ?? 'Imported deck';
      const topic = body.topic ?? inferredTopic ?? 'imported';
      const db = drizzle(c.env.DB, { schema });
      const userId = c.get('userId');
      const deckId = crypto.randomUUID();
      await db.insert(schema.flashDeck).values({
        id: deckId,
        ownerId: userId,
        title,
        topic,
        source: body.source,
      });
      const initial = initialSrs();
      await db.insert(schema.flashCard).values(
        validated.map((card) => ({
          id: crypto.randomUUID(),
          deckId,
          front: card.front.trim(),
          back: card.back.trim(),
          hint: card.hint?.trim() || null,
          explanation: card.explanation?.trim() || null,
          tags: JSON.stringify(card.tags ?? []),
          difficulty: card.difficulty ?? 'easy',
          aiMeta: null,
          srsState: initial,
        })),
      );
      return c.json({ deckId, createdCount: validated.length });
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
          hint: card.hint ?? undefined,
          explanation: card.explanation ?? undefined,
          tags: parseTags(card.tags),
          difficulty: (card.difficulty ?? 'easy') as 'easy' | 'hard',
          srsState: card.srsState,
        })),
      );
    } catch (e) {
      return handleError(c, e);
    }
  })

  /** On-demand hint for a card. Persists back to flash_card.hint so future
   *  reviews don't pay the AI cost again. */
  .post('/api/flashcards/cards/:id/hint', requireAuth, async (c) => {
    try {
      const rl = await rateLimit(c, 'flashcardsExplain');
      if (rl) return rl;
      FlashHintRequest.parse(await c.req.json().catch(() => ({})));
      const db = drizzle(c.env.DB, { schema });
      const cardId = c.req.param('id')!;
      const userId = c.get('userId');
      const cardRows = await db.select().from(schema.flashCard).where(eq(schema.flashCard.id, cardId)).limit(1).all();
      const card = cardRows[0];
      if (!card) return c.json({ code: ErrorCode.NotFound, message: 'Card not found' }, 404);
      // Ownership via deck.
      const deckRows = await db.select().from(schema.flashDeck).where(eq(schema.flashDeck.id, card.deckId)).limit(1).all();
      if (deckRows[0]?.ownerId !== userId) {
        return c.json({ code: ErrorCode.Forbidden, message: 'Not your deck' }, 403);
      }
      // Already have a hint? return it without burning quota.
      if (card.hint && card.hint.trim().length > 0) {
        return c.json({ hint: card.hint, cached: true, model: 'stored' });
      }
      const system = FLASHCARD_HINT_PROMPT(card.front);
      const out = await myChat(c.env, 'flashcardsHint', {
        system,
        messages: [{ role: 'user', content: card.front }],
        maxTokens: 200,
        temperature: 0.4,
      });
      c.header('X-Model-Used', out.model);
      const hint = out.text.trim().slice(0, 200);
      await db.update(schema.flashCard).set({ hint }).where(eq(schema.flashCard.id, cardId));
      return c.json({ hint, cached: !!out.cached, model: out.model });
    } catch (e) {
      const ce = cascadeError(c, e);
      if (ce) return ce;
      return handleError(c, e);
    }
  })

  /** AI Explain with depth. Cached by (cardId, depth) so the same depth
   *  never recomputes. Stamps X-Model-Used. */
  .post('/api/flashcards/cards/:id/explain', requireAuth, async (c) => {
    try {
      const rl = await rateLimit(c, 'flashcardsExplain');
      if (rl) return rl;
      const body = FlashExplainRequest.parse(await c.req.json().catch(() => ({})));
      const db = drizzle(c.env.DB, { schema });
      const cardId = c.req.param('id')!;
      const userId = c.get('userId');
      const cardRows = await db.select().from(schema.flashCard).where(eq(schema.flashCard.id, cardId)).limit(1).all();
      const card = cardRows[0];
      if (!card) return c.json({ code: ErrorCode.NotFound, message: 'Card not found' }, 404);
      const deckRows = await db.select().from(schema.flashDeck).where(eq(schema.flashDeck.id, card.deckId)).limit(1).all();
      if (deckRows[0]?.ownerId !== userId) {
        return c.json({ code: ErrorCode.Forbidden, message: 'Not your deck' }, 403);
      }
      // Use a fresh system per (front, back, depth, level) so cache keys
      // never collide across depths.
      const level: Level = body.level ?? 'B2';
      const system = FLASHCARD_EXPLAIN_PROMPT(card.front, card.back, level, body.depth);
      const out = await myChat(
        c.env,
        'flashcardsExplain',
        {
          system,
          messages: [{ role: 'user', content: `${card.front} → ${card.back}` }],
          maxTokens: 600,
          temperature: 0.4,
        },
        { kind: 'explanation', authoritative: true },
      );
      c.header('X-Model-Used', out.model);
      return c.json({
        explanation: out.text.trim().slice(0, 800),
        model: out.model,
        provider: out.provider,
        cached: !!out.cached,
        depth: body.depth,
      });
    } catch (e) {
      const ce = cascadeError(c, e);
      if (ce) return ce;
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
      const deckRows = await db.select().from(schema.flashDeck).where(eq(schema.flashDeck.id, card.deckId)).limit(1).all();
      if (deckRows[0]?.ownerId !== userId) {
        return c.json({ code: ErrorCode.Forbidden, message: 'Not your deck' }, 403);
      }

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