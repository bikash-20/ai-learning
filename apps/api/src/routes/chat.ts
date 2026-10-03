import { Hono, type Context } from 'hono';
import type { Env } from '../env';
import { resolveWorkersAiModels } from '../env';
import { requireAuth } from '../lib/requireAuth';
import { idemMiddleware, idemStore, rateLimit } from '../lib/ratelimit';
import { withCors } from '../lib/cors';
import { myChat } from '../ai/provider';
import { AllUpstreamError, UpstreamAuthError } from '../ai/cascade';
import { SYSTEM_TUTOR } from '../ai/prompt';
import { ChatRequest, ErrorCode } from '@quantara/shared';
import { drizzle } from 'drizzle-orm/d1';
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
 */
const buildChatStream = (
  c: Context<{ Bindings: Env; Variables: { userId: string } }>,
  db: ReturnType<typeof drizzle<typeof schema>>,
  userId: string,
  body: { messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> },
  system: string,
  idempKey: string | undefined,
  start: number,
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
      let streamError: { code: string; message: string; details?: unknown } | null = null;

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
          console.warn('workers_stream_fallback', {
            route: 'chat', model: primaryModel, reason: streamAttempt.reason,
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
            if (fbErr instanceof UpstreamAuthError) {
              streamError = { code: ErrorCode.UpstreamAuth, message: 'AI provider authentication failed.' };
            } else if (fbErr instanceof AllUpstreamError) {
              streamError = {
                code: ErrorCode.UpstreamUnavailable,
                message: fbErr.message,
                details: { cause: fbErr.cause },
              };
            } else {
              streamError = { code: ErrorCode.UpstreamUnavailable, message: 'AI service is temporarily unavailable.' };
            }
          }
        }

        // 3) Persist + analytics + `done` event. Always emit `done` so the
        //    client knows the stream is finished, even if the assistant
        //    row write fails (we log + still send `done`).
        if (outcome) {
          try {
            await db.insert(schema.chatMessage).values({
              id: crypto.randomUUID(),
              userId,
              role: 'assistant',
              content: outcome.text,
              provider: outcome.provider,
              model: outcome.model,
              tokens: outcome.tokens,
            });
          } catch (e) {
            console.warn('chat_assistant_persist_failed', { userId, err: String(e) });
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
          }));
        } else if (streamError) {
          controller.enqueue(sse('error', streamError));
        }
      } catch (e) {
        controller.enqueue(sse('error', { code: ErrorCode.UpstreamUnavailable, message: String(e) }));
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

    const rl = await rateLimit(c, 'chat');
    if (rl) return finalize(c, rl);

    const userId = c.get('userId');
    const db = drizzle(c.env.DB, { schema });
    const lastMsg = body.messages[body.messages.length - 1]!;
    const userMsgId = crypto.randomUUID();
    await db.insert(schema.chatMessage).values({
      id: userMsgId,
      userId,
      role: 'user',
      content: lastMsg.content,
    });

    const system = SYSTEM_TUTOR('B2');
    const start = Date.now();

    const stream = buildChatStream(c, db, userId, body, system, idempKey, start);

    const res = new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
        'X-Model-Used': '', // Authoritative value comes from the `done` event.
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