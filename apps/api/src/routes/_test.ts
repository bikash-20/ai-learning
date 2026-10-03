import { Hono } from 'hono';
import type { Env } from '../env';
import { withCors } from '../lib/cors';
import { auth } from '../lib/auth';

/**
 * DEV-ONLY test sign-in endpoint. Gates on env.ALLOW_TEST_AUTH === '1'.
 *
 * Bypasses Better Auth cookie signing entirely. Returns the session token
 * in the response body and instructs the smoke-test client to send it as
 * the `X-Test-Token` header on subsequent authenticated requests. The
 * `requireAuth`-style middleware in `src/lib/testAuth.ts` reads this
 * header (only when ALLOW_TEST_AUTH is set) and looks up the session
 * directly in D1, bypassing the HMAC cookie dance.
 *
 * This is intentionally narrow — the production code path is unchanged.
 */
export const testRoute = new Hono<{ Bindings: Env }>().post(
  '/api/qtest/sign-in',
  async (c) => {
    if (c.env.ALLOW_TEST_AUTH !== '1') {
      return withCors(
        c.env,
        c.req.header('origin') ?? '',
        c.json({ code: 'DISABLED', message: 'test sign-in disabled' }, 403),
      );
    }

    try {
      const body = (await c.req.json().catch(() => null)) as { email?: unknown; role?: unknown } | null;
      const email = typeof body?.email === 'string' ? body.email.toLowerCase().trim() : '';
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return withCors(c.env, c.req.header('origin') ?? '', c.json({ code: 'BAD_EMAIL', message: 'email required' }, 400));
      }
      const role = body?.role === 'admin' ? 'admin' : 'user';

      const a = auth(c.env);
      const ctx = await a.$context;

      type AuthUser = { id: string; email: string; role?: string };
      let user: AuthUser | null = null;
      const found = (await ctx.internalAdapter
        .findUserByEmail(email, { includeAccounts: false })
        .catch(() => null)) as { user?: AuthUser } | AuthUser | null;
      if (found) user = (found as { user?: AuthUser }).user ?? (found as AuthUser);
      if (!user) {
        const created = (await ctx.internalAdapter.createUser(
          {
            email,
            emailVerified: true,
            name: email.split('@')[0]!,
            role,
          } as never,
          { method: 'test' },
        )) as { user?: AuthUser } | AuthUser;
        user = (created as { user?: AuthUser }).user ?? (created as AuthUser);
      } else if (role === 'admin') {
        try {
          await ctx.internalAdapter.updateUser(user.id, { role } as never);
          const refreshed = (await ctx.internalAdapter.findUserById(user.id)) as { user?: AuthUser } | AuthUser | null;
          if (refreshed) user = (refreshed as { user?: AuthUser }).user ?? (refreshed as AuthUser);
        } catch {
          /* ignore */
        }
      }
      if (!user) {
        return withCors(
          c.env,
          c.req.header('origin') ?? '',
          c.json({ code: 'USER_CREATE_FAILED', message: 'could not create user' }, 500),
        );
      }

      const session = await ctx.internalAdapter.createSession(user.id, false);
      if (!session) {
        return withCors(
          c.env,
          c.req.header('origin') ?? '',
          c.json({ code: 'SESSION_CREATE_FAILED', message: 'no session' }, 500),
        );
      }

      const json = JSON.stringify({
        ok: true,
        user: { id: user.id, email: user.email, role },
        token: session.token,
      });
      return withCors(
        c.env,
        c.req.header('origin') ?? '',
        new Response(json, { status: 200, headers: { 'Content-Type': 'application/json' } }),
      );
    } catch (e) {
      return withCors(
        c.env,
        c.req.header('origin') ?? '',
        c.json({ code: 'TEST_ERROR', message: String(e) }, 500),
      );
    }
  },
);