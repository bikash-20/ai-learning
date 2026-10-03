import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../env';
import { requireAuth } from '../lib/requireAuth';
import { withCors } from '../lib/cors';
import { err } from '../lib/errors';
import { drizzle } from 'drizzle-orm/d1';
import { and, eq, desc, asc } from 'drizzle-orm';
import * as schema from '../db/schema';
import { ErrorCode } from '@quantara/shared';

const CreateConversation = z.object({
  mode: z.enum(['general', 'code', 'math', 'theory', 'explain']).default('general'),
});
const PatchConversation = z.object({
  title: z.string().min(1).max(80),
});

const finalize = (c: { env: Env; req: { header: (k: string) => string | undefined } }, res: Response) =>
  withCors(c.env, c.req.header('origin') ?? '', res);

/**
 * Conversation CRUD + per-conversation message fetch.
 *
 *   GET    /api/chat/conversations                  — list (last 50)
 *   POST   /api/chat/conversations                  — create ({mode})
 *   PATCH  /api/chat/conversations/:id              — rename ({title})
 *   DELETE /api/chat/conversations/:id              — cascade delete messages
 *   GET    /api/chat/conversations/:id/messages     — all messages, oldest first
 *
 * All routes require auth. CORS is stamped explicitly because the
 * PATCH/DELETE methods are not in the default Access-Control-Allow-Methods
 * list of some origins.
 */
export const chatHistoryRoute = new Hono<{ Bindings: Env; Variables: { userId: string } }>()
  .get('/api/chat/conversations', requireAuth, async (c) => {
    try {
      const userId = c.get('userId');
      const db = drizzle(c.env.DB, { schema });
      const rows = await db
        .select({
          id: schema.conversation.id,
          title: schema.conversation.title,
          mode: schema.conversation.mode,
          createdAt: schema.conversation.createdAt,
          updatedAt: schema.conversation.updatedAt,
        })
        .from(schema.conversation)
        .where(eq(schema.conversation.userId, userId))
        .orderBy(desc(schema.conversation.updatedAt))
        .limit(50);
      return finalize(c, c.json({ conversations: rows }));
    } catch (e) {
      return finalize(c, err(c, 500, ErrorCode.Internal, String(e)));
    }
  })
  .post('/api/chat/conversations', requireAuth, async (c) => {
    let body: z.infer<typeof CreateConversation>;
    try {
      body = CreateConversation.parse(await c.req.json());
    } catch (e) {
      return finalize(c, err(c, 400, ErrorCode.ValidationError, 'Invalid request', { details: String(e) }));
    }
    try {
      const userId = c.get('userId');
      const id = crypto.randomUUID();
      const db = drizzle(c.env.DB, { schema });
      await db.insert(schema.conversation).values({
        id,
        userId,
        title: 'New chat',
        mode: body.mode,
      });
      const row = await db
        .select({
          id: schema.conversation.id,
          title: schema.conversation.title,
          mode: schema.conversation.mode,
          createdAt: schema.conversation.createdAt,
          updatedAt: schema.conversation.updatedAt,
        })
        .from(schema.conversation)
        .where(and(eq(schema.conversation.id, id), eq(schema.conversation.userId, userId)))
        .limit(1);
      return finalize(c, c.json({ conversation: row[0] ?? null }));
    } catch (e) {
      return finalize(c, err(c, 500, ErrorCode.Internal, String(e)));
    }
  })
  .patch('/api/chat/conversations/:id', requireAuth, async (c) => {
    const id = c.req.param('id');
    if (!id) return finalize(c, err(c, 400, ErrorCode.ValidationError, 'id is required'));
    let body: z.infer<typeof PatchConversation>;
    try {
      body = PatchConversation.parse(await c.req.json());
    } catch (e) {
      return finalize(c, err(c, 400, ErrorCode.ValidationError, 'Invalid request', { details: String(e) }));
    }
    try {
      const userId = c.get('userId');
      const db = drizzle(c.env.DB, { schema });
      const result = await db
        .update(schema.conversation)
        .set({ title: body.title, updatedAt: new Date() })
        .where(and(eq(schema.conversation.id, id), eq(schema.conversation.userId, userId)));
      const success = (result as { changes?: number; rowsWritten?: number }).changes
        ?? (result as { rowsWritten?: number }).rowsWritten
        ?? 1;
      if (!success) return finalize(c, err(c, 404, ErrorCode.NotFound, 'Conversation not found'));
      return finalize(c, c.json({ ok: true }));
    } catch (e) {
      return finalize(c, err(c, 500, ErrorCode.Internal, String(e)));
    }
  })
  .delete('/api/chat/conversations/:id', requireAuth, async (c) => {
    const id = c.req.param('id');
    if (!id) return finalize(c, err(c, 400, ErrorCode.ValidationError, 'id is required'));
    try {
      const userId = c.get('userId');
      const db = drizzle(c.env.DB, { schema });
      await db
        .delete(schema.conversation)
        .where(and(eq(schema.conversation.id, id), eq(schema.conversation.userId, userId)));
      return finalize(c, c.json({ ok: true }));
    } catch (e) {
      return finalize(c, err(c, 500, ErrorCode.Internal, String(e)));
    }
  })
  .get('/api/chat/conversations/:id/messages', requireAuth, async (c) => {
    const id = c.req.param('id');
    if (!id) return finalize(c, err(c, 400, ErrorCode.ValidationError, 'id is required'));
    try {
      const userId = c.get('userId');
      const db = drizzle(c.env.DB, { schema });
      // Confirm ownership before returning messages.
      const owns = await db
        .select({ id: schema.conversation.id })
        .from(schema.conversation)
        .where(and(eq(schema.conversation.id, id), eq(schema.conversation.userId, userId)))
        .limit(1);
      if (owns.length === 0) return finalize(c, err(c, 404, ErrorCode.NotFound, 'Conversation not found'));

      const rows = await db
        .select({
          id: schema.conversationMessage.id,
          role: schema.conversationMessage.role,
          content: schema.conversationMessage.content,
          provider: schema.conversationMessage.provider,
          model: schema.conversationMessage.model,
          tokens: schema.conversationMessage.tokens,
          createdAt: schema.conversationMessage.createdAt,
        })
        .from(schema.conversationMessage)
        .where(eq(schema.conversationMessage.conversationId, id))
        .orderBy(asc(schema.conversationMessage.createdAt))
        .limit(500);
      return finalize(c, c.json({ messages: rows }));
    } catch (e) {
      return finalize(c, err(c, 500, ErrorCode.Internal, String(e)));
    }
  });