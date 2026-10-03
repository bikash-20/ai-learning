import { Hono, type Context } from 'hono';
import type { Env } from '../env';
import { resolveWorkersAiModels } from '../env';
import { requireAuth } from '../lib/requireAuth';
import { idemMiddleware, idemStore, rateLimit } from '../lib/ratelimit';
import { withCors } from '../lib/cors';
import { myChat } from '../ai/provider';
import { AllUpstreamError, UpstreamAuthError } from '../ai/cascade';
import { SYSTEM_STEM } from '../ai/prompt';
import { ChatRequest, ErrorCode } from '@quantara/shared';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import * as schema from '../db/schema';
import { trackAI } from '../lib/analytics';

const enc = new TextEncoder();

const sse = (event: string, data: unknown) =>
  enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

const sseComment = (text: string) =>
  enc.encode(`: ${text}\n\n`);

/**
 * Stamp CORS on a Response and return it. The chat endpoint streams its
 * response via a raw `Response` (so it can use a ReadableStream body) which
 * bypasses Hono's middleware chain — we have to stamp CORS by hand.
 */
const finalize = (c: { env: Env; req: { header: (k: string) => string | undefined } }, res: Response): Response => {
  return withCors(c.env, c.req.header('origin') ?? '', res);
};

/**
 * Generate a 3-5 word conversation title from the first user message.
 * Best-effort: uses `myChat` with a dedicated system prompt, then writes
 * the result back to `conversation.title`. Failures are silent — the user
 * can rename manually.
 */
const autoTitle = async (env: Env, userId: string, conversationId: string, firstMessage: string) => {
  try {
    const rl = await (async () => {
      const id = env.RATE_LIMITER.idFromName(userId);
      const stub = env.RATE_LIMITER.get(id) as DurableObjectStub & {
        check: (route: string, limit: number, windowMs: number) => Promise<{ ok: true } | { ok: false; remaining: number; resetAt: number }>;
      };
      return stub.check('chatTitle', 200, 24 * 60 * 60_000);
    })();
    if (!rl.ok) return;

    const out = await myChat(env, 'chat-title', {
      messages: [{ role: 'user', content: firstMessage }],
      system: `Return a 3-5 word conversation title for the user's first message. No quotes, no preamble, no punctuation. Use Title Case. Examples: "Bubble sort in Python", "Solve 2x plus 3 equals 11", "Big O for hash tables".`,
      maxTokens: 24,
      temperature: 0.3,
    }, { kind: 'text', authoritative: true });
    const title = (out.text || '').trim().split('\n')[0]!.replace(/^["'`]+|["'`]+$/g, '').slice(0, 80);
    if (!title) return;
    const db = drizzle(env.DB, { schema });
    await db
      .update(schema.conversation)
      .set({ title, updatedAt: new Date() })
      .where(and(eq(schema.conversation.id, conversationId), eq(schema.conversation.userId, userId)));
  } catch (e) {
    console.warn('chat_title_failed', { conversationId, err: String(e).slice(0, 160) });
  }
};

/**
 * Structured error envelope for the SSE `error` event. Routes re-use the
 * same `ErrorCode` constants the JSON routes use so the client can map
 * server-acknowledged failures to a friendly category.
 */
type StreamError = {
  code: typeof ErrorCode[keyof typeof ErrorCode];
  message: string;
  details?: unknown;
};
const streamError = (e: unknown): StreamError => {
  if (e instanceof UpstreamAuthError) {
    return { code: ErrorCode.UpstreamAuth, message: 'AI provider authentication failed.' };
  }
  if (e instanceof AllUpstreamError) {
    return {
      code: ErrorCode.UpstreamUnavailable,
      message: e.message || 'AI service is temporarily unavailable.',
      details: { cause: e.cause },
    };
  }
  return {
    code: ErrorCode.UpstreamUnavailable,
    message: 'AI service is temporarily unavailable.',
  };
};

/**
 * Try to stream tokens from the given Workers AI model. The controller
 * receives SSE `token` events. Returns the assembled text + latency, or
 * a structured error if the model never produced a token within the
 * watchdog window.
 *
 * Never throws — errors are returned as `{ kind: 'err', reason }` so the
 * caller can fall back to the non-streaming path.
 */
const NO_TOKEN_TIMEOUT_MS = 10_000;

const tryStream = async (
  env: Env,
  model: string,
  body: { messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> },
  system: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
): Promise<{ kind: 'ok'; text: string; firstTokenAtMs: number } | { kind: 'err'; reason: string }> => {
  const start = Date.now();
  let firstTokenAtMs = 0;
  let aborted = false;

  // Keepalive — every 4s. Prevents proxies from killing the connection
  // while we wait for the first token.
  const keepalive = setInterval(() => {
    if (aborted) return;
    try { controller.enqueue(sseComment('keepalive')); } catch { aborted = true; }
  }, 4_000);

  let aiRes: ReadableStream<Uint8Array>;
  try {
    aiRes = (await env.AI.run(model as never, {
      messages: [
        { role: 'system', content: system },
        ...body.messages,
      ],
      stream: true,
      max_tokens: 1024,
    } as never)) as ReadableStream<Uint8Array>;
  } catch (e) {
    clearInterval(keepalive);
    return { kind: 'err', reason: `exception:${String(e).slice(0, 80)}` };
  }

  const reader = aiRes.getReader();
  const dec = new TextDecoder();
  let text = '';
  const watchdog = setTimeout(() => {
    try { reader.cancel(); } catch { /* ignore */ }
  }, NO_TOKEN_TIMEOUT_MS);

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = dec.decode(value, { stream: true });
      for (const line of chunk.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        let tok = '';
        try {
          const j = JSON.parse(payload) as { response?: string };
          tok = j.response ?? '';
        } catch {
          continue;
        }
        if (!tok) continue;
        text += tok;
        if (firstTokenAtMs === 0) {
          firstTokenAtMs = Date.now() - start;
          clearTimeout(watchdog);
        }
        try {
          controller.enqueue(sse('token', { text: tok }));
        } catch {
          aborted = true;
          break;
        }
      }
      if (aborted) break;
    }
  } catch {
    // Stream broke mid-flight — treat as err so caller can fall back.
  }

  clearInterval(keepalive);
  clearTimeout(watchdog);

  if (text.length === 0) {
    return { kind: 'err', reason: 'empty_stream' };
  }
  return { kind: 'ok', text, firstTokenAtMs };
};

/**
 * Shared streaming pipeline. Builds a ReadableStream that emits token,
 * `done`, or `error` events. All the AI work + DB persistence + analytics
 * runs in the same async chain so the controller ordering is deterministic.
 *
 * Failure contract: if the stream ends without a `done` event, the final
 * frame MUST be an `error` SSE event with the real `ErrorCode`. The client
 * uses that to route to the right friendly category ("busy" vs "auth"
 * vs "rate_limited") instead of falling back to the generic "network"
 * regex match.
 */
const buildChatStream = (
  c: Context<{ Bindings: Env; Variables: { userId: string } }>,
  db: ReturnType<typeof drizzle<typeof schema>>,
  userId: string,
  body: { messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> },
  system: string,
  idempKey: string | undefined,
  start: number,
  conversationId: string,
  mode: string,
): ReadableStream<Uint8Array> => {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const env = c.env;
      const primaryModel = resolveWorkersAiModels(env)[0]!;
      let outcome: {
        provider: 'workers' | 'openrouter';
        model: string;
        text: string;
        tokens: number;
        cached: boolean;
        firstTokenAtMs: number;
      } | null = null;
      let streamErr: StreamError | null = null;

      try {
        // 1) Try streaming from Workers AI primary model.
        const streamAttempt = await tryStream(env, primaryModel, body, system, controller);
        if (streamAttempt.kind === 'ok') {
          outcome = {
            provider: 'workers',
            model: primaryModel,
            text: streamAttempt.text,
            tokens: Math.ceil(streamAttempt.text.length / 4),
            cached: false,
            firstTokenAtMs: streamAttempt.firstTokenAtMs,
          };
        } else {
          console.warn('chat_stream_diagnostic', {
            stage: 'tryStream',
            model: primaryModel,
            reason: streamAttempt.reason,
            latencyMs: Date.now() - start,
          });

          // 2) Fallback — non-streaming myChat (cache → workersCascade →
          //    openRouterCascade). One token event so the client still
          //    renders the reply.
          try {
            const out = await myChat(env, 'chat', {
              messages: body.messages,
              system,
              maxTokens: 1024,
            }, { kind: 'text' });
            outcome = {
              provider: out.provider,
              model: out.model,
              text: out.text,
              tokens: out.tokens,
              cached: !!out.cached,
              firstTokenAtMs: Date.now() - start,
            };
            controller.enqueue(sse('token', { text: out.text }));
          } catch (fbErr) {
            streamErr = streamError(fbErr);
            console.warn('chat_stream_diagnostic', {
              stage: 'myChat_fallback',
              model: primaryModel,
              reason: streamErr.message,
              code: streamErr.code,
              latencyMs: Date.now() - start,
            });
          }
        }

        // 3) Persist + analytics + `done` event. Always emit `done` so the
        //    client knows the stream is finished, even if the assistant
        //    row write fails (we log + still send `done`).
        if (outcome) {
          try {
            await db.insert(schema.conversationMessage).values({
              id: crypto.randomUUID(),
              conversationId,
              role: 'assistant',
              content: outcome.text,
              provider: outcome.provider,
              model: outcome.model,
              tokens: outcome.tokens,
            });
            // Bump conversation.updatedAt so the history list reorders.
            await db
              .update(schema.conversation)
              .set({ updatedAt: new Date() })
              .where(eq(schema.conversation.id, conversationId));
          } catch (e) {
            console.warn('chat_assistant_persist_failed', { userId, conversationId, err: String(e) });
          }
          trackAI(env, {
            provider: outcome.provider,
            model: outcome.model,
            tokens: outcome.tokens,
            route: 'chat',
            latencyMs: Date.now() - start,
            cacheHit: outcome.cached ? 1 : 0,
            fallback: outcome.provider === 'openrouter' ? 1 : 0,
          });
          controller.enqueue(sse('done', {
            provider: outcome.provider,
            model: outcome.model,
            tokens: outcome.tokens,
            cached: outcome.cached,
            firstTokenAtMs: outcome.firstTokenAtMs,
            conversationId,
            mode,
          }));
        } else if (streamErr) {
          // Always emit the structured `error` event so the client can map
          // it to the right friendly category — no more "No connection"
          // for upstream failures.
          controller.enqueue(sse('error', streamErr));
        } else {
          // Defensive: nothing succeeded and no structured error was set.
          // Should never happen, but if it does, surface an upstream error
          // rather than closing silently (which the client would treat as
          // a network drop).
          controller.enqueue(sse('error', {
            code: ErrorCode.UpstreamUnavailable,
            message: 'AI service did not respond.',
          } satisfies StreamError));
        }
      } catch (e) {
        console.warn('chat_stream_diagnostic', {
          stage: 'unhandled_exception',
          err: String(e).slice(0, 200),
          latencyMs: Date.now() - start,
        });
        try {
          controller.enqueue(sse('error', {
            code: ErrorCode.Internal,
            message: 'Internal server error.',
          } satisfies StreamError));
        } catch { /* controller may already be closed */ }
      } finally {
        try { controller.close(); } catch { /* already closed */ }
        if (idempKey) await idemStore(c, idempKey, 200, JSON.stringify({ ok: true }));
      }
    },
  });
};

export const chatRoute = new Hono<{ Bindings: Env; Variables: { userId: string } }>()
  .post('/api/chat', requireAuth, idemMiddleware, async (c) => {
    const idempKey = c.req.header('Idempotency-Key');
    let parsed: ReturnType<typeof ChatRequest.parse>;
    try {
      parsed = ChatRequest.parse(await c.req.json());
    } catch (e) {
      return finalize(c, new Response(JSON.stringify({ code: ErrorCode.ValidationError, message: 'Invalid request', details: String(e) }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }));
    }
    const body = parsed;

    const userId = c.get('userId');
    const db = drizzle(c.env.DB, { schema });

    // 1) Resolve conversation. Create one if the request didn't bring an id.
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
      // Verify ownership (404 if it belongs to a different user).
      const owns = await db
        .select({ id: schema.conversation.id })
        .from(schema.conversation)
        .where(and(eq(schema.conversation.id, conversationId), eq(schema.conversation.userId, userId)))
        .limit(1);
      if (owns.length === 0) {
        return finalize(c, new Response(JSON.stringify({ code: ErrorCode.NotFound, message: 'Conversation not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }));
      }
    }

    // 2) Rate-limit per (user, conversation).
    const rl = await rateLimit(c, 'chat', conversationId);
    if (rl) return finalize(c, rl);

    // 3) Persist the user message into the new conversation.
    const lastMsg = body.messages[body.messages.length - 1]!;
    const userMsgId = crypto.randomUUID();
    await db.insert(schema.conversationMessage).values({
      id: userMsgId,
      conversationId,
      role: 'user',
      content: lastMsg.content,
    });

    // 4) If this is the first user message in a fresh conversation, kick
    //    off an auto-title best-effort. Failures are silent.
    const existing = await db
      .select({ id: schema.conversationMessage.id })
      .from(schema.conversationMessage)
      .where(eq(schema.conversationMessage.conversationId, conversationId))
      .limit(2);
    if (existing.length === 1) {
      // First user message — schedule a title generator.
      c.executionCtx.waitUntil(autoTitle(c.env, userId, conversationId, lastMsg.content));
    }

    const system = SYSTEM_STEM(body.mode);
    const start = Date.now();
    const primaryModel = resolveWorkersAiModels(c.env)[0]!;

    const stream = buildChatStream(c, db, userId, body, system, idempKey, start, conversationId, body.mode);

    const res = new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
        // Stamp the primary model up-front so a stalled stream (or a
        // connection that drops before any SSE frame arrives) still tells
        // the client which model was tried. The authoritative value comes
        // from the `done` event once a real answer is produced.
        'X-Model-Used': primaryModel,
        'X-Conversation-Id': conversationId,
      },
    });
    return finalize(c, res);
  })
  .get('/api/chat/history', requireAuth, async (c) => {
    try {
      const userId = c.get('userId');
      const db = drizzle(c.env.DB, { schema });
      const { eq, asc } = await import('drizzle-orm');
      const rows = await db
        .select({ role: schema.chatMessage.role, content: schema.chatMessage.content, createdAt: schema.chatMessage.createdAt })
        .from(schema.chatMessage)
        .where(eq(schema.chatMessage.userId, userId))
        .orderBy(asc(schema.chatMessage.createdAt))
        .limit(200);
      return finalize(c, c.json({ messages: rows }));
    } catch (e) {
      return finalize(c, new Response(JSON.stringify({ code: 'CHAT_HISTORY_FAILED', message: String(e) }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }));
    }
  });