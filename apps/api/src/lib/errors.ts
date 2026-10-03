import type { Context } from 'hono';
import type { Env } from '../env';
import { ErrorCode, type ApiErrorT } from '@quantara/shared';
import { withCors } from './cors';

export const err = (c: Context, status: number, code: ErrorCode, message: string, details?: unknown) => {
  const body: ApiErrorT = { code, message, ...(details === undefined ? {} : { details }) };
  return c.json(body, status as 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 | 502 | 503);
};

/**
 * Global error handler. We MUST attach CORS headers to every error response,
 * even when an exception is thrown before the CORS middleware's `next()`
 * chain had a chance to run — otherwise the browser reports the failure as
 * the generic "Failed to fetch" CORS error and the user sees nothing.
 */
export const handleError = (c: Context, e: unknown): Response => {
  const env = (c as { env?: Env }).env;
  const origin = c.req.header('origin') ?? '';
  const message = e instanceof Error ? e.message : 'Unknown error';
  if (env?.ENVIRONMENT === 'development') console.error(e);
  else console.error(message);

  const body: ApiErrorT = { code: ErrorCode.Internal, message: 'Something went wrong' };
  const res = c.json(body, 500);
  return withCors(env ?? { ALLOWED_ORIGINS: '' }, origin, res);
};