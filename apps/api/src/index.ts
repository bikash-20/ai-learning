import { Hono } from 'hono';
import type { Env } from './env';
import { cors } from './lib/cors';
import { handleError } from './lib/errors';
import { authRoute } from './routes/auth';
import { chatRoute } from './routes/chat';
import { chatHistoryRoute } from './routes/chatHistory';
import { quizRoute } from './routes/quiz';
import { vocabRoute } from './routes/vocab';
import { examRoute } from './routes/exam';
import { meRoute } from './routes/me';
import { flashcardsRoute } from './routes/flashcards';
import { healthRoute } from './routes/health';
import { adminRoute } from './routes/admin';
import { testRoute } from './routes/_test';

export { RateLimiter } from './durable/RateLimiter';
export { ChatSession } from './durable/ChatSession';

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>()
  .use('*', cors)
  .get('/api/_internal/healthz', (c) => c.json({ ok: true }))
  .get('/api/_internal/hello-test-xyz123', (c) => c.json({ ok: true, marker: 'hello-test-xyz123' }))
  .get('/api/_internal/readyz', async (c) => {
    try {
      await c.env.DB.prepare('SELECT 1').first();
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ ok: false, error: String(e) }, 503);
    }
  })
  .route('/', healthRoute)
  .route('/', testRoute)
  .route('/', authRoute)
  .route('/', chatRoute)
  .route('/', chatHistoryRoute)
  .route('/', quizRoute)
  .route('/', examRoute)
  .route('/', meRoute)
  .route('/', flashcardsRoute)
  .route('/', vocabRoute)
  .route('/', adminRoute)
  .route('/', testRoute)
  .notFound((c) => c.json({ code: 'NOT_FOUND', message: 'No route' }, 404))
  .onError((e, c) => handleError(c, e));

export default {
  fetch: app.fetch,
  // DO exports are wired via wrangler.toml `new_sqlite_classes`
} satisfies ExportedHandler<Env>;// Force rebuild Sun Oct  4 02:05:22 +06 2026
