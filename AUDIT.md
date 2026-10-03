# Codebase Audit — ai-learning

Date: 2026-10-03
Repository: `/Users/bikashtalukder/ai-learning`

## TL;DR

The repo is an early‑stage scaffold for an AI‑powered English practice platform
(Next.js web + Hono on Cloudflare Workers + D1 + Workers AI/OpenRouter). The
high‑level architecture is sensible, but **both typecheck pipelines fail at the
repo root and there are several real bugs** that will break in production.
Most issues are concentrated in `apps/api` and stem from `drizzle-orm` and
`better-auth` version drift relative to the manifest.

```
Severity legend: 🔴 critical  🟠 high  🟡 medium  🟢 low  📝 informational
```

---

## 1. Repo‑level findings

### 1.1 🔴 `pnpm install` resolves against pinned minor versions that no longer exist

`apps/api/package.json` pins `drizzle-orm@^0.36.4`, `drizzle-kit@^0.30.1`,
`better-auth@^1.0.0`. After install, the resolved versions are
`better-auth@1.7.7`, `better-call@1.4.0`, `drizzle-orm@0.36.4`,
`drizzle-kit@0.30.6`. pnpm prints unmet‑peer warnings for every Better Auth
chain — `better-auth` requires `drizzle-orm ^0.45.2 || >=1.0.0-rc.1 <2.0.0`
and `drizzle-kit >=0.31.4`, and `better-call` requires `zod@^4.0.0` while the
project ships `zod@^3.24.1`. So:

- Drizzle schema uses the **0.36.4** API (array index/extraConfig form), but
  `indexBuilder[]` is not assignable to `SQLiteTableExtraConfig` in the
  installed Drizzle build → the schema fails `tsc --noEmit` (see §3.1).
- `better-auth` 1.7.7's Drizzle adapter expects Drizzle ≥ 0.45. Runtime is
  likely to throw on first auth request because the adapter looks for APIs
  (`getTableName`, relation helpers) that 0.36 doesn't have.
- `better-call` 1.4 wants Zod 4. `zod@3.24` will eventually surface as
  `.parse()` returning unknown shapes that mismatch Better Auth's expectations.

**Fix**: in `apps/api/package.json`, upgrade to a coherent set, e.g.

```json
"drizzle-orm": "^0.45.2",
"drizzle-kit": "^0.31.4",
"better-auth": "^1.2.0",
"zod": "^3.25.0"
```

(or pin a known‑good snapshot in `.pnpmfile.cjs` / lockfile). After
upgrading, re‑run `pnpm install` so a `pnpm-lock.yaml` is produced — the repo
ships **no lockfile** today (`frozen-lockfile` fails in CI).

### 1.2 🔴 No `pnpm-lock.yaml`

CI is currently non‑reproducible. `pnpm install --frozen-lockfile` fails with
`ERR_PNPM_NO_LOCKFILE`. Either commit the lockfile or document why it is
deliberately gitignored (it is not in `.gitignore`).

### 1.3 🟠 `.github/workflows/` is empty

The README references `DEPLOY.md` and a deploy loop. There are no GitHub
Actions workflows for typecheck/test/build/deploy. Recommend adding at least
`ci.yml` (typecheck + test) and `deploy.yml` (Wrangler + Vercel) before
shipping.

### 1.4 🟠 `DEPLOY.md` is referenced in README but does not exist

`README.md:26` points to `./DEPLOY.md`. The file is missing. Either write it
or remove the reference.

---

## 2. TypeScript / build configuration

### 2.1 🔴 `apps/api/tsconfig.json` makes `tsc --noEmit` fail with hard errors

```json
{
  "types": ["@cloudflare/workers-types", "vite/client"],
  "include": ["src/**/*", "scripts/**/*", "drizzle.config.ts"]
}
```

- `vite/client` is listed under `types` but the API is a Hono worker, not a
  Vite client. TS2688: *Cannot find type definition file for 'vite/client'.*
- `rootDir: "src"` conflicts with `include` that lists `scripts/**/*` and
  `drizzle.config.ts`, producing TS6059 (*File ... is not under rootDir*).

**Fix**:

```jsonc
{
  "compilerOptions": {
    "types": ["@cloudflare/workers-types"],
    "rootDir": ".",
    "outDir": "dist",
    "paths": { "@ai-learning/shared": ["../../packages/shared/src/index.ts"] }
  },
  "include": ["src/**/*", "scripts/**/*", "drizzle.config.ts", "../../packages/shared/src/*"]
}
```

Or split: keep one tsconfig for `src/` (with `rootDir: src`) and a separate
`tsconfig.scripts.json` for `scripts/` and `drizzle.config.ts` (no rootDir
restriction).

### 2.2 🟠 `apps/web/tsconfig.json` uses `noEmit: true` + `incremental: true` without listing `tsbuildinfo` in `.gitignore`

A stale `apps/web/tsconfig.tsbuildinfo` is in the tree (not gitignored — only
`*.tsbuildinfo` patterns are listed but this one is checked in). Add
`apps/*/tsconfig.tsbuildinfo` to `.gitignore` or remove the file.

### 2.3 🟡 `verbatimModuleSyntax` is explicitly disabled in `tsconfig.base.json`

```json
"verbatimModuleSyntax": false
```

With `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and ESM
`"type": "module"`, this combination frequently hides the difference between
type‑only and value imports (e.g. `import { auth } from './auth'` is fine, but
the codebase does need to be careful about type‑only imports). Today the
codebase doesn't break on it, but enabling it would catch the
`better-auth`'s `import type` from Hono types in `routes/chat.ts` etc. Worth
turning on after the dependency upgrade.

---

## 3. `apps/api` source — concrete typecheck failures & bugs

Running `tsc --noEmit` over `src/**` produces ~20 errors. Below are the
actionable ones:

### 3.1 🔴 `src/db/schema.ts` — extraConfig shape mismatch (4 tables)

Lines 52, 68, 83, 170 use:

```ts
sqliteTable('vocab', {...}, (t) => [
  uniqueIndex('vocab_word_idx').on(t.word),
  index('vocab_level_idx').on(t.level),
]);
```

TS2769: `IndexBuilder[]` is not assignable to `SQLiteTableExtraConfig`. This
is the classic Drizzle 0.36 vs 0.45 difference. Either:

- Wrap in an object: `(t) => ({ idx: [uniqueIndex(...).on(t.word)], lvlIdx: index(...).on(t.level) })`, or
- Upgrade Drizzle to ≥ 0.45 and adapt to the new shape.

This is a real compile error today, so **builds fail**.

### 3.2 🔴 `src/routes/chat.ts` — `node:crypto` is unavailable in Workers

```ts
import { randomUUID } from 'node:crypto';
```

`nodejs_compat` is enabled in `wrangler.toml`, but `tsconfig.json` doesn't
include `@cloudflare/workers-types` *node* shims, and TypeScript still
resolves `node:crypto` to nothing (`TS2307`). **Worse**, in Cloudflare
Workers, even with `nodejs_compat`, `crypto.randomUUID()` is the supported
path — there is no `node:crypto.randomUUID`. Replace with:

```ts
const randomUUID = () => crypto.randomUUID();
```

`crypto` is a global in Workers. Also, the `import { eq } from 'drizzle-orm'`
appears at the **bottom** of `chat.ts` (line 158) instead of the top — fine
for ESM but bad style and may trip linters.

### 3.3 🔴 `src/routes/chat.ts:36` — `'last' is possibly 'undefined'`

```ts
const last = body.messages[body.messages.length - 1];
// ...
content: last.content,
```

`noUncheckedIndexedAccess` makes `last` `ChatMessage | undefined`. The array
size is bounded by `min(1)`, so `last` is always defined — but the compiler
doesn't know that. Add a guard or assert:

```ts
const last = body.messages.at(-1);
if (!last) throw new HTTPException(400, { message: 'empty' });
```

### 3.4 🟠 `err()` / `handleError()` Hono Context variance (many sites)

The pattern `Context<{ Bindings: Env }>` is used in helpers
(`err`, `handleError`, `idemMiddleware`) while callers have
`Context<{ Bindings: Env; Variables: { userId: string } }>`. Hono's
`Context` is invariant in `Variables`, so TS2345 fires at every call site:
`index.ts:29`, `lib/ratelimit.ts:28`, `lib/requireAuth.ts:9`,
`routes/auth.ts:13`, `routes/chat.ts:126/140/155`, `routes/quiz.ts:53/101`.

**Fix** (any of):

- Change helpers to `Context<{ Bindings: Env; Variables: any }>`.
- Or use Hono's `AnyContext` (re‑exported as `Context`).
- Or stop passing `c` into `err()`/`handleError()` and let them take a thin
  object `{ env, json, header }`.

### 3.5 🟠 `src/lib/errors.ts:7` — `status` cast is too narrow

```ts
return c.json(body, status as 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 | 502 | 503);
```

TS won't let you arbitrarily narrow `status: number` to a literal union.
Accept `status: Parameters<typeof c.json>[1]` or use a wider type.

### 3.6 🟠 `src/lib/cors.ts` — cookie/Authorization allowed without explicit per‑origin allow

```ts
const allowed = (c.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim());
const origin = c.req.header('origin') ?? '';
const allow = allowed.includes(origin) ? origin : allowed[0] ?? '';
c.header('Access-Control-Allow-Origin', allow);
c.header('Access-Control-Allow-Credentials', 'true');
```

- If `ALLOWED_ORIGINS` is unset, `allow = ''` (empty string) → CORS header is
  present but empty. With credentials mode `true` browsers will reject
  cross‑origin requests, so the bug is "soft fail" today — but the response
  carries `Access-Control-Allow-Credentials: true` with no allow‑origin,
  which is a smell. Fail closed: `if (!allowed.includes(origin)) return
  new Response(null, { status: 403 })` for non‑OPTIONS or skip the
  credentials header.
- The `origin: c.req.header('origin') ?? ''` is fine but the empty string
  shouldn't equal any allowed value.

### 3.7 🟠 `src/lib/ratelimit.ts` — DO calls bypass `err()` type; `X-RateLimit-*` headers on success use stale values

The DO `check` returns `{ok:true}` only after mutating state, so the rate
limit counter is incremented once per successful call. But the rate limiter
DO buckets live **per user** with `idFromName(userId)`, and counters are
**per route string** stored on the same DO instance — which is fine. The
real bug is more subtle:

- `BUCKETS.explain` (100/day) is defined but **no route currently uses
  `explain`** — the explain call in `routes/quiz.ts` uses `chatJson(...,,
  'explain', ...)`. That's OK semantically, but **the chat bucket
  (`30/day`) is the only thing protecting streaming chat**, which is also
  the most expensive endpoint. Consider lowering `chat` further or
  splitting per‑token cost.
- `idemStore` writes `body` even when the response body is an SSE stream
  — currently it writes `{ ok: true }` JSON; clients won't ever replay
  SSE responses (they would need the original stream). So the
  idempotency replay path is **only useful for non‑streaming JSON**;
  for SSE it just records a useless blob. Not a bug per se, but the
  header is misleading on replay.

### 3.8 🟠 `src/durable/RateLimiter.ts` — idempotency store is unbounded

```ts
private idempotency = new Map<string, { ... }>();
```

This `Map` never has entries evicted beyond the per‑entry TTL check, and
the DO is **per user** for rate buckets but `global-idem` (a *single* DO
instance) for idempotency. So all users share one DO's memory, which
grows forever until eviction. Two fixes:

1. Add a periodic sweep that deletes expired entries.
2. Switch `idemStore` to use `storage.sql`/`storage.put` with TTL via
   `expirationTtl`, so Workers handles eviction.

Today a low‑traffic attacker could fill memory by spamming with unique
`Idempotency-Key` headers.

### 3.9 🟡 `src/routes/quiz.ts:77-83` — `chatJson` is misused for free text

```ts
const exp = await chatJson(c.env, 'explain', {
  system: '...',
  messages: [{ role: 'user', content: EXPLAIN_PROMPT(...) }],
}, (raw) => raw as string).catch(() => null);
aiExplanation = exp?.parsed ? String(exp.parsed).slice(0, 600) : it.explanation;
```

`chatJson` *requires* JSON output (`HEDGE`-based authoritative retry). But
the `EXPLAIN_PROMPT` asks for "only the explanation text, no preamble."
These two are in tension: the AI's prose will not parse as JSON, the
`HEDGE` retry path will fire, OpenRouter will be hit, the JSON parse will
finally fail and throw, the catch returns null, and the explanation falls
back to `it.explanation` — which is **already stored in the DB** for the
correct answer. Net result: this code path **always** ends up storing the
statically‑authored explanation; the AI explanation never persists. Either:

- Change `EXPLAIN_PROMPT` to ask for JSON, then validate the structure.
- Or use `chat()` (non‑JSON) and store the text directly.

Also: `It.explain` for correct answers is dead code — the `if (!correct)`
branch is the only one that calls the AI. Fine, just noisy.

### 3.10 🟡 `src/routes/quiz.ts:69` — `find` over the items array per answer is O(n²); quiz has no auth check

```ts
for (const ans of body.answers) {
  const it = dbItems.find((x) => x.id === ans.itemId);
```

`dbItems` is fetched once and indexed by id with a `Map` for O(1) lookup.
Better: `const itemsById = new Map(dbItems.map(d => [d.id, d]))`. Also:
**anyone can submit an attempt for any quiz** — there is no check that
`body.quizId` belongs to `c.get('userId')`. A logged‑in user can submit
answers to a quiz they didn't generate, and the `quiz` table does have
`ownerId` but it isn't checked. Add: `if (quiz.ownerId && quiz.ownerId !==
userId) return 403`.

### 3.11 🟡 `src/routes/quiz.ts` — `quiz.source = 'ai'` is hard‑coded

```ts
await db.insert(schema.quiz).values({
  id: quizId,
  ownerId: c.get('userId'),
  source: 'ai',  // always 'ai'
  ...
});
```

There is no other source path. Either drop the column or add a non‑AI path
later. Today it's misleading documentation.

### 3.12 🟡 `src/ai/provider.ts:36-38` — `usage` shape assumed

```ts
const r = res as { response?: string; usage?: { tokens?: number } };
```

Workers AI's Llama 3.3 returns `{ response: string }` but its usage shape
varies by model (some return `{ tokens: number }`, others return
`{ prompt_tokens, completion_tokens }`). The cast masks actual differences
and may report `0` for `tokens` on every call. The chat route also
recomputes tokens via `Math.ceil(fullText.length / 4)` for SSE, which is a
fine proxy — but the two values will disagree.

### 3.13 🟡 `src/ai/provider.ts:21` — `HEDGE` regex misses `likely`

```ts
const HEDGE = /\b(i'?m not sure|i think maybe|as an ai|as a language model|it depends|could be|might be)\b/i;
```

- `could be`/`might be` will match legitimate English text in **any**
  output, including user answers in `/api/quiz/attempt` and any chat reply
  that legitimately contains "might be able to...". The chat path uses
  non‑authoritative, so this is mostly fine, but `chatJson` always passes
  `authoritative: true`, so any quiz‑gen output that contains "could be"
  triggers an unnecessary OpenRouter fallback. Consider tightening the
  regex or removing `could be`/`might be`.
- Also: `HEDGE` does not include obvious hedges like `I think`, `possibly`,
  `perhaps`, `I'm not entirely sure`. Add or remove, but make it explicit.

### 3.14 🟡 `src/ai/provider.ts` — fallback can double‑bill and double‑rate‑limit

```ts
} catch (e) {
  console.warn('workers_ai_fallback', { route, err: String(e) });
  const out = await openRouterChat(env, input);
  ...
}
```

`chat()` calls `workersChat` then on *any* throw, calls `openRouterChat`.
If `openRouterChat` also throws, the error propagates and the route handler
returns 500. There's no exponential backoff, no circuit breaker, and the
upstream failure is sent straight to the user with no retry. For a free
fallback model this is fine in dev, but **a single Workers AI rate‑limit
event will simultaneously hammer OpenRouter and may hit its free quota
within minutes**. Add at minimum a per‑route cooldown in the
`RateLimiter` DO.

### 3.15 🟡 `src/routes/auth.ts` — Better Auth handler is proxied directly

```ts
.on(['GET', 'POST'], '/api/auth/*', async (c) => {
  try {
    return await auth(c.env).handler(c.req.raw);
  } catch (e) {
    return handleError(c, e);
  }
})
```

`handleError` returns 500 with a generic message and `console.error(e)`.
For Better Auth errors (which contain `code`, `status`) this is wrong —
Better Auth's `handler` already constructs an HTTP response; re‑throwing
the error and converting to a generic 500 hides validation failures from
the client. Let Better Auth's response pass through unchanged:

```ts
return auth(c.env).handler(c.req.raw);
```

…and add an `.onError` that returns the proper shape only if
`handleError` sees a *non*-Better‑Auth error.

### 3.16 🟡 `src/lib/auth.ts` — magic‑link is not actually wired

```ts
emailAndPassword: { enabled: false }, // magic-link only
emailVerification: undefined,
```

`RESEND_API_KEY` and `RESEND_FROM` are declared in `Env` but never used.
The "magic‑link only" comment is aspirational; in fact there is **no
way to sign up or log in today**. The web app has no `/sign-in` page, no
call to `/api/auth/*` for signin, and the protected API routes will
return 401 forever. Either:

- Wire up Better Auth's magic‑link plugin (it lives in
  `better-auth/plugins`), or
- Use `emailAndPassword: { enabled: true }` for a v1 and add magic link
  later.

This is a functional blocker, not a code‑quality issue.

### 3.17 🟡 `src/routes/quiz.ts:59-71` — race condition between fetch and insert

The code does:

```ts
const dbItems = await db.select().from(schema.quizItem).where(...);
if (dbItems.length === 0) return 404;
const attemptId = randomUUID();
await db.insert(schema.quizAttempt).values({ id: attemptId, userId, quizId: body.quizId, score: 0 });
```

If the quiz has zero items at fetch time (deleted between routes), we
return 404, but if it has items the attempt row is inserted with
`score: 0` then **mutated later** (`update ... set({ score, finishedAt
})`). If the loop throws (e.g. AI call permanently fails), the attempt
row remains in DB with `score: 0, finishedAt: null` — an "in‑flight"
attempt. There's no expiry or cleanup. Consider a single transaction, or
at least `try/catch` the loop and `db.delete(quizAttempt).where(id =
attemptId)` on failure.

### 3.18 🟢 `src/lib/ratelimit.ts:33-42` — `idemMiddleware` returns `null` to mean "no cached response"

Returning `null` from a Hono middleware is the standard "continue"
pattern. But here it's typed `Promise<Response | null>` and called like
`if (cached) return cached`. Fine, just be aware the contract is implicit.

### 3.19 🟢 `src/lib/analytics.ts` — fine. No findings.

### 3.20 🟢 `src/routes/chat.ts:96-128` — fallback exception handler does not also persist partial output

If the SSE stream throws mid‑way, the `controller.enqueue(sse('error', ...))`
fires but the partial `fullText` is **not persisted**. For cost tracking,
this means a failed stream looks identical to a never‑started one. Either
persist `fullText` (possibly truncated) or mark the chat message row as
`partial: 1` so it can be retried.

### 3.21 🟢 `src/index.ts:18` — `readyz` returns 503 with raw `String(e)`

```ts
return c.json({ ok: false, error: String(e) }, 503);
```

This will leak SQL or D1 internal errors to public probes. In dev, fine;
in prod, replace with a generic message.

---

## 4. `apps/web` source — bugs and issues

### 4.1 🔴 `app/quiz/page.tsx:78-85` — `it` is possibly `undefined`

```ts
const it = s.items[s.idx];       // QuizItem | undefined
const picked = s.picks[s.idx];
return (
  ...
  <h2 ...>{it.prompt}</h2>
  ...
  {it.options.map(...)}
);
```

`noUncheckedIndexedAccess` flags this. The render path is reached only
when `idx < items.length` (enforced at the Next button), so `it` is
guaranteed defined — but the compiler doesn't know. Add a guard:

```tsx
if (!it) return null;
```

### 4.2 🔴 `app/quiz/page.tsx:35` — `it.id ?? ''` masks missing IDs

```ts
.map((it, i) => ({ itemId: it.id ?? '', picked: s.picks[i] }))
```

The shared `QuizItem` schema has **no `id` field** (`packages/shared/src/index.ts:70-76`).
The API's response adds `id` per item at insert time but the shared
schema isn't updated. So `it.id` is `undefined`, every answer is sent
with `itemId: ''`, and the server's `find` returns nothing → no scoring.
**Fix**: add `id: z.string().uuid()` to the `QuizItem` schema (the items
table does store UUIDs), and rely on that field on the client.

### 4.3 🟠 `app/quiz/page.tsx:36` — `a.picked !== undefined` filter may submit empty

`picks: Record<number, number>` — `picked` is always a number if set, but
`Object.keys(s.picks).length !== s.items.length` only checks for keys,
not for indices in `[0, items.length)`. Edge case when `n > generated
items`. Low impact.

### 4.4 🟠 `app/chat/page.tsx:42-46` — wrong SSE event parsing

```ts
for (const line of dec.decode(value, { stream: true }).split('\n')) {
  if (!line.startsWith('data:')) continue;
  try {
    const j = JSON.parse(line.slice(5).trim());
    if (j.response !== undefined) acc += j.response;
  } catch {}
}
```

The server emits **two** kinds of SSE events: `event: token\ndata: ...`
and `event: done\ndata: ...`. The `line.startsWith('data:')` filter
correctly skips the `event:` lines, but the client only updates
`acc` from `j.response` — and the server actually sends `{ text: ... }`
(see `routes/chat.ts:70`):

```ts
controller.enqueue(sse('token', { text: j.response }));
```

So the client never gets text. Either change the server to send
`{ response: ... }` or change the client to read `j.text`. The current
state will display an empty assistant bubble.

### 4.5 🟠 `app/chat/page.tsx:32` — `setStreaming(false)` after `!res.ok` returns but `setMessages` already added an empty assistant message

After a failed POST, the empty assistant bubble remains. Consider
removing the optimistic empty bubble on failure.

### 4.6 🟡 `lib/api.ts` is unused

Every page calls `fetch(\`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/...\`)` directly
instead of using `lib/api.ts`. Either delete `lib/api.ts` or refactor
the pages to use it. Also, `process.env.NEXT_PUBLIC_API_BASE_URL` is
typed as `string | undefined` — pages assume it's set. Default it in one
place (`lib/api.ts`) and use that constant.

### 4.7 🟡 No auth flow on the web side

There is no `signIn` call to `/api/auth/*`, no session check on
`/api/me`, no UI for login. Combined with §3.16 (no magic‑link wired),
the web app is unauthenticated. The README's claim that "magic‑link
via Resend" is the auth path is aspirational.

### 4.8 🟡 No global error boundary, no `loading.tsx`/`error.tsx`/`not-found.tsx`

For a Next 15 app, these are standard. `error.tsx` should be `'use client'`
and reset on retry; not present.

### 4.9 🟢 `app/providers.tsx` — fine. Could memoize options object but minor.

### 4.10 🟢 `app/globals.css` and `tailwind.config.ts` — fine for v1. No dark mode, no design tokens beyond three colors.

---

## 5. `packages/shared` source

### 5.1 🟡 Schema drift vs API behavior

- `QuizItem` lacks `id`, but the API hands UUIDs back. See §4.2.
- `ChatMessage` has no `id` either. `chat/history` returns `{ role,
  content, createdAt }` only (good — that's fine), but `chat_message`
  Drizzle schema has a UUID PK.
- `Role` enum allows `'system'`. Client never sends `'system'`. Fine but
  defensive: consider `Role = z.enum(['user', 'assistant'])`.

### 5.2 🟡 `Role` type re‑export collision

```ts
export const Role = z.enum([...]);
export type Role = z.infer<typeof Role>;
```

`verbatimModuleSyntax: false` makes this compile, but it can confuse
ESM tooling. With `verbatimModuleSyntax: true`, this needs to be
split. Recommend:

```ts
export const RoleSchema = z.enum([...]);
export type Role = z.infer<typeof RoleSchema>;
```

(Repeat for `Level`, `Topic`, `QuizSource`, `ExamKind`.)

### 5.3 🟢 No tests. The `test` script echoes "no tests for shared". At
minimum, add unit tests for the Zod schemas (valid/invalid fixtures).

---

## 6. Migrations / schema

### 6.1 🟠 `0000_init.sql` includes tables not used by routes

`flash_deck`, `flash_card`, `review`, `exam_template`, `exam_attempt`,
`chat_message` (write/read partially). The schema is v1+ work, but
there are **no routes** for flashcards or exams. Either:

- Move them into a `2024_…_flashcards.sql` migration, or
- Remove unused tables and add them when the routes ship.

### 6.2 🟡 `quiz_attempt.score` is set twice (insert with `0`, then
`update` later). If the loop fails between, the attempt row sits with
`finishedAt: null`. See §3.17.

### 6.3 🟡 `account.password` is `text` (nullable) — Better Auth's docs
say it should be `text NOT NULL` if `emailAndPassword` is enabled. Since
the project disables password auth, fine — but consider dropping the
column.

---

## 7. Security observations

### 7.1 🟠 Better Auth `secret` and D1 binding are not rotated

No `.env.example` for the API. The README references `wrangler secret
put`. OK, but **the local dev path uses `wrangler dev` with no
secret** — calling `/api/auth/*` locally without `BETTER_AUTH_SECRET`
will fail in a way that's hard to diagnose. Document the required
`.dev.vars` file.

### 7.2 🟠 `cors.ts` always sets `Access-Control-Allow-Credentials: true`

Even when the origin is not in `allowed`. Browsers reject the response,
but the credential header is still emitted and may interact with
proxies/extensions in unexpected ways. Set it conditionally:

```ts
if (allowed.includes(origin)) c.header('Access-Control-Allow-Credentials', 'true');
```

### 7.3 🟡 No rate limit on `/api/quiz/attempt`

A user with a valid `quizId` could DoS the per‑answer AI explanation
endpoint (one AI call per wrong answer). Add a per‑attempt rate limit
(20/min) or cap the loop at e.g. 5 wrong answers with explanations.

### 7.4 🟡 `chat_message` rows are unbounded

A user can send up to 30 chats/day (rate limit) × 8 KB each × N days
forever — `chat_message` grows without bound. Add a retention job (e.g.
cron trigger) that deletes rows older than N days.

### 7.5 🟡 `/api/vocab` and `/api/grammar` are unauthenticated

Reading public vocab is fine, but `/api/quiz/attempt` uses
`requireAuth`. Be consistent — or be deliberate. Add a comment.

### 7.6 🟢 `auth.ts` does not trust `session.user.email` for routing.
Good.

---

## 8. Performance / cost

### 8.1 🟠 AI explanations in the wrong‑answer loop can be expensive

`/api/quiz/attempt` calls `chatJson('explain', ...)` for **every wrong
answer**. For a 5‑question quiz where a user gets all 5 wrong, that's 5
sequential AI calls (because of the HEDGE JSON retry, up to 10). At
`explain` bucket 100/day, a power user can hit quota quickly. Consider:

- Concurrent explanation generation with `Promise.all`.
- A small cache key based on `(prompt, correctAnswer)` for repeated
  wrong answers.

### 8.2 🟡 No streaming for `quiz/from-topic`

The user waits for full JSON before the quiz is shown. Streaming with a
JSON‑partial parser would halve perceived latency.

### 8.3 🟡 `chat/history` returns up to 200 rows in chronological order

No pagination. For long histories, this will be slow on D1 (full table
scan plus serialization). Add `?cursor=` keyset pagination.

### 8.4 🟢 `workersChat` doesn't reuse connections

Workers `fetch` reuses connections automatically; nothing to fix.

---

## 9. Tooling

### 9.1 🟠 No ESLint config files exist

`apps/api/package.json` has `"lint": "eslint src"` and `apps/web` has
`"lint": "next lint"` — but `eslint.config.{js,mjs,ts}` is missing in
both. `next lint` will warn "No ESLint configuration detected". Add
configs.

### 9.2 🟠 `vitest` is configured but no tests exist

`apps/api/package.json` declares `"test": "vitest run"`; no `*.test.ts`
files exist. Either add tests or drop the script.

### 9.3 🟡 `prettier` is the only formatter. No `lint-staged`/husky

Recommend adding a pre‑commit hook so commits don't break CI formatting.

### 9.4 🟡 No Turbo/Nx cache, despite `.gitignore` excluding `.turbo/`

`pnpm -r --parallel run dev` is fine for a 4‑package monorepo, but
adding Turbo will speed up typecheck/lint/test cycles and enable remote
caching.

---

## 10. Quick wins (do today)
1. Add a `pnpm-lock.yaml` and commit it. (🔴)
2. Fix `apps/api/tsconfig.json` `rootDir` + `types`. (🔴)
3. Upgrade `drizzle-orm` / `drizzle-kit` / `better-auth` / `zod` to a
   coherent set. (🔴)
4. Replace `import { randomUUID } from 'node:crypto'` with `crypto.randomUUID()`
   and move `import { eq }` to the top of `routes/chat.ts`. (🔴)
5. Add `id` to `QuizItem` in `packages/shared` and read `it.id` on the
   client. (🔴)
6. Fix the chat SSE client parsing to read `j.text` instead of
   `j.response`. (🟠)
7. Add `if (!it) return null;` to `app/quiz/page.tsx`. (🔴)
8. Add an `.env.example` to `apps/api/` documenting `BETTER_AUTH_SECRET`,
   `BETTER_AUTH_URL`, `RESEND_*`, `OPENROUTER_*`. (🟡)
9. Write `DEPLOY.md` (referenced from README). (🟠)
10. Add at least a `ci.yml` workflow. (🟠)

---

## 11. Suggested next steps (medium term)

- Decide on Better Auth plugin path (magic‑link vs password) and ship a
  `/sign-in` page on the web.
- Implement DO eviction for the idempotency map and consider a small LRU.
- Add ESLint configs and Vitest smoke tests for the routes (Hono's
  `app.request()` is easy to test).
- Add `error.tsx`, `loading.tsx`, `not-found.tsx` for the web app.
- Add a `cron` Worker for `chat_message` retention and analytics flush.

---

## Appendix A: typecheck command outputs

### `pnpm --filter @ai-learning/shared typecheck`

Exits 0 — clean.

### `pnpm --filter @ai-learning/api typecheck`

Fails before source check:

```
error TS2688: Cannot find type definition file for 'vite/client'.
error TS6059: File 'apps/api/drizzle.config.ts' is not under 'rootDir' 'apps/api/src'.
error TS6059: File 'apps/api/scripts/seed.ts' is not under 'rootDir' 'apps/api/src'.
```

After bypassing those, the source‑level errors are summarized in §3
(20 distinct errors across `db/schema.ts`, `index.ts`, `lib/*`,
`routes/*`).

### `pnpm --filter @ai-learning/web typecheck`

```
app/quiz/page.tsx(83,53): error TS18048: 'it' is possibly 'undefined'.
app/quiz/page.tsx(85,12): error TS18048: 'it' is possibly 'undefined'.
```

(Plus the §4.2 schema bug that compiles only because `QuizItem.id` is
optional — runtime will be wrong.)