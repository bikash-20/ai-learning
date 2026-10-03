import type { Context, Next } from 'hono';
import type { Env } from '../env';

export const cors = async (c: Context<{ Bindings: Env }>, next: Next) => {
  const allowed = (c.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim());
  const origin = c.req.header('origin') ?? '';
  const allow = allowed.includes(origin) ? origin : allowed[0] ?? '';

  c.header('Access-Control-Allow-Origin', allow);
  c.header('Vary', 'Origin');
  c.header('Access-Control-Allow-Credentials', 'true');
  c.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,Idempotency-Key');
  c.header('Access-Control-Max-Age', '600');

  if (c.req.method === 'OPTIONS') return new Response(null, { status: 204 });
  await next();
};