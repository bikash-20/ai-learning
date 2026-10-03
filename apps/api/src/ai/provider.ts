import type { Env } from '../env';
import { HAIKU_MODEL, resolveWorkersAiModels } from '../env';
import { trackAI } from '../lib/analytics';
import { cacheGet, cachePut, cacheKey, type CacheKind } from '../lib/aicache';
import type { ChatMessage } from '@ai-learning/shared';
import {
  openRouterCascade,
  openRouterCascadeJson,
  workersCascade,
  AllUpstreamError,
  UpstreamAuthError,
  JsonCascadeError,
  type CascadeResult,
} from './cascade';

export type ChatInput = {
  messages: ChatMessage[];
  system?: string;
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
};

export type ChatOutput = {
  text: string;
  provider: 'workers' | 'openrouter';
  model: string;
  tokens: number;
  cached?: boolean;
};

const HEDGE = /\b(i'?m not sure|i think maybe|as an ai|as a language model|it depends|could be|might be)\b/i;

const messagesToOpenAI = (msgs: ChatMessage[], system?: string) => [
  ...(system ? [{ role: 'system' as const, content: system }] : []),
  ...msgs.map((m) => ({ role: m.role, content: m.content })),
];

const stripJsonFence = (s: string) =>
  s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();

/** TTLs in seconds. Per-kind so explanations can outlive free-tier quotas. */
const TTL: Record<CacheKind, number> = {
  text: 24 * 60 * 60,        // 24h
  json: 7 * 24 * 60 * 60,    // 7d (quiz items)
  explanation: 14 * 24 * 60 * 60, // 14d (explanations are stable per (q, answer))
};

/**
 * Stable, low-collision cache key per route. The route + temperature +
 * maxTokens are factored in so e.g. `chat` and `chatJson` don't collide.
 */
const keyFor = (route: string, kind: CacheKind, input: ChatInput) =>
  cacheKey([
    'v1',
    kind,
    route,
    input.system ?? '',
    JSON.stringify(input.messages),
    input.temperature ?? 0.4,
    input.maxTokens ?? 1024,
  ]);

/**
 * Unified AI entry. Cache → Workers AI list → OpenRouter cascade.
 *
 * Caching: D1 ai_cache keyed by (route, kind, system, messages, params).
 * Dedups across users so popular (topic, level, n) quizzes aren't regenerated.
 * Cache misses are non-fatal — we just keep going to the cascade.
 *
 * Returns a `ChatOutput` that always carries `provider` and `model`, so the
 * UI can show "via <model>" and the chat route can stamp `X-Model-Used`.
 *
 * Re-throws `UpstreamAuthError` and `AllUpstreamError` from the cascade so
 * the route layer can surface a friendly 502/503 + CORS-stamped body.
 */
export const myChat = async (
  env: Env,
  route: string,
  input: ChatInput,
  opts: { kind?: CacheKind; authoritative?: boolean } = {},
): Promise<ChatOutput> => {
  const kind: CacheKind = opts.kind ?? 'text';
  const start = Date.now();
  const key = await keyFor(route, kind, input);

  // 1) Cache lookup.
  try {
    const cached = await cacheGet(env, key);
    if (cached) {
      console.log('ai_cache_hit', { route, kind, model: cached.model });
      trackAI(env, {
        provider: cached.provider,
        model: cached.model,
        tokens: cached.tokens,
        route,
        latencyMs: Date.now() - start,
        cacheHit: 1,
        fallback: 0,
      });
      return { ...cached, cached: true };
    }
  } catch (e) {
    console.warn('ai_cache_get_failed', { route, kind, err: String(e) });
  }

  // 2) Workers AI primary tier.
  try {
    const w = await workersCascade(env, { ...input, route });
    const out: ChatOutput = { ...w, cached: false };
    trackAI(env, { ...out, route, latencyMs: Date.now() - start, cacheHit: 0, fallback: 0 });
    // Cache best-effort.
    await cachePut(env, key, kind, {
      text: out.text,
      provider: out.provider,
      model: out.model,
      tokens: out.tokens,
    }, TTL[kind]);
    return out;
  } catch (e) {
    console.warn('workers_ai_fallback', { route, err: String(e) });
  }

  // 3) OpenRouter cascade.
  const fallback = await openRouterCascade(env, { ...input, route });
  const out: ChatOutput = { ...fallback, cached: false };
  trackAI(env, { ...out, route, latencyMs: Date.now() - start, cacheHit: 0, fallback: 1 });
  await cachePut(env, key, kind, {
    text: out.text,
    provider: out.provider,
    model: out.model,
    tokens: out.tokens,
  }, TTL[kind]);
  return out;
};

/**
 * Strict JSON chat. Same two-tier cascade as `myChat`, but additionally
 * treats malformed JSON as a fall-through reason so the next model is
 * tried instead of returning 500.
 *
 *   1. Cache lookup.
 *   2. Workers AI → parse → fall through on parse fail.
 *   3. OpenRouter JSON cascade (existing) → fall through on parse fail.
 *
 * Throws `JsonCascadeError` (→ 502), `AllUpstreamError` (→ 503),
 * `UpstreamAuthError` (→ 502) — all CORS-stamped by the route.
 */
export const chatJson = async <T>(
  env: Env,
  route: string,
  input: ChatInput,
  parse: (raw: unknown) => T,
): Promise<{ parsed: T; out: ChatOutput }> => {
  const kind: CacheKind = 'json';
  const start = Date.now();
  const key = await keyFor(route, kind, input);

  const tryParse = (txt: string): T | null => {
    try {
      return parse(JSON.parse(stripJsonFence(txt)));
    } catch {
      return null;
    }
  };

  // 1) Cache lookup — return the parsed payload directly.
  try {
    const cached = await cacheGet(env, key);
    if (cached) {
      const parsed = tryParse(cached.text);
      if (parsed !== null) {
        console.log('ai_cache_hit', { route, kind, model: cached.model });
        trackAI(env, {
          provider: cached.provider, model: cached.model,
          tokens: cached.tokens, route, latencyMs: Date.now() - start, cacheHit: 1, fallback: 0,
        });
        return {
          parsed,
          out: { text: cached.text, provider: cached.provider, model: cached.model, tokens: cached.tokens, cached: true },
        };
      }
    }
  } catch (e) {
    console.warn('ai_cache_get_failed', { route, kind, err: String(e) });
  }

  // 2) Workers AI primary.
  try {
    const w = await workersCascade(env, { ...input, route });
    const parsed = tryParse(w.text);
    if (parsed !== null) {
      const out: ChatOutput = { ...w, cached: false };
      trackAI(env, { ...out, route, latencyMs: Date.now() - start, cacheHit: 0, fallback: 0 });
      await cachePut(env, key, kind, { text: out.text, provider: out.provider, model: out.model, tokens: out.tokens }, TTL[kind]);
      return { parsed, out };
    }
    console.warn('chatJson_workers_unparseable', { route, len: w.text.length });
  } catch (e) {
    if (e instanceof UpstreamAuthError) throw e;
    if (e instanceof AllUpstreamError) throw e;
    console.warn('chatJson_workers_fallthrough', { route, err: String(e) });
  }

  // 3) OpenRouter JSON cascade.
  const { parsed, result } = await openRouterCascadeJson(
    env,
    { ...input, temperature: input.temperature ?? 0.4, route },
    parse,
  );
  const out: ChatOutput = {
    text: result.text,
    provider: 'openrouter',
    model: result.model,
    tokens: result.tokens,
    cached: false,
  };
  trackAI(env, { ...out, route, latencyMs: Date.now() - start, cacheHit: 0, fallback: 1 });
  await cachePut(env, key, kind, { text: out.text, provider: out.provider, model: out.model, tokens: out.tokens }, TTL[kind]);
  return { parsed, out };
};

/**
 * Back-compat shim used by the chat streaming route. Tries Workers AI on
 * the configured primary model, falls back to the OpenRouter cascade.
 *
 * New callers should use `myChat` (cached) instead.
 */
export const chat = async (
  env: Env,
  route: string,
  input: ChatInput,
  opts: { authoritative?: boolean } = {},
): Promise<ChatOutput> => {
  const forwarded: { kind: 'text'; authoritative?: boolean } = { kind: 'text' };
  if (opts.authoritative !== undefined) forwarded.authoritative = opts.authoritative;
  return myChat(env, route, input, forwarded);
};

/** Back-compat: legacy direct Workers AI call. */
export const workersChat = async (env: Env, input: ChatInput): Promise<ChatOutput> => {
  const model = env.WORKERS_AI_MODEL ?? HAIKU_MODEL;
  const res = await env.AI.run(model as never, {
    messages: messagesToOpenAI(input.messages, input.system),
    max_tokens: input.maxTokens ?? 1024,
    temperature: input.temperature ?? 0.4,
  } as never);
  const r = res as { response?: string; usage?: { tokens?: number } };
  return { text: r.response ?? '', provider: 'workers', model, tokens: r.usage?.tokens ?? 0, cached: false };
};

// Re-export error types so existing route imports keep working.
export { AllUpstreamError, UpstreamAuthError, JsonCascadeError };
export type { CascadeResult };

// Mark `HEDGE` and `messagesToOpenAI` as used (kept for downstream callers).
void HEDGE;
void messagesToOpenAI;
void resolveWorkersAiModels;