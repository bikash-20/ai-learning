import type { Context } from 'hono';
import type { Env } from '../env';
import { ErrorCode, type ApiErrorT } from '@ai-learning/shared';

export const err = (c: Context<{ Bindings: Env }>, status: number, code: ErrorCode, message: string, details?: unknown) => {
  const body: ApiErrorT = { code, message, ...(details === undefined ? {} : { details }) };
  return c.json(body, status as 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 | 502 | 503);
};

export const handleError = (c: Context<{ Bindings: Env }>, e: unknown) => {
  const message = e instanceof Error ? e.message : 'Unknown error';
  c.env.ENVIRONMENT === 'development' ? console.error(e) : console.error(message);
  return err(c, 500, ErrorCode.Internal, 'Something went wrong');
};