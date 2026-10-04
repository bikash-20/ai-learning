import { Hono } from 'hono';
import type { Env } from '../env';
import { requireAuth } from '../lib/requireAuth';
import { rateLimit } from '../lib/ratelimit';
import { trackAI } from '../lib/analytics';
import {
  openRouterStreamCascade,
  AllUpstreamError,
  UpstreamAuthError,
} from '../ai/cascade';
import { SYSTEM_STEM } from '../ai/prompt';
import { ChatRequest, ErrorCode } from '@quantara/shared';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import * as schema from '../db/schema';

/**
 * POST /api/chat
 *
 * Streaming SSE endpoint. The client (apps/web/app/(app)/chat/page.tsx)
 * consumes the SSE stream and renders tokens as they arrive. Frame format:
 *
 *   event: token\n
 *   data: {"text":"..."}\n
 *   \n
 *
 *   event: done\n
 *   data: {"provider":"openrouter","model":"...","tokens":0,"firstTokenAtMs":M,"conversationId":"..."}\n
 *   \n
 *
 *   event: error\n
 *   data: {"code":"UPSTREAM_UNAVAILABLE","message":"..."}\n
 *   \n
 *
 * Cascade (chat-specific): OpenRouter `stream: true` with an 8s first-token
 * watchdog per model. If a model fails to produce ANY token within 8s we
 * abort that stream and try the next one — a stalled free-tier model can't
 * burn the whole chat budget. Once a stream yields its first token we
 * read it to completion (no further timeouts — that would chop the reply
 * in half).
 *
 * No 24h cache: chat is conversational. Cache keys for chat would depend on
 * the full history, so only idle clients would ever collide, and users
 * expect their reply to reflect what they actually typed.
 *
 * Workers AI is intentionally NOT tried for chat — streaming SSE through
 * Workers AI requires gateway plumbing we haven't wired, and the chat
 * latency target (~12s typical) is fine on OpenRouter alone. Workers AI
 * remains primary for JSON routes (flashcards/quiz).
 *
 * Failure modes:
 *   - Pre-token failure (no model produced any token): the SSE stream
 *     is closed without `event: token` having fired. The client
 *     interprets `bytesReceived === 0 && !taggedCat` as a network error
 *     (already wired in chat/page.tsx). We log the upstream failure for
 *     observability.
 *   - Mid-stream failure (first token landed, then transport died):
 *     `event: error` frame is appended at the tail of the stream so the
 *     client keeps the partial reply + renders a friendly error.
 *   - Successful stream: `event: done` frame closes it; the assistant
 *     message is persisted to D1 (best-effort) after the close.
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

    // 4) Build the SSE stream. The `start` callback runs immediately when
    //    the stream is consumed; we use closure variables to track first-
    //    token state so a mid-stream failure can be surfaced as an SSE
    //    error frame at the tail (keeping the partial reply visible) rather
    //    than a sudden 503.
    const enc = new TextEncoder();
    let firstTokenSeen = false;

    const stream = new ReadableStream<Uint8Array>({
      async start(ctrl) {
        const sendSse = (event: string, data: unknown) => {
          try {
            ctrl.enqueue(
              enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
            );
          } catch {
            // Stream already closed (client aborted). Swallow.
          }
        };

        try {
          const sink = (event: { kind: 'token'; text: string }) => {
            if (event.kind === 'token') {
              if (!firstTokenSeen) firstTokenSeen = true;
              sendSse('token', { text: event.text });
            }
          };

          const result = await openRouterStreamCascade(
            c.env,
            {
              messages: body.messages,
              system: SYSTEM_STEM(body.mode),
              maxTokens: 1024,
              route: 'chat',
            },
            sink,
          );

          const latencyMs = Date.now() - start;

          sendSse('done', {
            provider: 'openrouter',
            model: result.model,
            tokens: 0,
            cached: false,
            firstTokenAtMs: result.firstTokenAtMs,
            conversationId,
            mode: body.mode,
          });

          trackAI(c.env, {
            provider: 'openrouter',
            model: result.model,
            tokens: 0,
            route: 'chat',
            latencyMs,
            cacheHit: 0,
            fallback: 1,
          });
          try {
            await db.insert(schema.conversationMessage).values({
              id: crypto.randomUUID(),
              conversationId,
              role: 'assistant',
              content: result.text,
              provider: 'openrouter',
              model: result.model,
              tokens: 0,
            });
            await db
              .update(schema.conversation)
              .set({ updatedAt: new Date() })
              .where(eq(schema.conversation.id, conversationId));
          } catch (e) {
            console.warn('chat_assistant_persist_failed', { userId, conversationId, err: String(e) });
          }
          ctrl.close();
        } catch (e) {
          const latencyMs = Date.now() - start;
          console.warn('chat_upstream_failed', {
            userId, conversationId, latencyMs,
            firstTokenSeen, err: String(e).slice(0, 200),
          });
          let code: string = ErrorCode.UpstreamUnavailable;
          let message = 'AI service is temporarily unavailable.';
          if (e instanceof UpstreamAuthError) {
            code = ErrorCode.UpstreamAuth;
            message = 'AI service auth failed.';
          } else if (e instanceof AllUpstreamError) {
            code = ErrorCode.UpstreamUnavailable;
            message = e.message || 'AI service is temporarily unavailable.';
          }
          // If we got at least one token out, emit an SSE error frame so
          // the client can keep the partial reply + render a friendly
          // error. Otherwise the stream just closes — the client treats
          // empty bytes as a network error and falls through to its retry.
          if (firstTokenSeen) {
            sendSse('error', { code, message });
          }
          ctrl.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
        'X-Conversation-Id': conversationId,
      },
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