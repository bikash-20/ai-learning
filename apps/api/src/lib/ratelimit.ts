import type { Context } from 'hono';
import type { Env } from '../env';
import { err } from './errors';
import { ErrorCode } from '@ai-learning/shared';

const BUCKETS = {
  chat: { limit: 30, windowMs: 24 * 60 * 60_000 },     // 30/day
  explain: { limit: 100, windowMs: 24 * 60 * 60_000 }, // 100/day (used inside /api/quiz/attempt)
  quizGen: { limit: 20, windowMs: 60 * 60_000 },       // 20/hour
  aiExplain: { limit: 50, windowMs: 60 * 60_000 },     // 50/hour (per-check /api/quiz/explain)
} as const;

export const rateLimit = async (c: Context, route: keyof typeof BUCKETS) => {
  const cfg = BUCKETS[route];
  const env = (c as { env: Env }).env;
  const userId = (c.get as (k: string) => string)('userId');
  const id = env.RATE_LIMITER.idFromName(userId);
  const stub = env.RATE_LIMITER.get(id) as DurableObjectStub & {
    check: (route: string, limit: number, windowMs: number) => Promise<{ ok: true } | { ok: false; remaining: number; resetAt: number }>;
    remaining: (route: string, limit: number) => Promise<{ remaining: number; resetAt: number }>;
  };
  const result = await stub.check(route, cfg.limit, cfg.windowMs);
  const rem = await stub.remaining(route, cfg.limit);
  c.header('X-RateLimit-Limit', String(cfg.limit));
  c.header('X-RateLimit-Remaining', String(rem.remaining));
  c.header('X-RateLimit-Reset', String(Math.floor(rem.resetAt / 1000)));
  if (!result.ok) {
    const retryAfter = Math.max(1, Math.ceil((rem.resetAt - Date.now()) / 1000));
    c.header('Retry-After', String(retryAfter));
    return err(c, 429, ErrorCode.RateLimited, 'Slow down — quota exceeded', { route, retryAfter });
  }
  return null;
};

export const idemMiddleware = async (c: Context): Promise<Response | null> => {
  const key = c.req.header('Idempotency-Key');
  if (!key) return null;
  const env = (c as { env: Env }).env;
  const id = env.RATE_LIMITER.idFromName('global-idem');
  const stub = env.RATE_LIMITER.get(id) as DurableObjectStub & {
    idemGet: (k: string) => Promise<{ status: number; body: string } | null>;
  };
  const cached = await stub.idemGet(key);
  return cached ? new Response(cached.body, { status: cached.status, headers: { 'Idempotent-Replay': 'true' } }) : null;
};

export const idemStore = async (c: Context, key: string, status: number, body: string) => {
  const env = (c as { env: Env }).env;
  const id = env.RATE_LIMITER.idFromName('global-idem');
  const stub = env.RATE_LIMITER.get(id) as DurableObjectStub & {
    idemPut: (k: string, s: number, b: string) => Promise<void>;
  };
  await stub.idemPut(key, status, body);
};