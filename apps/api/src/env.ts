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
  WORKERS_AI_MODEL?: string; // override for tests
}

export const HAIKU_MODEL = '@cf/meta/llama-3.3-70b-instruct';
export const DEFAULT_OPENROUTER_MODEL = 'meta-llama/llama-3.3-70b-instruct:free';