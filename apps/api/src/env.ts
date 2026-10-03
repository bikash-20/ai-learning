/// <reference types="@cloudflare/workers-types" />

export interface Env {
  // bindings
  DB: D1Database;
  AI: Ai;
  RATE_LIMITER: DurableObjectNamespace;
  CHAT_SESSION: DurableObjectNamespace;
  ANALYTICS: AnalyticsEngineDataset;

  // vars
  ENVIRONMENT: 'development' | 'production';
  ALLOWED_ORIGINS: string;

  // secrets (set via `wrangler secret put`)
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
  OPENROUTER_API_KEY?: string;
  /** Comma-separated ordered list of OpenRouter models for the cascade. */
  OPENROUTER_MODELS?: string;
  /** Single-model back-compat: if OPENROUTER_MODELS is empty, this is used. */
  OPENROUTER_MODEL?: string;
  /** Comma-separated ordered list of Workers AI models tried first in `myChat`. */
  WORKERS_AI_MODELS?: string;
  /** Single-model back-compat: if WORKERS_AI_MODELS is empty, this is used. */
  WORKERS_AI_MODEL?: string; // override for tests

  /** DEV-ONLY: enables POST /api/_test/sign-in for live smoke tests.
   *  Set to '1' in test environments; never in production. */
  ALLOW_TEST_AUTH?: string;
}

export const HAIKU_MODEL = '@cf/meta/llama-3.3-70b-instruct';
export const DEFAULT_OPENROUTER_MODEL = 'meta-llama/llama-3.3-70b-instruct:free';

/** Default Workers AI tier — curated from the live `@cf/...` catalog. */
export const DEFAULT_WORKERS_AI_MODELS = [
  '@cf/meta/llama-3.3-70b-instruct', // best instruction following
  '@cf/meta/llama-3.1-8b-instruct',  // fast fallback
  '@cf/mistral/mistral-7b-instruct-v0.2', // different family
] as const;

/** Parse the comma-separated list, falling back to the curated default. */
export const resolveWorkersAiModels = (env: Env): string[] => {
  const list = (env.WORKERS_AI_MODELS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length > 0) return list;
  if (env.WORKERS_AI_MODEL) return [env.WORKERS_AI_MODEL];
  return [...DEFAULT_WORKERS_AI_MODELS];
};