import type { Context, Next } from 'hono';
import type { Env } from '../env';

const ALLOW_HEADERS = 'Content-Type,Authorization,Idempotency-Key';
const ALLOW_METHODS = 'GET,POST,PUT,DELETE,OPTIONS';

/** Build CORS headers for a given origin (or empty string if not allowed). */
export const corsHeaders = (allow: string): Headers => {
  const out = new Headers();
  if (allow) out.set('Access-Control-Allow-Origin', allow);
  out.set('Vary', 'Origin');
  out.set('Access-Control-Allow-Credentials', 'true');
  out.set('Access-Control-Allow-Methods', ALLOW_METHODS);
  out.set('Access-Control-Allow-Headers', ALLOW_HEADERS);
  out.set('Access-Control-Max-Age', '600');
  return out;
};

/** Look up the allow-list entry for a given request Origin. */
export const allowedOriginFor = (env: { ALLOWED_ORIGINS?: string }, origin: string): string => {
  const allowed = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return allowed.includes(origin) ? origin : '';
};

/** Stamp CORS headers onto an already-built Response. Used by the error handler. */
export const withCors = (env: { ALLOWED_ORIGINS?: string }, origin: string, res: Response): Response => {
  const allow = allowedOriginFor(env, origin);
  for (const [k, v] of corsHeaders(allow)) res.headers.set(k, v);
  return res;
};

export const cors = async (c: Context<{ Bindings: Env }>, next: Next) => {
  const origin = c.req.header('origin') ?? '';
  const allow = allowedOriginFor(c.env, origin);

  // Preflight MUST short-circuit before anything else can throw. Otherwise a
  // 500 from a downstream handler (e.g. Better Auth with a missing secret)
  // leaves the browser with no Access-Control-Allow-Origin, which the browser
  // reports as the generic "Failed to fetch" CORS error.
  if (c.req.method === 'OPTIONS') {
    if (!allow) return new Response(null, { status: 403, headers: corsHeaders('') });
    return new Response(null, { status: 204, headers: corsHeaders(allow) });
  }

  for (const [k, v] of corsHeaders(allow)) c.header(k, v);
  return next();
};