import { Hono } from 'hono';
import type { Env } from '../env';
import { requireAuth } from '../lib/requireAuth';
import { handleError } from '../lib/errors';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../db/schema';
import { userPrefs } from '../db/schema';
import { eq } from 'drizzle-orm';
import { UserPrefsPatch, ErrorCode } from '@quantara/shared';

/**
 * GET /api/me/prefs    → returns the row (or defaults if none yet)
 * PUT  /api/me/prefs    → upsert partial prefs
 *
 * Stored 1:1 with `user.id`. Lazy-create on first read so we never
 * block the auth flow on prefs.
 */
export const meRoute = new Hono<{ Bindings: Env; Variables: { userId: string } }>()
  .get('/api/me/prefs', requireAuth, async (c) => {
    try {
      const db = drizzle(c.env.DB, { schema });
      const userId = c.get('userId');
      const rows = await db.select().from(userPrefs).where(eq(userPrefs.userId, userId)).limit(1).all();
      const row = rows[0];
      if (!row) {
        // Return defaults without writing — saves a row for users who
        // never visit /settings.
        return c.json({ aiExplain: true, theme: 'system' as const });
      }
      return c.json({ aiExplain: row.aiExplain, theme: row.theme });
    } catch (e) {
      return handleError(c, e);
    }
  })
  .put('/api/me/prefs', requireAuth, async (c) => {
    try {
      const body = UserPrefsPatch.parse(await c.req.json());
      if (Object.keys(body).length === 0) {
        return c.json({ code: ErrorCode.BadRequest, message: 'Empty patch' }, 400);
      }
      const db = drizzle(c.env.DB, { schema });
      const userId = c.get('userId');
      // Upsert: try update first; if 0 rows changed, insert.
      const updateSet: Partial<typeof schema.userPrefs.$inferInsert> = { updatedAt: new Date() };
      if (body.aiExplain !== undefined) updateSet.aiExplain = body.aiExplain;
      if (body.theme !== undefined) updateSet.theme = body.theme;
      const result = await db.update(schema.userPrefs).set(updateSet).where(eq(schema.userPrefs.userId, userId));
      if (result.meta?.changes === 0) {
        const insertRow: typeof schema.userPrefs.$inferInsert = {
          userId,
          aiExplain: body.aiExplain ?? true,
          theme: body.theme ?? 'system',
          updatedAt: new Date(),
        };
        await db.insert(schema.userPrefs).values(insertRow);
      }
      // Return the merged view.
      const after = await db.select().from(userPrefs).where(eq(userPrefs.userId, userId)).limit(1).all();
      const r = after[0]!;
      return c.json({ aiExplain: r.aiExplain, theme: r.theme });
    } catch (e) {
      return handleError(c, e);
    }
  });