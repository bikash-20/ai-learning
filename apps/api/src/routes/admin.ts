import { Hono } from 'hono';
import type { Env } from '../env';
import { requireAuth } from '../lib/requireAuth';
import { requireAdmin } from '../lib/requireAdmin';
import { handleError } from '../lib/errors';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../db/schema';
import { eq, sql, desc } from 'drizzle-orm';

/**
 * Admin-only surface. Every route here is gated by requireAdmin, which
 * reads `user.role` from D1 and returns 403 unless it's 'admin'.
 *
 * What lives here:
 * - /api/stats         — quick health-style counts (users, total attempts, AI cache size, MCQ bank rows)
 * - /api/users        — paginated user list with role + XP
 * - /api/ai-cache     — recent cache entries (read-only)
 * - /api/users/:id/role — promote / demote (admin-only)
 *
 * Why these four:
 * - stats gives the admin landing page something meaningful on first paint
 * - user list is the only thing that lets an admin discover new signups
 * - cache peek is for debugging free-tier quota pressure
 * - role patch is the actual lever — without it the role column is read-only
 */
export const adminRoute = new Hono<{ Bindings: Env; Variables: { userId: string; userRole?: 'user' | 'admin' } }>()
  .use('*', requireAuth, requireAdmin)

  /** Lightweight counts. Cheap enough to hit on every dashboard load. */
  .get('/api/admin/stats', async (c) => {
    try {
      const db = drizzle(c.env.DB, { schema });
      const [users] = await db
        .select({ n: sql<number>`count(*)` })
        .from(schema.user)
        .all();
      const [admins] = await db
        .select({ n: sql<number>`count(*)` })
        .from(schema.user)
        .where(eq(schema.user.role, 'admin'))
        .all();
      const [quizzes] = await db
        .select({ n: sql<number>`count(*)` })
        .from(schema.quiz)
        .all();
      const [attempts] = await db
        .select({ n: sql<number>`count(*)` })
        .from(schema.quizAttempt)
        .all();
      const [finished] = await db
        .select({ n: sql<number>`count(*)` })
        .from(schema.quizAttempt)
        .where(sql`${schema.quizAttempt.finishedAt} IS NOT NULL`)
        .all();
      const [items] = await db
        .select({ n: sql<number>`count(*)` })
        .from(schema.quizItem)
        .all();
      const [mcq] = await db
        .select({ n: sql<number>`count(*)` })
        .from(schema.mcqBank)
        .all();
      const [cache] = await db
        .select({ n: sql<number>`count(*)` })
        .from(schema.aiCache)
        .all();
      const [decks] = await db
        .select({ n: sql<number>`count(*)` })
        .from(schema.flashDeck)
        .all();
      const [cards] = await db
        .select({ n: sql<number>`count(*)` })
        .from(schema.flashCard)
        .all();
      return c.json({
        users: users?.n ?? 0,
        admins: admins?.n ?? 0,
        quizzes: quizzes?.n ?? 0,
        attempts: attempts?.n ?? 0,
        finished: finished?.n ?? 0,
        items: items?.n ?? 0,
        mcqBank: mcq?.n ?? 0,
        aiCache: cache?.n ?? 0,
        decks: decks?.n ?? 0,
        cards: cards?.n ?? 0,
      });
    } catch (e) {
      return handleError(c, e);
    }
  })

  /** User list — paginated, sorted by most-recently-created. */
  .get('/api/admin/users', async (c) => {
    try {
      const limitRaw = Number(c.req.query('limit') ?? 50);
      const limit = Math.max(1, Math.min(200, Number.isFinite(limitRaw) ? limitRaw : 50));
      const db = drizzle(c.env.DB, { schema });
      const rows = await db
        .select({
          id: schema.user.id,
          email: schema.user.email,
          name: schema.user.name,
          role: schema.user.role,
          xp: schema.user.xp,
          createdAt: schema.user.createdAt,
        })
        .from(schema.user)
        .orderBy(desc(schema.user.createdAt))
        .limit(limit)
        .all();
      return c.json(
        rows.map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          role: u.role,
          xp: u.xp,
          createdAt: Math.floor(u.createdAt.getTime() / 1000),
        })),
      );
    } catch (e) {
      return handleError(c, e);
    }
  })

  /** Promote / demote. Body: { role: 'user' | 'admin' }. */
  .put('/api/admin/users/:id/role', async (c) => {
    try {
      const targetId = c.req.param('id')!;
      const body = (await c.req.json().catch(() => null)) as { role?: string } | null;
      const role = body?.role;
      if (role !== 'admin' && role !== 'user') {
        return c.json({ code: 'BAD_REQUEST', message: 'role must be admin or user' }, 400);
      }
      const db = drizzle(c.env.DB, { schema });
      // Guard against self-demotion: if the calling admin drops their own
      // role they'd lock themselves out, which is not what they want when
      // they're just "testing".
      const caller = c.get('userId');
      if (caller === targetId && role !== 'admin') {
        return c.json({ code: 'BAD_REQUEST', message: 'You cannot demote yourself' }, 400);
      }
      await db.update(schema.user).set({ role }).where(eq(schema.user.id, targetId));
      return c.json({ id: targetId, role });
    } catch (e) {
      return handleError(c, e);
    }
  })

  /** Most-recent cache entries — useful for debugging AI cascade. */
  .get('/api/admin/ai-cache', async (c) => {
    try {
      const limitRaw = Number(c.req.query('limit') ?? 50);
      const limit = Math.max(1, Math.min(200, Number.isFinite(limitRaw) ? limitRaw : 50));
      const db = drizzle(c.env.DB, { schema });
      const rows = await db
        .select()
        .from(schema.aiCache)
        .orderBy(desc(schema.aiCache.createdAt))
        .limit(limit)
        .all();
      return c.json(
        rows.map((r) => ({
          cacheKey: r.cacheKey,
          kind: r.kind,
          expiresAt: r.expiresAt,
          createdAt: Math.floor(r.createdAt.getTime() / 1000),
          payloadBytes: r.payload.length,
        })),
      );
    } catch (e) {
      return handleError(c, e);
    }
  });