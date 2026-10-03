import { Hono } from 'hono';
import type { Env } from '../env';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';
import { handleError } from '../lib/errors';
import { Level, type Level as LevelT } from '@quantara/shared';

const parseLevel = (q: string | undefined): LevelT | undefined => {
  if (!q || !Level.safeParse(q).success) return undefined;
  return q as LevelT;
};

export const vocabRoute = new Hono<{ Bindings: Env }>()
  .get('/api/vocab', async (c) => {
    try {
      const level = parseLevel(c.req.query('level'));
      const q = drizzle(c.env.DB, { schema });
      const items = level
        ? await q.select().from(schema.vocab).where(eq(schema.vocab.level, level)).limit(200)
        : await q.select().from(schema.vocab).limit(200);
      return c.json({ items });
    } catch (e) {
      return handleError(c, e);
    }
  })
  .get('/api/grammar', async (c) => {
    try {
      const level = parseLevel(c.req.query('level'));
      const q = drizzle(c.env.DB, { schema });
      const items = level
        ? await q.select().from(schema.grammar).where(eq(schema.grammar.level, level)).limit(200)
        : await q.select().from(schema.grammar).limit(200);
      return c.json({ items });
    } catch (e) {
      return handleError(c, e);
    }
  });