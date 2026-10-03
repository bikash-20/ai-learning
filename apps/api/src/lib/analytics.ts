import type { Env } from '../env';

type Event = {
  provider: 'workers' | 'openrouter';
  model: string;
  route: string;
  tokens: number;
  latencyMs: number;
  cacheHit: 0 | 1;
  fallback: 0 | 1;
};

// One Analytics Engine event per AI call. Free, native, no third party.
export const trackAI = (env: Env, e: Event) => {
  if (!env.ANALYTICS) return;
  env.ANALYTICS.writeDataPoint({
    blobs: [e.provider, e.model, e.route],
    doubles: [e.tokens, e.latencyMs, e.cacheHit, e.fallback],
    indexes: [e.route],
  });
};

export const trackErr = (env: Env, route: string, code: string) => {
  if (!env.ANALYTICS) return;
  env.ANALYTICS.writeDataPoint({
    blobs: [code],
    doubles: [1],
    indexes: [route],
  });
};