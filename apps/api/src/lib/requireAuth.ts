import type { Context, Next } from 'hono';
import type { Env } from '../env';
import { auth } from './auth';
import { err } from './errors';
import { ErrorCode } from '@quantara/shared';

/**
 * DEV-ONLY: if the worker has ALLOW_TEST_AUTH === '1' AND the request
 * carries `X-Test-Token: <session_token>`, look up that session
 * directly in D1 and short-circuit auth. This lets smoke tests drive a
 * real signed-in flow without going through the magic-link email loop.
 *
 * Production behavior is exactly what it was: ALLOW_TEST_AUTH is unset,
 * the header is ignored, and Better Auth's HMAC-signed cookie is the only
 * way to authenticate.
 */
export const requireAuth = async (
  c: Context<{ Bindings: Env; Variables: { userId: string } }>,
  next: Next,
) => {
  if (c.env.ALLOW_TEST_AUTH === '1') {
    const testToken = c.req.header('X-Test-Token');
    if (testToken) {
      try {
        const ctx = await auth(c.env).$context;
        const result = await ctx.internalAdapter.findSession(testToken);
        if (result?.session?.userId) {
          c.set('userId', result.session.userId);
          await next();
          return;
        }
      } catch {
        /* fall through to real auth */
      }
    }
  }
  const session = await auth(c.env).api.getSession({ headers: c.req.raw.headers });
  if (!session?.user?.id) return err(c, 401, ErrorCode.Unauthorized, 'Sign in required');
  c.set('userId', session.user.id);
  await next();
};