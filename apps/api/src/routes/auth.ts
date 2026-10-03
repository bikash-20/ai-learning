import { Hono } from 'hono';
import type { Env } from '../env';
import { auth } from '../lib/auth';
import { handleError } from '../lib/errors';
import { requireAuth } from '../lib/requireAuth';
import { allowedOriginFor, corsHeaders } from '../lib/cors';

export const authRoute = new Hono<{ Bindings: Env; Variables: { userId: string } }>()
  // Better Auth handles its own routing under /api/auth/*
  .on(['GET', 'POST'], '/api/auth/*', async (c) => {
    try {
      const res = await auth(c.env).handler(c.req.raw);
      // Better Auth returns its own Response (sometimes 5xx) instead of
      // throwing. Stamp CORS onto whatever it produced — the preflight is
      // short-circuited earlier in `cors` middleware so it's OK to rewrite
      // Access-Control-Allow-Origin on the response.
      const origin = c.req.header('origin') ?? '';
      const allow = allowedOriginFor(c.env, origin);
      const headers = new Headers(res.headers);
      // Drop any stale ACAO Better Auth set on its own (it won't, but be safe)
      headers.delete('Access-Control-Allow-Origin');
      for (const [k, v] of corsHeaders(allow)) headers.set(k, v);
      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers,
      });
    } catch (e) {
      return handleError(c, e);
    }
  })
  // Convenience: who am I
  .get('/api/me', requireAuth, (c) => c.json({ userId: c.get('userId') }));