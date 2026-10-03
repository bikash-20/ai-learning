import type { Context, Next } from 'hono';
import type { Env } from '../env';

const ALLOW_HEADERS = 'Content-Type,Authorization,Idempotency-Key';
const ALLOW_METHODS = 'GET,POST,PUT,DELETE,OPTIONS';

const corsHeaders = (allow: string): Headers => {
  const out = new Headers();
  if (allow) out.set('Access-Control-Allow-Origin', allow);
  out.set('Vary', 'Origin');
  out.set('Access-Control-Allow-Credentials', 'true');
  out.set('Access-Control-Allow-Methods', ALLOW_METHODS);
  out.set('Access-Control-Allow-Headers', ALLOW_HEADERS);
  out.set('Access-Control-Max-Age', '600');
  return out;
};

export const cors = async (c: Context<{ Bindings: Env }>, next: Next) => {
  const allowed = (c.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const origin = c.req.header('origin') ?? '';
  // Echo the request origin only if it's on the allow-list. Never fall back
  // to a different allowed origin — that breaks CORS and is a security smell.
  const allow = allowed.includes(origin) ? origin : '';

  if (c.req.method === 'OPTIONS') {
    // Preflight: build the Response directly with the CORS headers attached.
    // (Returning a bare `new Response(null, 204)` would drop any header()
    // calls made on the Hono Context.)
    if (!allow) return new Response('', { status: 403, headers: corsHeaders('') });
    return new Response('', { status: 204, headers: corsHeaders(allow) });
  }

  for (const [k, v] of corsHeaders(allow)) c.header(k, v);
  return next();
};