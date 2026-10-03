import { Hono } from 'hono';
import type { Env } from '../env';
import { requireAuth } from '../lib/requireAuth';
import { rateLimit } from '../lib/ratelimit';
import { myChat } from '../ai/provider';
import { AllUpstreamError, UpstreamAuthError } from '../ai/cascade';
import { SYSTEM_STEM } from '../ai/prompt';
import { ChatRequest, ErrorCode } from '@quantara/shared';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import * as schema from '../db/schema';

/**
 * POST /api/chat
 *
 * Plain JSON endpoint, per the 2026-10-04 quality reset. Returns the
 * assistant reply as `{ text, provider, model, tokens, cached, latencyMs }`.
 * Streamed SSE can be reintroduced later — for now the request is short
 * enough that the cascade completes well within the chat latency budget
 * (≤ ~12s typical).
 *
 * Cascade: cache → Workers AI primary → Workers AI fallbacks → OpenRouter.
 * See `myChat` in src/ai/provider.ts. Failures bubble up as a 5xx with a
 * friendly code so the client renders a recoverable error.
 */
export const chatRoute = new Hono<{ Bindings: Env; Variables: { userId: string } }>()
  .post('/api/chat', requireAuth, async (c) => {
    const userId = c.get('userId');
    const start = Date.now();

    let body: ReturnType<typeof ChatRequest.parse>;
    try {
      body = ChatRequest.parse(await c.req.json());
    } catch (e) {
      return c.json(
        { code: ErrorCode.ValidationError, message: 'Invalid request', details: String(e) },
        400,
      );
    }

    const db = drizzle(c.env.DB, { schema });

    // 1) Resolve or create the conversation row.
    let conversationId = body.conversationId;
    if (!conversationId) {
      conversationId = crypto.randomUUID();
      await db.insert(schema.conversation).values({
        id: conversationId,
        userId,
        title: 'New chat',
        mode: body.mode,
      });
    } else {
      const owns = await db
        .select({ id: schema.conversation.id })
        .from(schema.conversation)
        .where(and(eq(schema.conversation.id, conversationId), eq(schema.conversation.userId, userId)))
        .limit(1);
      if (owns.length === 0) {
        return c.json({ code: ErrorCode.NotFound, message: 'Conversation not found' }, 404);
      }
    }

    // 2) Rate-limit per (user, conversation).
    const rl = await rateLimit(c, 'chat', conversationId);
    if (rl) return rl;

    // 3) Persist the user message.
    const lastMsg = body.messages[body.messages.length - 1]!;
    const userMsgId = crypto.randomUUID();
    await db.insert(schema.conversationMessage).values({
      id: userMsgId,
      conversationId,
      role: 'user',
      content: lastMsg.content,
    });

    // 4) Generate the assistant reply via the shared cascade helper.
    let out;
    try {
      out = await myChat(c.env, 'chat', {
        messages: body.messages,
        system: SYSTEM_STEM(body.mode),
        maxTokens: 1024,
      }, { kind: 'text' });
    } catch (e) {
      const latencyMs = Date.now() - start;
      console.warn('chat_upstream_failed', { userId, conversationId, latencyMs, err: String(e).slice(0, 200) });
      const code = e instanceof UpstreamAuthError
        ? ErrorCode.UpstreamAuth
        : e instanceof AllUpstreamError
          ? ErrorCode.UpstreamUnavailable
          : ErrorCode.UpstreamUnavailable;
      const message = e instanceof AllUpstreamError
        ? (e.message || 'AI service is temporarily unavailable.')
        : 'AI service is temporarily unavailable.';
      return c.json({ code, message }, code === ErrorCode.UpstreamAuth ? 502 : 503);
    }

    const latencyMs = Date.now() - start;

    // 5) Persist the assistant message + analytics. Failures are logged
    //    but the reply is still returned to the user.
    try {
      await db.insert(schema.conversationMessage).values({
        id: crypto.randomUUID(),
        conversationId,
        role: 'assistant',
        content: out.text,
        provider: out.provider,
        model: out.model,
        tokens: out.tokens,
      });
      await db
        .update(schema.conversation)
        .set({ updatedAt: new Date() })
        .where(eq(schema.conversation.id, conversationId));
    } catch (e) {
      console.warn('chat_assistant_persist_failed', { userId, conversationId, err: String(e) });
    }

    // Note: trackAI already fires inside `myChat`, so no per-route tracking here.

    return c.json({
      text: out.text,
      provider: out.provider,
      model: out.model,
      tokens: out.tokens,
      cached: !!out.cached,
      latencyMs,
      conversationId,
    });
  })
  .get('/api/chat/history', requireAuth, async (c) => {
    try {
      const userId = c.get('userId');
      const db = drizzle(c.env.DB, { schema });
      const { asc } = await import('drizzle-orm');
      const rows = await db
        .select({ role: schema.chatMessage.role, content: schema.chatMessage.content, createdAt: schema.chatMessage.createdAt })
        .from(schema.chatMessage)
        .where(eq(schema.chatMessage.userId, userId))
        .orderBy(asc(schema.chatMessage.createdAt));
      return c.json({ messages: rows });
    } catch (e) {
      return c.json({ code: ErrorCode.Internal, message: String(e) }, 500);
    }
  });