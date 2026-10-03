import type { Context, Next } from 'hono';
import type { Env } from '../env';
import { auth } from './auth';
import { err } from './errors';
import { ErrorCode } from '@ai-learning/shared';

export const requireAuth = async (c: Context<{ Bindings: Env; Variables: { userId: string } }>, next: Next) => {
  const session = await auth(c.env).api.getSession({ headers: c.req.raw.headers });
  if (!session?.user?.id) return err(c, 401, ErrorCode.Unauthorized, 'Sign in required');
  c.set('userId', session.user.id);
  await next();
};