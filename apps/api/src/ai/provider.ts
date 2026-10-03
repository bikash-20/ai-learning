import type { Env } from '../env';
import { HAIKU_MODEL } from '../env';
import { trackAI } from '../lib/analytics';
import type { ChatMessage } from '@ai-learning/shared';
import {
  openRouterCascade,
  openRouterCascadeJson,
  AllUpstreamError,
  UpstreamAuthError,
  JsonCascadeError,
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
};

const HEDGE = /\b(i'?m not sure|i think maybe|as an ai|as a language model|it depends|could be|might be)\b/i;

const messagesToOpenAI = (msgs: ChatMessage[], system?: string) => [
  ...(system ? [{ role: 'system' as const, content: system }] : []),
  ...msgs.map((m) => ({ role: m.role, content: m.content })),
];

const stripJsonFence = (s: string) =>
  s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();

export const workersChat = async (env: Env, input: ChatInput): Promise<ChatOutput> => {
  const model = env.WORKERS_AI_MODEL ?? HAIKU_MODEL;
  const res = await env.AI.run(model as never, {
    messages: messagesToOpenAI(input.messages, input.system),
    max_tokens: input.maxTokens ?? 1024,
    temperature: input.temperature ?? 0.4,
  } as never);
  const r = res as { response?: string; usage?: { tokens?: number } };
  const text = r.response ?? '';
  return { text, provider: 'workers', model, tokens: r.usage?.tokens ?? 0 };
};

/**
 * Main public entry for free-form chat. Tries Workers AI first; falls back to
 * the OpenRouter cascade on error or low-confidence output (when authoritative).
 *
 * Re-throws `UpstreamAuthError` and `AllUpstreamError` from the cascade so the
 * route layer can surface a friendly message + CORS-stamped 502/503.
 */
export const chat = async (
  env: Env,
  route: string,
  input: ChatInput,
  opts: { authoritative?: boolean } = {},
): Promise<ChatOutput> => {
  const start = Date.now();
  try {
    const out = await workersChat(env, input);
    if (opts.authoritative && (HEDGE.test(out.text) || out.text.length < 8)) throw new Error('low_confidence');
    trackAI(env, { ...out, route, latencyMs: Date.now() - start, cacheHit: 0, fallback: 0 });
    return out;
  } catch (e) {
    console.warn('workers_ai_fallback', { route, err: String(e) });
    const fallback = await openRouterCascade(env, { ...input, route });
    const out: ChatOutput = { text: fallback.text, provider: 'openrouter', model: fallback.model, tokens: fallback.tokens };
    trackAI(env, { ...out, route, latencyMs: Date.now() - start, cacheHit: 0, fallback: 1 });
    return out;
  }
};

/**
 * Strict JSON chat. Same model cascade as `chat`, but additionally treats
 * malformed JSON as a fall-through reason so the next model is tried instead
 * of returning 500 to the user.
 *
 * Strategy:
 *   1. Try Workers AI. If parseable, return.
 *   2. Try `openRouterCascadeJson` — this walks the full model list, retrying
 *      each model once at temperature 0 on parse failure, then advancing.
 *   3. Throws `JsonCascadeError` (→ AI_INVALID_OUTPUT 502 with friendly text)
 *      if transport succeeded for at least one model but no model parsed.
 *      Throws `UpstreamAuthError` (→ 503) and `AllUpstreamError` (→ 502) on
 *      pure transport failure.
 */
export const chatJson = async <T>(
  env: Env,
  route: string,
  input: ChatInput,
  parse: (raw: unknown) => T,
): Promise<{ parsed: T; out: ChatOutput }> => {
  const tryParse = (txt: string): T | null => {
    try {
      return parse(JSON.parse(stripJsonFence(txt)));
    } catch {
      return null;
    }
  };

  // 1. Try Workers AI first (low latency, free tier).
  try {
    const primary = await chat(
      env,
      route,
      { ...input, temperature: input.temperature ?? 0.2 },
      { authoritative: true },
    );
    const parsed = tryParse(primary.text);
    if (parsed !== null) return { parsed, out: primary };
    console.warn('chatJson_workers_unparseable', { route, len: primary.text.length });
  } catch (e) {
    if (e instanceof UpstreamAuthError) throw e;
    if (e instanceof AllUpstreamError) throw e;
    console.warn('chatJson_workers_fallthrough', { route, err: String(e) });
  }

  // 2. Walk the cascade — parse failures fall through to the next model.
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
  };
  return { parsed, out };
};

export { AllUpstreamError, UpstreamAuthError, JsonCascadeError };