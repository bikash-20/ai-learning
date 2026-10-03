import type { Env } from '../env';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and, gt, sql } from 'drizzle-orm';
import * as schema from '../db/schema';

export type CacheKind = 'text' | 'json' | 'explanation';

export type CachedResult = {
  text: string;
  provider: 'workers' | 'openrouter';
  model: string;
  tokens: number;
};

/**
 * Look up a cached AI result by stable key. Returns null on miss OR on
 * expiry (we don't trust the DB to GC expired rows in real-time — D1 reads
 * are cheap, so we filter at read time).
 */
export const cacheGet = async (
  env: Env,
  key: string,
): Promise<CachedResult | null> => {
  const db = drizzle(env.DB, { schema });
  const row = await db
    .select({ payload: schema.aiCache.payload, expiresAt: schema.aiCache.expiresAt })
    .from(schema.aiCache)
    .where(
      and(
        eq(schema.aiCache.cacheKey, key),
        gt(schema.aiCache.expiresAt, sql`(unixepoch())`),
      ),
    )
    .limit(1)
    .all();
  const hit = row[0];
  if (!hit) return null;
  try {
    const parsed = JSON.parse(hit.payload) as CachedResult;
    if (typeof parsed.text !== 'string' || typeof parsed.model !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
};

/**
 * Upsert a cached AI result with a TTL in seconds. Uses D1's `INSERT OR
 * REPLACE` via the Drizzle `onConflictDoUpdate` helper — no new infra.
 *
 * Failures here are non-fatal: a write error must not fail the user's request.
 */
export const cachePut = async (
  env: Env,
  key: string,
  kind: CacheKind,
  result: CachedResult,
  ttlSec: number,
): Promise<void> => {
  try {
    const db = drizzle(env.DB, { schema });
    const expiresAt = Math.floor(Date.now() / 1000) + ttlSec;
    await db
      .insert(schema.aiCache)
      .values({
        cacheKey: key,
        kind,
        payload: JSON.stringify(result),
        expiresAt,
      })
      .onConflictDoUpdate({
        target: schema.aiCache.cacheKey,
        set: {
          kind,
          payload: JSON.stringify(result),
          expiresAt,
        },
      });
  } catch (e) {
    console.warn('ai_cache_put_failed', { key, kind, err: String(e) });
  }
};

/**
 * Stable SHA-256 over the inputs that actually affect the model's output.
 * Different system prompts, different message contents, or a different
 * temperature produce different keys. We hash with Web Crypto (Workers
 * have it built in) — no Node polyfill needed.
 */
export const cacheKey = async (parts: Array<string | number | boolean | undefined | null>): Promise<string> => {
  const enc = new TextEncoder();
  const buf = parts
    .filter((p): p is string | number | boolean => p !== undefined && p !== null)
    .map((p) => String(p))
    .join('\u241F'); // unit separator — won't appear in user prompts
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(buf));
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `ai:${hex.slice(0, 48)}`;
};