import { Hono } from 'hono';
import type { Env } from '../env';
import { requireAuth } from '../lib/requireAuth';
import { rateLimit } from '../lib/ratelimit';
import { handleError } from '../lib/errors';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';
import {
  ExamStartRequest,
  ExamSubmitRequest,
  ErrorCode,
} from '@quantara/shared';

/**
 * Map a 0..1 score fraction to a CEFR band. Coarse heuristic — exam
 * rules aren't defined yet, so this just gives the user a sense of
 * where they landed. Easy / hard mode get slightly different
 * thresholds so a Hard mode 80% reads as B2, not B1.
 */
const bandFor = (frac: number, difficulty: 'easy' | 'hard') => {
  const adj = difficulty === 'hard' ? 0.05 : 0;
  if (frac + adj >= 0.92) return 'c2';
  if (frac + adj >= 0.82) return 'c1';
  if (frac + adj >= 0.7) return 'b2';
  if (frac + adj >= 0.55) return 'b1';
  if (frac + adj >= 0.4) return 'a2';
  return 'a1';
};

export const examRoute = new Hono<{ Bindings: Env; Variables: { userId: string } }>()
  /**
   * Start an exam session.
   *
   * The response includes items WITHOUT answerIdx or explanation — the
   * client cannot peek. The server-side `answerKey` is stored on the
   * exam_attempt row and only surfaced on submit.
   */
  .post('/api/exam/run', requireAuth, async (c) => {
    try {
      const rl = await rateLimit(c, 'quizGen');
      if (rl) return rl;
      const body = ExamStartRequest.parse(await c.req.json());
      const db = drizzle(c.env.DB, { schema });

      const bankRows = await db
        .select()
        .from(schema.mcqBank)
        .where(eq(schema.mcqBank.difficulty, body.difficulty))
        .all();
      if (bankRows.length === 0) {
        return c.json(
          { code: ErrorCode.NotFound, message: 'Exam bank is empty — please run the seed script.' },
          503,
        );
      }
      const shuffled = [...bankRows].sort(() => Math.random() - 0.5);
      const picked = shuffled.slice(0, Math.min(body.n, shuffled.length));

      const examId = crypto.randomUUID();
      // Use the bank row's own id on the wire — it's already a UUID and
      // it's the key we use server-side for the answerKey lookup. The
      // client never sees answerIdx / explanation, so leaking the bank
      // row id is harmless.
      const bankIds = picked.map((it) => it.id);
      const answerKey: Record<string, { answerIdx: number; explanation: string }> = {};
      for (const row of picked) {
        answerKey[row.id] = { answerIdx: row.answerIdx, explanation: row.explanation };
      }

      await db.insert(schema.examAttempt).values({
        id: examId,
        userId: c.get('userId'),
        templateId: null,
        itemIds: bankIds,
        answerKey,
        kind: body.kind,
        level: body.level,
        difficulty: body.difficulty,
        durationSec: picked.length * 60, // 60s per question
      });

      const itemsWithId = picked.map((it) => ({
        id: it.id,
        prompt: it.prompt,
        options: it.options,
      }));
      return c.json({
        examId,
        durationSec: picked.length * 60,
        items: itemsWithId,
        provider: 'bank',
        model: body.difficulty === 'hard' ? 'hard-bank' : 'easy-bank',
      });
    } catch (e) {
      return handleError(c, e);
    }
  })

  /**
   * Submit answers. Server-verifies against the stored answerKey and
   * returns per-question verdict + explanation.
   */
  .post('/api/exam/submit', requireAuth, async (c) => {
    try {
      const body = ExamSubmitRequest.parse(await c.req.json());
      const db = drizzle(c.env.DB, { schema });
      const rows = await db
        .select()
        .from(schema.examAttempt)
        .where(eq(schema.examAttempt.id, body.examId))
        .limit(1)
        .all();
      const row = rows[0];
      if (!row) return c.json({ code: ErrorCode.NotFound, message: 'Exam not found' }, 404);
      if (row.userId !== c.get('userId')) {
        return c.json({ code: ErrorCode.Forbidden, message: 'Not your exam' }, 403);
      }
      const answerKey = row.answerKey as Record<string, { answerIdx: number; explanation: string }>;
      const bankIdsInOrder = Object.keys(answerKey);

      const answersById = new Map<string, number>();
      for (const a of body.answers) answersById.set(a.itemId, a.picked);

      const results = bankIdsInOrder.map((bankId) => {
        const correct = answerKey[bankId]!;
        const picked = answersById.has(bankId) ? answersById.get(bankId)! : null;
        return {
          itemId: bankId,
          picked,
          correct: picked === correct.answerIdx,
          correctIdx: correct.answerIdx,
          explanation: correct.explanation,
        };
      });

      const total = results.length;
      const score = results.filter((r) => r.correct).length;
      const frac = total === 0 ? 0 : score / total;
      const band = bandFor(frac, (row.difficulty as 'easy' | 'hard') ?? 'hard');

      await db
        .update(schema.examAttempt)
        .set({ score, finishedAt: new Date() })
        .where(eq(schema.examAttempt.id, body.examId));

      return c.json({
        examId: body.examId,
        score,
        total,
        band,
        results,
      });
    } catch (e) {
      return handleError(c, e);
    }
  });