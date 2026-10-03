import { Hono } from 'hono';
import type { Env } from '../env';
import { requireAuth } from '../lib/requireAuth';
import { idemMiddleware, idemStore, rateLimit } from '../lib/ratelimit';
import { handleError, err } from '../lib/errors';
import { chat as chatAI } from '../ai/provider';
import { SYSTEM_TUTOR } from '../ai/prompt';
import { ChatRequest, ErrorCode } from '@ai-learning/shared';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';

const enc = new TextEncoder();

const sse = (event: string, data: unknown) =>
  enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

export const chatRoute = new Hono<{ Bindings: Env; Variables: { userId: string } }>()
  .post('/api/chat', requireAuth, idemMiddleware, async (c) => {
    try {
      const idempKey = c.req.header('Idempotency-Key');
      const body = ChatRequest.parse(await c.req.json());

      const rl = await rateLimit(c, 'chat');
      if (rl) return rl;

      const userId = c.get('userId');
      const db = drizzle(c.env.DB, { schema });
      const last = body.messages.at(-1)!;
      const userMsgId = crypto.randomUUID();
      await db.insert(schema.chatMessage).values({
        id: userMsgId,
        userId,
        role: 'user',
        content: last.content,
      });

      const system = SYSTEM_TUTOR('B2');
      const start = Date.now();
      // We stream from Workers AI directly to keep first-token latency low.
      const model = (c.env.WORKERS_AI_MODEL ?? '@cf/meta/llama-3.3-70b-instruct') as string;
      let stream: ReadableStream<Uint8Array>;
      let provider: 'workers' | 'openrouter' = 'workers';
      let fullText = '';

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
                      fullText += j.response;
                      controller.enqueue(sse('token', { text: j.response }));
                    }
                  } catch {}
                }
              }
            } finally {
              controller.close();
            }
          },
        });
      } catch (e) {
        console.warn('workers_stream_fallback', String(e));
        provider = 'openrouter';
        const out = await chatAI(c.env, 'chat', { messages: body.messages, system }, { authoritative: false });
        fullText = out.text;
        stream = new ReadableStream({
          start(controller) {
            controller.enqueue(sse('token', { text: out.text }));
            controller.close();
          },
        });
      }

      // Persist assistant reply when stream finishes via the client reconnect/close hook
      // For v1 we persist on first chunk completion via the response itself; the helper below
      // appends a trailing `done` event with token estimate.
      const tail = new ReadableStream({
        async start(controller) {
          const reader = stream.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              controller.enqueue(value);
            }
            // Persist assistant message and emit done
            await db.insert(schema.chatMessage).values({
              id: crypto.randomUUID(),
              userId,
              role: 'assistant',
              content: fullText,
              provider,
              model,
              tokens: Math.ceil(fullText.length / 4),
            });
            controller.enqueue(sse('done', { provider, model, tokens: Math.ceil(fullText.length / 4) }));
          } catch (e) {
            controller.enqueue(sse('error', { code: ErrorCode.UpstreamUnavailable, message: String(e) }));
          } finally {
            controller.close();
            c.env.ANALYTICS?.writeDataPoint({
              blobs: [provider, model, 'chat'],
              doubles: [Math.ceil(fullText.length / 4), Date.now() - start, 0, provider === 'openrouter' ? 1 : 0],
              indexes: ['chat'],
            });
            if (idempKey) await idemStore(c, idempKey, 200, JSON.stringify({ ok: true }));
          }
        },
      });

      return new Response(tail, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      });
    } catch (e) {
      return handleError(c, e);
    }
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
      return c.json({ messages: rows });
    } catch (e) {
      return handleError(c, e);
    }
  });