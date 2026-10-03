import { Hono } from 'hono';
import type { Env } from '../env';
import { requireAuth } from '../lib/requireAuth';
import { handleError } from '../lib/errors';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../db/schema';
import { userPrefs } from '../db/schema';
import { eq, desc, sql, and, isNotNull } from 'drizzle-orm';
import { UserPrefsPatch, ErrorCode } from '@quantara/shared';

/**
 * GET /api/me/prefs    → returns the row (or defaults if none yet)
 * PUT  /api/me/prefs    → upsert partial prefs
 *
 * Stored 1:1 with `user.id`. Lazy-create on first read so we never
 * block the auth flow on prefs.
 */
export const meRoute = new Hono<{ Bindings: Env; Variables: { userId: string } }>()
  /** Returns the signed-in user's role. Cheap, used by the web to
   *  decide whether to show admin surfaces. */
  .get('/api/me/role', requireAuth, async (c) => {
    try {
      const db = drizzle(c.env.DB, { schema });
      const userId = c.get('userId');
      const rows = await db
        .select({ role: schema.user.role })
        .from(schema.user)
        .where(eq(schema.user.id, userId))
        .limit(1)
        .all();
      return c.json({ role: rows[0]?.role ?? 'user' });
    } catch (e) {
      return handleError(c, e);
    }
  })
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
  })

  /**
   * Per-user progress analytics. Aggregates quiz_attempt + attempt_item
   * + quiz tables into a single payload the /progress page can render.
   *
   * Implementation note: D1 has limited SQL surface; we keep aggregations
   * in JS rather than fighting `GROUP BY` quirks. The user has at most a
   * few hundred attempts even after months of heavy use, so the in-memory
   * pass is fine.
   */
  .get('/api/me/progress', requireAuth, async (c) => {
    try {
      const db = drizzle(c.env.DB, { schema });
      const userId = c.get('userId');

      // Pull all the user's finished attempts + their items + the parent
      // quiz row (for topic + level). One round-trip per table — D1's
      // JOIN story is fine but we want explicit type inference.
      const attempts = await db
        .select()
        .from(schema.quizAttempt)
        .where(and(eq(schema.quizAttempt.userId, userId), isNotNull(schema.quizAttempt.finishedAt)))
        .all();
      if (attempts.length === 0) {
        return c.json({
          totalAttempts: 0,
          totalItems: 0,
          totalCorrect: 0,
          accuracy: 0,
          byLevel: {},
          weak: [],
          best: [],
          recent: [],
        });
      }
      const quizIds = attempts.map((a) => a.quizId);
      const quizzes = await db
        .select()
        .from(schema.quiz)
        .where(sql`${schema.quiz.id} IN (${sql.join(quizIds.map((id) => sql`${id}`), sql`, `)})`)
        .all();
      const quizById = new Map(quizzes.map((q) => [q.id, q]));

      const attemptItems = await db
        .select()
        .from(schema.attemptItem)
        .where(sql`${schema.attemptItem.attemptId} IN (${sql.join(attempts.map((a) => sql`${a.id}`), sql`, `)})`)
        .all();
      const itemIds = attemptItems.map((ai) => ai.itemId);
      // quizItems pulled only to ensure the parent table exists; not
      // currently used per-item in the aggregate below (we aggregate by
      // quiz level / topic which are already on `quiz`).
      if (itemIds.length) {
        await db
          .select()
          .from(schema.quizItem)
          .where(sql`${schema.quizItem.id} IN (${sql.join(itemIds.map((id) => sql`${id}`), sql`, `)})`)
          .all();
      }

      // Aggregate.
      const byLevel: Record<string, { correct: number; total: number }> = {};
      const byTopic: Record<string, { correct: number; total: number }> = {};
      let totalCorrect = 0;
      let totalItems = 0;
      for (const ai of attemptItems) {
        const attempt = attempts.find((a) => a.id === ai.attemptId);
        if (!attempt) continue;
        const quiz = quizById.get(attempt.quizId);
        if (!quiz) continue;
        const correct = ai.correct ? 1 : 0;
        totalCorrect += correct;
        totalItems += 1;
        const lvl = quiz.level;
        byLevel[lvl] = byLevel[lvl] ?? { correct: 0, total: 0 };
        byLevel[lvl]!.correct += correct;
        byLevel[lvl]!.total += 1;
        // Topic head (matches the truncated label we set in /api/quiz/from-passage
        // and the verbatim topic on /api/quiz/from-topic). For passage
        // quizzes this is "Passage: ..." — surface it but don't let it
        // dominate the weak/best list since it aggregates across texts.
        const topic = quiz.topic.startsWith('Passage:') ? 'Passage quizzes' : quiz.topic;
        byTopic[topic] = byTopic[topic] ?? { correct: 0, total: 0 };
        byTopic[topic]!.correct += correct;
        byTopic[topic]!.total += 1;
      }
      const totalAttempts = attempts.length;
      const accuracy = totalItems === 0 ? 0 : totalCorrect / totalItems;

      const topicRows = Object.entries(byTopic).map(([topic, v]) => ({
        topic,
        correct: v.correct,
        total: v.total,
        pct: v.total === 0 ? 0 : v.correct / v.total,
      }));
      // Filter to topics with ≥ 3 items so a single lucky hit doesn't
      // dominate the weak/best list.
      const meaningful = topicRows.filter((r) => r.total >= 3);
      const weak = [...meaningful].sort((a, b) => a.pct - b.pct).slice(0, 5);
      const best = [...meaningful].sort((a, b) => b.pct - a.pct).slice(0, 5);

      const recent = attempts
        .sort((a, b) => (b.finishedAt?.getTime() ?? 0) - (a.finishedAt?.getTime() ?? 0))
        .slice(0, 10)
        .map((a) => {
          const q = quizById.get(a.quizId);
          const answered = attemptItems.filter((ai) => ai.attemptId === a.id).length;
          return {
            quizId: a.quizId,
            topic: q?.topic ?? '(unknown)',
            level: (q?.level ?? 'B2') as 'A2' | 'B1' | 'B2' | 'C1',
            score: a.score,
            total: answered,
            finishedAt: a.finishedAt ? Math.floor(a.finishedAt.getTime() / 1000) : null,
          };
        });

      return c.json({
        totalAttempts,
        totalItems,
        totalCorrect,
        accuracy,
        byLevel,
        weak,
        best,
        recent,
      });
    } catch (e) {
      return handleError(c, e);
    }
  });

// Avoid an unused-import warning when the inferred quizItem map is empty.
void desc;