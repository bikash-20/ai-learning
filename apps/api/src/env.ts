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
  OPENROUTER_MODEL?: string; // default free model
  WORKERS_AI_MODEL?: string; // override for tests
}

export const HAIKU_MODEL = '@cf/meta/llama-3.3-70b-instruct';
export const DEFAULT_OPENROUTER_MODEL = 'meta-llama/llama-3.3-70b-instruct:free';