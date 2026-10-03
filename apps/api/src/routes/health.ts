import { Hono } from 'hono';
import type { Env } from '../env';
import { resolveWorkersAiModels } from '../env';
import { withCors } from '../lib/cors';
import { resolveModelList, __resetCascadeBreaker } from '../ai/cascade';

type ModelPing = {
  id: string;
  ok: boolean;
  latencyMs: number;
  status?: number;
  error?: string;
};

type HealthResult = {
  providers: {
    workers: ModelPing[];
    openrouter: ModelPing[];
  };
  generatedAt: number;
};

const CACHE_TTL_MS = 60_000;
// One cache slot per Worker isolate. Keyed by the minute-bucket so we evict
// implicitly when the bucket changes — no timer cleanup needed.
let cache: { bucket: number; result: HealthResult } | null = null;

/**
 * Tiny ping for one OpenRouter model. Hits the chat-completions endpoint
 * with max_tokens=5, capped at 5 seconds, just to verify reachability.
 */
const pingOpenRouter = async (env: Env, model: string): Promise<ModelPing> => {
  const start = Date.now();
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://quantara.app',
        'X-Title': 'quantara',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 5,
      }),
      signal: AbortSignal.timeout(5_000),
    });
    const latencyMs = Date.now() - start;
    if (res.ok) return { id: model, ok: true, latencyMs, status: res.status };
    await res.text().catch(() => '');
    return { id: model, ok: false, latencyMs, status: res.status, error: `status_${res.status}` };
  } catch (e) {
    return {
      id: model,
      ok: false,
      latencyMs: Date.now() - start,
      error: e instanceof Error ? e.message.slice(0, 80) : 'unknown',
    };
  }
};

/**
 * Tiny ping for one Workers AI model. Runs a single-turn completion with
 * max_tokens=5, capped at 5 seconds.
 */
const pingWorkers = async (env: Env, model: string): Promise<ModelPing> => {
  const start = Date.now();
  try {
    await Promise.race([
      env.AI.run(model as never, {
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 5,
      } as never),
      new Promise((_resolve, reject) =>
        setTimeout(() => reject(new Error('timeout')), 5_000),
      ),
    ]);
    return { id: model, ok: true, latencyMs: Date.now() - start };
  } catch (e) {
    return {
      id: model,
      ok: false,
      latencyMs: Date.now() - start,
      error: e instanceof Error ? e.message.slice(0, 80) : 'unknown',
    };
  }
};

export const healthRoute = new Hono<{ Bindings: Env; Variables: { userId: string } }>()
  .get('/api/health/models', async (c) => {
    const bucket = Math.floor(Date.now() / CACHE_TTL_MS);
    if (!cache || cache.bucket !== bucket) {
      __resetCascadeBreaker();
      const [workers, openrouter] = await Promise.all([
        Promise.all(resolveWorkersAiModels(c.env).map((m) => pingWorkers(c.env, m))),
        Promise.all(resolveModelList(c.env).map((m) => pingOpenRouter(c.env, m))),
      ]);
      cache = {
        bucket,
        result: {
          providers: { workers, openrouter },
          generatedAt: Date.now(),
        },
      };
    }

    const res = c.json(cache.result);
    return withCors(c.env, c.req.header('origin') ?? '', res);
  });