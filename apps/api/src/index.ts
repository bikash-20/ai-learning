import { Hono } from 'hono';
import type { Env } from './env';
import { cors } from './lib/cors';
import { handleError } from './lib/errors';
import { authRoute } from './routes/auth';
import { chatRoute } from './routes/chat';
import { quizRoute } from './routes/quiz';
import { vocabRoute } from './routes/vocab';
import { examRoute } from './routes/exam';
import { meRoute } from './routes/me';
import { healthRoute } from './routes/health';

export { RateLimiter } from './durable/RateLimiter';
export { ChatSession } from './durable/ChatSession';

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>()
  .use('*', cors)
  .get('/api/_internal/healthz', (c) => c.json({ ok: true }))
  .get('/api/_internal/readyz', async (c) => {
    try {
      await c.env.DB.prepare('SELECT 1').first();
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ ok: false, error: String(e) }, 503);
    }
  })
  .route('/', healthRoute)
  .route('/', authRoute)
  .route('/', chatRoute)
  .route('/', quizRoute)
  .route('/', examRoute)
  .route('/', meRoute)
  .route('/', vocabRoute)
  .notFound((c) => c.json({ code: 'NOT_FOUND', message: 'No route' }, 404))
  .onError((e, c) => handleError(c, e));

export default {
  fetch: app.fetch,
  // DO exports are wired via wrangler.toml `new_sqlite_classes`
} satisfies ExportedHandler<Env>;