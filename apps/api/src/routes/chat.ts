import { Hono } from 'hono';
import type { Env } from '../env';
import { requireAuth } from '../lib/requireAuth';
import { idemMiddleware, idemStore, rateLimit } from '../lib/ratelimit';
import { handleError } from '../lib/errors';
import { withCors } from '../lib/cors';
import { openRouterCascade, AllUpstreamError, UpstreamAuthError } from '../ai/cascade';
import { SYSTEM_TUTOR } from '../ai/prompt';
import { ChatRequest, ErrorCode } from '@quantara/shared';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';

const enc = new TextEncoder();

const sse = (event: string, data: unknown) =>
  enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

/**
 * Stamp CORS on a Response and return it. The chat endpoint streams its
 * response via a raw `Response` (so it can use a ReadableStream body) which
 * bypasses Hono's middleware chain — we have to stamp CORS by hand.
 */
const finalize = (c: { env: Env; req: { header: (k: string) => string | undefined } }, res: Response): Response => {
  return withCors(c.env, c.req.header('origin') ?? '', res);
};

const errJson = (c: { env: Env; req: { header: (k: string) => string | undefined } }, status: number, code: string, message: string, details?: unknown): Response => {
  const body = JSON.stringify({ code, message, ...(details === undefined ? {} : { details }) });
  return finalize(c, new Response(body, {
    status,
    headers: { 'Content-Type': 'application/json', 'X-Model-Used': 'none' },
  }));
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
    const model = (c.env.WORKERS_AI_MODEL ?? '@cf/meta/llama-3.3-70b-instruct') as string;

    type StreamState = {
      provider: 'workers' | 'openrouter';
      model: string;
      fullText: string;
    };
    const state: StreamState = { provider: 'workers', model, fullText: '' };

    let stream: ReadableStream<Uint8Array>;
    try {
      const aiRes = await c.env.AI.run(model as never, {
        messages: [{ role: 'system', content: system }, ...body.messages],
        stream: true,
        max_tokens: 1024,
      } as never);
      const r = aiRes as ReadableStream<Uint8Array>;
      stream = new ReadableStream({
        async start(controller) {
          const reader = r.getReader();
          const dec = new TextDecoder();
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              const chunk = dec.decode(value, { stream: true });
              for (const line of chunk.split('\n')) {
                if (!line.startsWith('data:')) continue;
                const payload = line.slice(5).trim();
                if (!payload || payload === '[DONE]') continue;
                try {
                  const j = JSON.parse(payload) as { response?: string };
                  if (j.response) {
                    state.fullText += j.response;
                    controller.enqueue(sse('token', { text: j.response }));
                  }
                } catch {
                  /* malformed SSE line, skip */
                }
              }
            }
          } finally {
            controller.close();
          }
        },
      });
    } catch (e) {
      // Workers AI unavailable — fall back to OpenRouter cascade.
      console.warn('workers_stream_fallback', { route: 'chat', err: String(e) });
      try {
        const fallback = await openRouterCascade(c.env, {
          messages: body.messages,
          system,
          maxTokens: 1024,
          route: 'chat',
        });
        state.provider = 'openrouter';
        state.model = fallback.model;
        state.fullText = fallback.text;
        stream = new ReadableStream({
          start(controller) {
            controller.enqueue(sse('token', { text: fallback.text }));
            controller.close();
          },
        });
      } catch (fbErr) {
        // Friendly JSON, never empty body, CORS stamped.
        if (fbErr instanceof UpstreamAuthError) {
          return errJson(c, 502, ErrorCode.UpstreamAuth, 'AI provider authentication failed.');
        }
        if (fbErr instanceof AllUpstreamError) {
          return errJson(c, 503, ErrorCode.UpstreamUnavailable, fbErr.message, { cause: fbErr.cause });
        }
        return errJson(c, 502, ErrorCode.UpstreamUnavailable, 'AI service is temporarily unavailable.');
      }
    }

    const tail = new ReadableStream({
      async start(controller) {
        const reader = stream.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
          await db.insert(schema.chatMessage).values({
            id: crypto.randomUUID(),
            userId,
            role: 'assistant',
            content: state.fullText,
            provider: state.provider,
            model: state.model,
            tokens: Math.ceil(state.fullText.length / 4),
          });
          controller.enqueue(sse('done', {
            provider: state.provider,
            model: state.model,
            tokens: Math.ceil(state.fullText.length / 4),
          }));
        } catch (e) {
          controller.enqueue(sse('error', { code: ErrorCode.UpstreamUnavailable, message: String(e) }));
        } finally {
          controller.close();
          c.env.ANALYTICS?.writeDataPoint({
            blobs: [state.provider, state.model, 'chat'],
            doubles: [Math.ceil(state.fullText.length / 4), Date.now() - start, 0, state.provider === 'openrouter' ? 1 : 0],
            indexes: ['chat'],
          });
          if (idempKey) await idemStore(c, idempKey, 200, JSON.stringify({ ok: true }));
        }
      },
    });

    const res = new Response(tail, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
        'X-Model-Used': state.model,
      },
    });
    return finalize(c, res);
  })
  .get('/api/chat/history', requireAuth, async (c) => {
    try {
      const userId = c.get('userId');
      const db = drizzle(c.env.DB, { schema });
      const rows = await db
        .select({ role: schema.chatMessage.role, content: schema.chatMessage.content, createdAt: schema.chatMessage.createdAt })
        .from(schema.chatMessage)
        .where(eq(schema.chatMessage.userId, userId))
        .orderBy(schema.chatMessage.createdAt)
        .limit(200);
      return finalize(c, c.json({ messages: rows }));
    } catch (e) {
      return finalize(c, handleError(c, e));
    }
  });