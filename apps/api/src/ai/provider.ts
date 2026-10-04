import type { Env } from '../env';
import { trackAI } from '../lib/analytics';
import { cacheGet, cachePut, cacheKey, type CacheKind } from '../lib/aicache';
import type { ChatMessage } from '@quantara/shared';
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

/**
 * Per-tier deadlines. Each tier owns its full budget — Workers AI failure
 * (e.g. cold start timeout) must not consume OpenRouter's budget.
 *
 *   - Workers AI: 7s total. The cascade walks at most `WORKERS_MAX_MODELS`
 *     models in `cascade.ts`, so 7s covers two cold starts at ~3.5s each.
 *   - OpenRouter: 18s starting WHEN THE TIER STARTS (not at request start).
 *     Set via `Date.now() + openRouterBudget` so Workers AI's clock
 *     consumption never shortens OpenRouter's window. Free-tier models
 *     can be slow; we need enough headroom for the first model to come back.
 *
 * Before 2026-10-04 both tiers shared a single 22s budget, so Workers AI
 * frequently consumed it all and OpenRouter started already expired. That
 * manifested as `chat` and `flashcards/decks/generate` returning
 * `503 UPSTREAM_UNAVAILABLE` even when healthy models were configured.
 */
const WORKERS_TIER_MS = 7_000;
const OPENROUTER_TIER_MS = 18_000;

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
 * Fire-and-forget cache write. The response shouldn't wait on the cache
 * (D1 round-trip) — callers get their reply immediately and the cache
 * populates in the background.
 */
const writeCache = (
  env: Env,
  key: string,
  kind: CacheKind,
  out: { text: string; provider: 'workers' | 'openrouter'; model: string; tokens: number },
) => {
  void cachePut(env, key, kind, out, TTL[kind]).catch((e: unknown) => {
    console.warn('ai_cache_put_failed', { kind, err: String(e).slice(0, 200) });
  });
};

/**
 * Unified AI entry. Cache → Workers AI list → OpenRouter cascade.
 *
 * Each tier has its own deadline so Workers AI timeouts never consume
 * OpenRouter's budget. Cascade errors fall through to the next tier;
 * only the final tier failure propagates to the route layer.
 *
 * Returns a `ChatOutput` that always carries `provider` and `model`, so the
 * UI can show "via <model>" and the chat route can stamp `X-Model-Used`.
 */
export const myChat = async (
  env: Env,
  route: string,
  input: ChatInput,
  opts: { kind?: CacheKind; authoritative?: boolean; budgetMs?: number } = {},
): Promise<ChatOutput> => {
  const kind: CacheKind = opts.kind ?? 'text';
  const start = Date.now();
  const key = await keyFor(route, kind, input);
  // Per-tier deadlines. An explicit caller budget (e.g. batched deck
  // generation sizing each batch under 6s) shrinks BOTH tiers so the whole
  // cascade fits inside it.
  const workersBudget = opts.budgetMs !== undefined
    ? Math.min(opts.budgetMs, WORKERS_TIER_MS)
    : WORKERS_TIER_MS;
  const openRouterBudget = opts.budgetMs !== undefined
    ? Math.min(opts.budgetMs, OPENROUTER_TIER_MS)
    : OPENROUTER_TIER_MS;

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

  // 2) Workers AI primary tier — own deadline.
  try {
    const w = await workersCascade(env, {
      ...input,
      route,
      deadlineMs: start + workersBudget,
    });
    const out: ChatOutput = { ...w, cached: false };
    trackAI(env, { ...out, route, latencyMs: Date.now() - start, cacheHit: 0, fallback: 0 });
    writeCache(env, key, kind, out);
    return out;
  } catch (e) {
    if (e instanceof UpstreamAuthError) throw e;
    console.warn('workers_ai_fallback', { route, err: String(e).slice(0, 200) });
  }

  // 3) OpenRouter cascade — fresh deadline. If this throws too, propagate
  //    to the route layer so the user sees a friendly 503.
  const fallback = await openRouterCascade(env, {
    ...input,
    route,
    deadlineMs: Date.now() + openRouterBudget,
  });
  const out: ChatOutput = { ...fallback, cached: false };
  trackAI(env, { ...out, route, latencyMs: Date.now() - start, cacheHit: 0, fallback: 1 });
  writeCache(env, key, kind, out);
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
  opts: { budgetMs?: number } = {},
): Promise<{ parsed: T; out: ChatOutput }> => {
  const kind: CacheKind = 'json';
  const start = Date.now();
  const key = await keyFor(route, kind, input);
  const workersBudget = opts.budgetMs !== undefined
    ? Math.min(opts.budgetMs, WORKERS_TIER_MS)
    : WORKERS_TIER_MS;
  const openRouterBudget = opts.budgetMs !== undefined
    ? Math.min(opts.budgetMs, OPENROUTER_TIER_MS)
    : OPENROUTER_TIER_MS;

  const tryParse = (txt: string): T | null => {
    try {
      return parse(JSON.parse(txt.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()));
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

  // 2) Workers AI primary — own deadline. On transport failure OR parse
  //    failure, fall through to OpenRouter (do NOT rethrow).
  try {
    const w = await workersCascade(env, {
      ...input,
      route,
      deadlineMs: start + workersBudget,
    });
    const parsed = tryParse(w.text);
    if (parsed !== null) {
      const out: ChatOutput = { ...w, cached: false };
      trackAI(env, { ...out, route, latencyMs: Date.now() - start, cacheHit: 0, fallback: 0 });
      writeCache(env, key, kind, out);
      return { parsed, out };
    }
    console.warn('chatJson_workers_unparseable', { route, len: w.text.length });
  } catch (e) {
    if (e instanceof UpstreamAuthError) throw e;
    console.warn('chatJson_workers_fallthrough', { route, err: String(e).slice(0, 200) });
  }

  // 3) OpenRouter JSON cascade — fresh deadline.
  const { parsed, result } = await openRouterCascadeJson(
    env,
    {
      ...input,
      temperature: input.temperature ?? 0.4,
      route,
      deadlineMs: Date.now() + openRouterBudget,
    },
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
  writeCache(env, key, kind, out);
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

/**
 * Workers-AI-only chat. Used as a back-compat alias by callers that
 * intentionally bypass the cascade (rare).
 */
export const workersChat = async (env: Env, input: ChatInput): Promise<ChatOutput> => {
  const w = await workersCascade(env, { ...input, route: 'legacy-workersChat' });
  return { ...w, cached: false };
};

// Re-export error types so existing route imports keep working.
export { AllUpstreamError, UpstreamAuthError, JsonCascadeError };
export type { CascadeResult };