import type { Context, Next } from 'hono';
import type { Env } from '../env';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';
import { err } from './errors';
import { ErrorCode } from '@quantara/shared';

/**
 * Requires the signed-in user to have role='admin'. Returns 401 if no
 * session, 403 if the session is valid but the user isn't admin.
 *
 * Unlike requireAuth (which is purely session-based), this middleware
 * reads from D1 to verify the role. The role check is cached via
 * c.get('userRole') so multiple admin routes in the same request chain
 * don't re-query.
 */
export const requireAdmin = async (c: Context<{ Bindings: Env; Variables: { userId: string; userRole?: 'user' | 'admin' } }>, next: Next) => {
  const cached = c.get('userRole');
  if (cached === 'admin') {
    await next();
    return;
  }
  const userId = c.get('userId');
  if (!userId) return err(c, 401, ErrorCode.Unauthorized, 'Sign in required');
  const db = drizzle(c.env.DB, { schema });
  const rows = await db
    .select({ role: schema.user.role })
    .from(schema.user)
    .where(eq(schema.user.id, userId))
    .limit(1)
    .all();
  const role = rows[0]?.role ?? 'user';
  c.set('userRole', role);
  if (role !== 'admin') {
    return err(c, 403, ErrorCode.Forbidden, 'Admin only');
  }
  await next();
};