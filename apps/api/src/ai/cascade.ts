import type { Env } from '../env';
import { resolveWorkersAiModels } from '../env';
import type { ChatMessage } from '@ai-learning/shared';

export type Provider = 'workers' | 'openrouter';

export type CascadeResult = {
  text: string;
  provider: Provider;
  model: string;
  tokens: number;
  latencyMs: number;
};

export type CascadeInput = {
  messages: ChatMessage[];
  system?: string;
  maxTokens?: number;
  temperature?: number;
  /** Used in structured logs so `wrangler tail` shows which route asked for it. */
  route: string;
};

const BREAKER_TTL_MS = 60_000;
const REQ_TIMEOUT_MS = 30_000;
const WORKERS_TIMEOUT_MS = 15_000;

/**
 * Short-lived circuit breaker. A model that fails within the last 60s is
 * skipped at the head of the next cascade to avoid burning the request budget
 * on a known-bad upstream. State lives in module scope — one Worker isolate,
 * one map. No external infrastructure.
 */
const breakerState = new Map<string, { failedAt: number; reason: string }>();

const markFailed = (model: string, reason: string) => {
  breakerState.set(model, { failedAt: Date.now(), reason });
};
const isOpen = (model: string): boolean => {
  const e = breakerState.get(model);
  return !!e && Date.now() - e.failedAt < BREAKER_TTL_MS;
};
const markOk = (model: string) => breakerState.delete(model);

/** Resolve the ordered list of models to try. OPENROUTER_MODELS wins; falls back to OPENROUTER_MODEL. */
export const resolveModelList = (env: Env): string[] => {
  const list = (env.OPENROUTER_MODELS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length > 0) return list;
  if (env.OPENROUTER_MODEL) return [env.OPENROUTER_MODEL];
  return ['meta-llama/llama-3.3-70b-instruct:free'];
};

export class UpstreamAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpstreamAuthError';
  }
}

export class AllUpstreamError extends Error {
  override cause: 'rate_limited' | 'upstream' | 'empty' | 'unknown';
  attempts: Array<{ model: string; status?: number; error: string; latencyMs: number }>;
  constructor(
    message: string,
    cause: AllUpstreamError['cause'],
    attempts: AllUpstreamError['attempts'],
  ) {
    super(message);
    this.name = 'AllUpstreamError';
    this.cause = cause;
    this.attempts = attempts;
  }
}

type AggregateCause = 'rate_limited' | 'upstream' | 'empty' | 'unknown';

/**
 * Outcome of one OpenRouter call against one model. Shared between the text
 * cascade (`openRouterCascade`) and the JSON cascade (`openRouterCascadeJson`).
 * Never throws — caller decides whether to retry, fall through, or fail.
 */
type AttemptOutcome =
  | { type: 'success'; result: CascadeResult }
  | { type: 'auth_fail'; error: string }
  | {
      type: 'transport_error';
      reason: string;
      status?: number;
      latencyMs: number;
      aggregateCause: AggregateCause;
    };

/** Fire one OpenRouter call. Never throws — returns a structured outcome. */
const tryModel = async (
  env: Env,
  model: string,
  input: CascadeInput,
): Promise<AttemptOutcome> => {
  const start = Date.now();
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://ai-learning.workers.dev',
        'X-Title': 'ai-learning',
      },
      body: JSON.stringify({
        model,
        messages: [
          ...(input.system ? [{ role: 'system' as const, content: input.system }] : []),
          ...input.messages.map((m) => ({ role: m.role, content: m.content })),
        ],
        max_tokens: input.maxTokens ?? 1024,
        temperature: input.temperature ?? 0.4,
      }),
      signal: AbortSignal.timeout(REQ_TIMEOUT_MS),
    });

    const latencyMs = Date.now() - start;

    if (res.status === 401) {
      console.error('cascade_attempt', {
        route: input.route, model, status: 401, latencyMs, outcome: 'auth_fail',
      });
      return { type: 'auth_fail', error: 'openrouter 401 (bad key)' };
    }

    if (res.status === 429 || res.status === 402) {
      const text = await res.text().catch(() => '');
      console.warn('cascade_attempt', {
        route: input.route, model, status: res.status, latencyMs,
        outcome: 'rate_limited_or_payment', excerpt: text.slice(0, 120),
      });
      return {
        type: 'transport_error',
        reason: `status_${res.status}`,
        status: res.status,
        latencyMs,
        aggregateCause: 'rate_limited',
      };
    }

    if (res.status >= 500) {
      const text = await res.text().catch(() => '');
      console.warn('cascade_attempt', {
        route: input.route, model, status: res.status, latencyMs,
        outcome: 'upstream_5xx', excerpt: text.slice(0, 120),
      });
      return {
        type: 'transport_error',
        reason: `status_${res.status}`,
        status: res.status,
        latencyMs,
        aggregateCause: 'upstream',
      };
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn('cascade_attempt', {
        route: input.route, model, status: res.status, latencyMs,
        outcome: 'http_error', excerpt: text.slice(0, 120),
      });
      return {
        type: 'transport_error',
        reason: `status_${res.status}`,
        status: res.status,
        latencyMs,
        aggregateCause: 'upstream',
      };
    }

    const j = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      error?: { code?: number; message?: string };
    };

    // OpenRouter returns 200 with an `error` envelope for "model not found".
    if (j.error || !j.choices || j.choices.length === 0) {
      console.warn('cascade_attempt', {
        route: input.route, model, status: 200, latencyMs,
        outcome: 'empty_or_model_missing', error: j.error?.message ?? 'no_choices',
      });
      return {
        type: 'transport_error',
        reason: j.error?.message ?? 'empty_choices',
        latencyMs,
        aggregateCause: 'empty',
      };
    }

    const text = j.choices[0]?.message?.content ?? '';
    if (!text || text.trim().length === 0) {
      console.warn('cascade_attempt', {
        route: input.route, model, status: 200, latencyMs, outcome: 'empty_text',
      });
      return {
        type: 'transport_error',
        reason: 'empty_text',
        latencyMs,
        aggregateCause: 'empty',
      };
    }

    const tokens = (j as { usage?: { total_tokens?: number } }).usage?.total_tokens ?? 0;
    const result: CascadeResult = {
      text,
      provider: 'openrouter',
      model,
      tokens,
      latencyMs,
    };
    console.log('cascade_attempt', {
      route: input.route, model, status: 200, latencyMs, outcome: 'success', tokens,
    });
    return { type: 'success', result };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isTimeout = msg.toLowerCase().includes('timeout') || msg.toLowerCase().includes('aborted');
    const latencyMs = Date.now() - start;
    console.warn('cascade_attempt', {
      route: input.route, model, latencyMs,
      outcome: isTimeout ? 'timeout' : 'exception', error: msg,
    });
    return {
      type: 'transport_error',
      reason: isTimeout ? 'timeout' : `exception:${msg.slice(0, 80)}`,
      latencyMs,
      aggregateCause: 'upstream',
    };
  }
};

/**
 * Try each model in order. Skip any whose breaker is open. Fail-fast on 401.
 * Returns the first successful model. Throws `AllUpstreamError` if every model
 * fails with a transport error; throws `UpstreamAuthError` on bad key.
 */
export const openRouterCascade = async (
  env: Env,
  input: CascadeInput,
): Promise<CascadeResult> => {
  if (!env.OPENROUTER_API_KEY) throw new UpstreamAuthError('OPENROUTER_API_KEY missing');

  const models = resolveModelList(env);
  const attempts: AllUpstreamError['attempts'] = [];
  let lastAggregateCause: AggregateCause = 'unknown';

  for (const model of models) {
    if (isOpen(model)) {
      attempts.push({ model, error: 'breaker_open', latencyMs: 0 });
      continue;
    }

    const outcome = await tryModel(env, model, input);
    if (outcome.type === 'auth_fail') {
      throw new UpstreamAuthError(outcome.error);
    }
    if (outcome.type === 'success') {
      markOk(model);
      return outcome.result;
    }

    // transport error — fall through, mark breaker
    markFailed(model, outcome.reason);
    const attempt: AllUpstreamError['attempts'][number] = {
      model,
      error: outcome.reason,
      latencyMs: outcome.latencyMs,
    };
    if (outcome.status !== undefined) attempt.status = outcome.status;
    attempts.push(attempt);
    lastAggregateCause = outcome.aggregateCause;
  }

  const friendly =
    lastAggregateCause === 'rate_limited'
      ? 'All AI models are rate-limited right now. Please try again in a minute.'
      : lastAggregateCause === 'empty'
        ? 'All AI models returned empty responses. Please try again.'
        : 'All AI models are temporarily unavailable. Please try again shortly.';
  throw new AllUpstreamError(friendly, lastAggregateCause, attempts);
};

/** Test-only: clear the breaker map (used by the health endpoint when probing). */
export const __resetCascadeBreaker = () => breakerState.clear();

/**
 * Strip a markdown ```json``` fence if the model wrapped its answer in one.
 * Some free models do, some don't; treat both as JSON.
 */
const stripJsonFence = (s: string) =>
  s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();

export class JsonCascadeError extends Error {
  attempts: Array<{ model: string; reason: string; latencyMs: number }>;
  constructor(message: string, attempts: JsonCascadeError['attempts']) {
    super(message);
    this.name = 'JsonCascadeError';
    this.attempts = attempts;
  }
}

/**
 * Try the cascade for a JSON response. Two layers of retry:
 *
 *   1. For each model in order, send the request. If it returns parseable JSON,
 *      return the parsed value. If it returns unparseable JSON, retry THAT model
 *      once at temperature 0 — sometimes free-tier models fix themselves with a
 *      lower temperature. If still unparseable, treat it as a fall-through and
 *      move on to the next model. We do NOT mark the breaker for parse failures
 *      because the upstream was reachable and might still be useful for non-JSON
 *      callers (e.g. chat).
 *   2. Network/5xx/429/402 fall through to the next model AND mark the breaker.
 *
 * Throws:
 *   - `UpstreamAuthError` on 401 (fail fast — caller surfaces friendly auth msg)
 *   - `AllUpstreamError` if every model failed at the transport level
 *   - `JsonCascadeError` if transport succeeded for at least one model but no
 *     model returned parseable JSON. Caller maps this to a friendly 502.
 */
export const openRouterCascadeJson = async <T>(
  env: Env,
  input: CascadeInput,
  parse: (raw: unknown) => T,
): Promise<{ parsed: T; result: CascadeResult }> => {
  if (!env.OPENROUTER_API_KEY) throw new UpstreamAuthError('OPENROUTER_API_KEY missing');

  const models = resolveModelList(env);
  const attempts: JsonCascadeError['attempts'] = [];
  const transportAttempts: AllUpstreamError['attempts'] = [];
  let lastAggregateCause: 'rate_limited' | 'upstream' | 'empty' | 'unknown' = 'unknown';

  const tryParse = (raw: string): T | null => {
    try {
      return parse(JSON.parse(stripJsonFence(raw)));
    } catch {
      return null;
    }
  };

  for (const model of models) {
    // Skip breaker-open only — parse failures shouldn't have set it.
    if (isOpen(model)) {
      attempts.push({ model, reason: 'breaker_open', latencyMs: 0 });
      continue;
    }

    // First attempt: requested temperature
    const first = await tryModel(env, model, input);
    if (first.type === 'auth_fail') throw new UpstreamAuthError(first.error);
    if (first.type === 'transport_error') {
      markFailed(model, first.reason);
      transportAttempts.push(
        first.status !== undefined
          ? { model, status: first.status, error: first.reason, latencyMs: first.latencyMs }
          : { model, error: first.reason, latencyMs: first.latencyMs },
      );
      lastAggregateCause = first.aggregateCause;
      attempts.push({ model, reason: `transport:${first.reason}`, latencyMs: first.latencyMs });
      continue;
    }

    // Success transport. Try to parse.
    let parsed = tryParse(first.result.text);
    let usedModel = model;
    let usedResult = first.result;

    if (!parsed) {
      // Retry the same model at temperature 0 — many free models fix themselves.
      const retry = await tryModel(env, model, { ...input, temperature: 0 });
      if (retry.type === 'auth_fail') throw new UpstreamAuthError(retry.error);
      if (retry.type === 'success') {
        parsed = tryParse(retry.result.text);
        if (parsed) {
          usedModel = model;
          usedResult = retry.result;
        } else {
          attempts.push({ model, reason: 'parse_failed_twice', latencyMs: retry.result.latencyMs + first.result.latencyMs });
          continue; // try next model
        }
      } else {
        // transport error on retry — fall through to next model, but don't
        // double-mark breaker (it's already marked).
        attempts.push({ model, reason: `parse_failed_then_${retry.reason}`, latencyMs: first.result.latencyMs + retry.latencyMs });
        continue;
      }
    }

    if (parsed) {
      return { parsed, result: { ...usedResult, model: usedModel } };
    }
  }

  // If we got here, either every model had a transport failure OR every model
  // returned unparseable JSON (or a mix).
  const hadTransport = transportAttempts.length > 0;
  const hadParse = attempts.some((a) => a.reason.startsWith('parse_failed') || a.reason === 'breaker_open');
  if (hadTransport && !hadParse) {
    // Pure transport failure — surface the rich upstream error.
    const friendly =
      lastAggregateCause === 'rate_limited'
        ? 'All AI models are rate-limited right now. Please try again in a minute.'
        : 'All AI models are temporarily unavailable. Please try again shortly.';
    throw new AllUpstreamError(friendly, lastAggregateCause, transportAttempts);
  }

  // Mix or pure parse failure — caller maps to AI_INVALID_OUTPUT.
  throw new JsonCascadeError(
    'The AI returned malformed JSON for every model. Please try again.',
    attempts,
  );
};

/** Outcome of one Workers AI call against one model. Mirrors the OpenRouter
 *  shape so the two tiers compose cleanly inside `provider.myChat`.
 *  Workers AI doesn't expose distinct HTTP status codes the same way — most
 *  failures surface as thrown errors — so we keep the variant narrow.
 */
type WorkersAttempt =
  | { type: 'success'; result: CascadeResult }
  | { type: 'transport_error'; reason: string; latencyMs: number };

const messagesToOpenAI = (msgs: ChatMessage[], system?: string) => [
  ...(system ? [{ role: 'system' as const, content: system }] : []),
  ...msgs.map((m) => ({ role: m.role, content: m.content })),
];

const callWorkersModel = async (
  env: Env,
  model: string,
  input: CascadeInput,
): Promise<WorkersAttempt> => {
  const start = Date.now();
  try {
    const res = (await Promise.race([
      env.AI.run(model as never, {
        messages: messagesToOpenAI(input.messages, input.system),
        max_tokens: input.maxTokens ?? 1024,
        temperature: input.temperature ?? 0.4,
      } as never),
      new Promise((_resolve, reject) => {
        setTimeout(() => reject(new Error('workers_timeout')), WORKERS_TIMEOUT_MS);
      }),
    ])) as { response?: string; usage?: { tokens?: number } };
    const latencyMs = Date.now() - start;
    const text = (res.response ?? '').trim();
    if (!text) {
      console.warn('workers_ai_attempt', {
        route: input.route, model, latencyMs, outcome: 'empty_text',
      });
      return { type: 'transport_error', reason: 'empty_text', latencyMs };
    }
    const tokens = res.usage?.tokens ?? 0;
    console.log('workers_ai_attempt', {
      route: input.route, model, latencyMs, outcome: 'success', tokens,
    });
    return {
      type: 'success',
      result: { text, provider: 'workers', model, tokens, latencyMs },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const latencyMs = Date.now() - start;
    const isTimeout = msg.toLowerCase().includes('timeout');
    console.warn('workers_ai_attempt', {
      route: input.route, model, latencyMs,
      outcome: isTimeout ? 'timeout' : 'exception', error: msg.slice(0, 120),
    });
    return {
      type: 'transport_error',
      reason: isTimeout ? 'timeout' : `exception:${msg.slice(0, 80)}`,
      latencyMs,
    };
  }
};

/**
 * Walk the configured Workers AI model list. Stops on the first success.
 * On total failure throws `AllUpstreamError` so callers can surface a
 * friendly 503 — same shape as the OpenRouter cascade so the two compose.
 *
 * Note: Workers AI doesn't have the same 429/402 distinction; we don't mark
 * the OpenRouter breaker for a Workers failure (different namespace).
 */
export const workersCascade = async (
  env: Env,
  input: CascadeInput,
): Promise<CascadeResult> => {
  const models = resolveWorkersAiModels(env);
  let lastReason = 'unknown';
  for (const model of models) {
    const outcome = await callWorkersModel(env, model, input);
    if (outcome.type === 'success') return outcome.result;
    lastReason = outcome.reason;
  }
  throw new AllUpstreamError(
    `All Workers AI models failed (${lastReason}). Falling back to OpenRouter.`,
    'upstream',
    models.map((m) => ({ model: m, error: lastReason, latencyMs: 0 })),
  );
};