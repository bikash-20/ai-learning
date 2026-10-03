import { Hono, type Context } from 'hono';
import type { Env } from '../env';
import { requireAuth } from '../lib/requireAuth';
import { rateLimit } from '../lib/ratelimit';
import { handleError } from '../lib/errors';
import { chatJson } from '../ai/provider';
import { AllUpstreamError, UpstreamAuthError, JsonCascadeError } from '../ai/cascade';
import { QUIZ_GEN_PROMPT, EXPLAIN_PROMPT } from '../ai/prompt';
import { QuizFromTopicRequest, QuizItemsJson, QuizAttemptRequest, ErrorCode } from '@ai-learning/shared';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';

type Ctx = Context<{ Bindings: Env; Variables: { userId: string } }>;

/**
 * Map every cascade-level failure to a friendly, CORS-stamped JSON response.
 * Returns `null` when the failure isn't cascade-related (let `handleError` deal
 * with it).
 */
const cascadeError = (c: Ctx, e: unknown): Response | null => {
  if (e instanceof UpstreamAuthError) {
    return c.json({ code: ErrorCode.UpstreamAuth, message: 'AI provider authentication failed.' }, 502);
  }
  if (e instanceof JsonCascadeError) {
    return c.json(
      { code: ErrorCode.AIInvalid, message: "We couldn't generate a quiz right now — please try again." },
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

export const quizRoute = new Hono<{ Bindings: Env; Variables: { userId: string } }>()
  .post('/api/quiz/from-topic', requireAuth, async (c) => {
    try {
      const rl = await rateLimit(c, 'quizGen');
      if (rl) return rl;
      const body = QuizFromTopicRequest.parse(await c.req.json());
      const system = 'You generate CEFR English quiz items. Output JSON only.';
      const { parsed, out } = await chatJson(c.env, 'quizGen', {
        system,
        messages: [{ role: 'user', content: QUIZ_GEN_PROMPT(body.topic, body.level, body.n) }],
        temperature: 0.4,
        maxTokens: 1800,
      }, QuizItemsJson.parse);
      const items = parsed.items;
      if (items.length === 0) {
        return c.json(
          { code: ErrorCode.AIInvalid, message: "We couldn't generate a quiz right now — please try again." },
          502,
        );
      }

      const quizId = crypto.randomUUID();
      const db = drizzle(c.env.DB, { schema });
      await db.insert(schema.quiz).values({
        id: quizId,
        ownerId: c.get('userId'),
        source: 'ai',
        topic: body.topic,
        level: body.level,
      });
      const itemIds = items.map(() => crypto.randomUUID());
      await db.insert(schema.quizItem).values(
        items.map((it, i) => ({
          id: itemIds[i]!,
          quizId,
          prompt: it.prompt,
          options: it.options,
          answerIdx: it.answerIdx,
          explanation: it.explanation,
        })),
      );
      const itemsWithId = items.map((it, i) => ({ id: itemIds[i]!, ...it }));
      return c.json({ quizId, items: itemsWithId, provider: out.provider, model: out.model });
    } catch (e) {
      const friendly = cascadeError(c, e);
      if (friendly) return friendly;
      return handleError(c, e);
    }
  })

  .post('/api/quiz/attempt', requireAuth, async (c) => {
    try {
      const body = QuizAttemptRequest.parse(await c.req.json());
      const db = drizzle(c.env.DB, { schema });
      const dbItems = await db.select().from(schema.quizItem).where(eq(schema.quizItem.quizId, body.quizId));
      if (dbItems.length === 0) return c.json({ code: ErrorCode.NotFound, message: 'Quiz not found' }, 404);

      const attemptId = crypto.randomUUID();
      const userId = c.get('userId');
      const results: Array<{ itemId: string; correct: boolean; correctIdx: number; aiExplanation?: string }> = [];
      let score = 0;

      await db.insert(schema.quizAttempt).values({ id: attemptId, userId, quizId: body.quizId, score: 0 });

      for (const ans of body.answers) {
        const it = dbItems.find((x) => x.id === ans.itemId);
        if (!it) continue;
        const correct = it.answerIdx === ans.picked;
        if (correct) score++;
        let aiExplanation: string | undefined;
        if (!correct) {
          const correctText = it.options[it.answerIdx] ?? '';
          // Explain path uses the same cascade (parse errors are tolerated —
          // we just fall back to the static explanation). Never throw 5xx here.
          const exp = await chatJson(c.env, 'explain', {
            system: 'You are an English tutor. Output only the explanation text, no preamble.',
            messages: [{ role: 'user', content: EXPLAIN_PROMPT(it.prompt, correctText) }],
            maxTokens: 200,
            temperature: 0.3,
          }, (raw) => raw as string).catch((e) => {
            console.warn('explain_fallback', { route: 'explain', err: String(e) });
            return null;
          });
          aiExplanation = exp?.parsed ? String(exp.parsed).slice(0, 600) : it.explanation;
        }
        await db.insert(schema.attemptItem).values({
          id: crypto.randomUUID(),
          attemptId,
          itemId: it.id,
          picked: ans.picked,
          correct,
          ...(aiExplanation ? { aiExplanation } : {}),
        });
        results.push({ itemId: it.id, correct, correctIdx: it.answerIdx, ...(aiExplanation ? { aiExplanation } : {}) });
      }

      await db.update(schema.quizAttempt).set({ score, finishedAt: new Date() }).where(eq(schema.quizAttempt.id, attemptId));
      return c.json({ attemptId, score, total: dbItems.length, results });
    } catch (e) {
      const friendly = cascadeError(c, e);
      if (friendly) return friendly;
      return handleError(c, e);
    }
  });