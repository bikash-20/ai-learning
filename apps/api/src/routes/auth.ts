import { Hono } from 'hono';
import type { Env } from '../env';
import { auth } from '../lib/auth';
import { handleError } from '../lib/errors';
import { requireAuth } from '../lib/requireAuth';

export const authRoute = new Hono<{ Bindings: Env; Variables: { userId: string } }>()
  // Better Auth handles its own routing under /api/auth/*
  .on(['GET', 'POST'], '/api/auth/*', async (c) => {
    try {
      return await auth(c.env).handler(c.req.raw);
    } catch (e) {
      return handleError(c, e);
    }
  })
  // Convenience: who am I
  .get('/api/me', requireAuth, (c) => c.json({ userId: c.get('userId') }));