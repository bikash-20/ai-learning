import { DurableObject } from 'cloudflare:workers';

type Bucket = { count: number; resetAt: number };

export class RateLimiter extends DurableObject {
  private buckets = new Map<string, Bucket>();
  private idempotency = new Map<string, { status: number; body: string; expiresAt: number }>();

  async check(route: string, limit: number, windowMs: number): Promise<{ ok: true } | { ok: false; remaining: number; resetAt: number }> {
    const now = Date.now();
    const b = this.buckets.get(route);
    if (!b || b.resetAt < now) {
      this.buckets.set(route, { count: 1, resetAt: now + windowMs });
      return { ok: true };
    }
    if (b.count >= limit) return { ok: false, remaining: 0, resetAt: b.resetAt };
    b.count++;
    return { ok: true };
  }

  async remaining(route: string, limit: number): Promise<{ remaining: number; resetAt: number }> {
    const now = Date.now();
    const b = this.buckets.get(route);
    if (!b || b.resetAt < now) return { remaining: limit, resetAt: now };
    return { remaining: Math.max(0, limit - b.count), resetAt: b.resetAt };
  }

  // Idempotency for non-idempotent endpoints (chat send, attempt submit)
  async idemGet(key: string): Promise<{ status: number; body: string } | null> {
    const v = this.idempotency.get(key);
    if (!v || v.expiresAt < Date.now()) return null;
    return { status: v.status, body: v.body };
  }

  async idemPut(key: string, status: number, body: string, ttlMs = 10 * 60_000): Promise<void> {
    this.idempotency.set(key, { status, body, expiresAt: Date.now() + ttlMs });
  }
}