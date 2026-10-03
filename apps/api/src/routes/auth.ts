import { Hono } from 'hono';
import type { Env } from '../env';
import { auth } from '../lib/auth';
import { handleError } from '../lib/errors';
import { requireAuth } from '../lib/requireAuth';
import { allowedOriginFor, corsHeaders } from '../lib/cors';
import { ErrorCode } from '@quantara/shared';

export const authRoute = new Hono<{ Bindings: Env; Variables: { userId: string } }>()
  // Better Auth handles its own routing under /api/auth/*
  .on(['GET', 'POST'], '/api/auth/*', async (c) => {
    let res: Response;
    try {
      res = await auth(c.env).handler(c.req.raw);
    } catch (e) {
      return handleError(c, e);
    }

    // Better Auth catches handler-plugin throws (Resend, custom callbacks,
    // etc.) and returns a 5xx with an empty body instead of re-throwing. We
    // want a friendly JSON body with CORS so the client UI can render
    // something useful — e.g. the email-recipient isn't verified with
    // Resend's onboarding@resend.dev default sender, which returns 500
    // with an empty body. Surface a 502 with code EMAIL_DELIVERY_FAILED
    // so the client knows it's a transient mail problem (not 429 cooldown).
    if (res.status >= 500) {
      const text = await res.text().catch(() => '');
      if (!text.trim()) {
        const friendly = JSON.stringify({
          code: ErrorCode.UpstreamUnavailable,
          message: 'We could not send the sign-in email. Try Google sign-in, or try again later.',
        });
        const headers = new Headers(res.headers);
        headers.set('Content-Type', 'application/json');
        headers.set('Content-Length', String(new TextEncoder().encode(friendly).length));
        res = new Response(friendly, { status: 502, statusText: 'Bad Gateway', headers });
      }
    }

    // Stamp CORS onto whatever Better Auth produced. The preflight is
    // short-circuited earlier in `cors` middleware so it's OK to rewrite
    // Access-Control-Allow-Origin on the response.
    const origin = c.req.header('origin') ?? '';
    const allow = allowedOriginFor(c.env, origin);
    const headers = new Headers(res.headers);
    headers.delete('Access-Control-Allow-Origin');
    for (const [k, v] of corsHeaders(allow)) headers.set(k, v);
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  })
  // Convenience: who am I
  .get('/api/me', requireAuth, (c) => c.json({ userId: c.get('userId') }));