import type { Env } from '../env';
import { HAIKU_MODEL, DEFAULT_OPENROUTER_MODEL } from '../env';
import { trackAI } from '../lib/analytics';
import type { ChatMessage } from '@ai-learning/shared';

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

export const workersChat = async (env: Env, input: ChatInput): Promise<ChatOutput> => {
  const model = env.WORKERS_AI_MODEL ?? HAIKU_MODEL;
  const res = await env.AI.run(model as never, {
    messages: messagesToOpenAI(input.messages, input.system),
    max_tokens: input.maxTokens ?? 1024,
    temperature: input.temperature ?? 0.4,
  } as never);
  // Workers AI returns { response: string, usage?: { tokens?: number } }
  const r = res as { response?: string; usage?: { tokens?: number } };
  const text = r.response ?? '';
  return { text, provider: 'workers', model, tokens: r.usage?.tokens ?? 0 };
};

export const openRouterChat = async (env: Env, input: ChatInput): Promise<ChatOutput> => {
  if (!env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY missing');
  const model = env.OPENROUTER_MODEL ?? DEFAULT_OPENROUTER_MODEL;
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
      messages: messagesToOpenAI(input.messages, input.system),
      max_tokens: input.maxTokens ?? 1024,
      temperature: input.temperature ?? 0.4,
    }),
  });
  if (!res.ok) throw new Error(`openrouter ${res.status}`);
  const j = (await res.json()) as { choices: { message: { content: string } }[]; usage?: { total_tokens: number } };
  return { text: j.choices[0]?.message?.content ?? '', provider: 'openrouter', model, tokens: j.usage?.total_tokens ?? 0 };
};

// Main public entry. One path for every caller. Fallback on error OR on hedge for "authoritative" callers.
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
    const out = await openRouterChat(env, input);
    trackAI(env, { ...out, route, latencyMs: Date.now() - start, cacheHit: 0, fallback: 1 });
    return out;
  }
};

// Strict JSON chat. Retries once with OpenRouter on parse failure.
export const chatJson = async <T>(env: Env, route: string, input: ChatInput, parse: (raw: unknown) => T): Promise<{ parsed: T; out: ChatOutput }> => {
  const out = await chat(env, route, { ...input, temperature: input.temperature ?? 0.2 }, { authoritative: true });
  const tryParse = (txt: string) => {
    const cleaned = txt.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    return parse(JSON.parse(cleaned));
  };
  try {
    return { parsed: tryParse(out.text), out };
  } catch {
    const retry = await openRouterChat(env, { ...input, temperature: 0.2 });
    return { parsed: tryParse(retry.text), out: retry };
  }
};