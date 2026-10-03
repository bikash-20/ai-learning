# Quantara
live: https://web-nine-rho-1j664llz3j.vercel.app/
<img width="1280" height="767" alt="image" src="https://github.com/user-attachments/assets/519fcd40-bd65-492f-9575-2714cb167a10" />
<img width="1280" height="767" alt="image" src="https://github.com/user-attachments/assets/48457f1d-eaa1-4112-9dda-c4d2067e5647" />



AI-powered English practice platform (IELTS, grammar, vocabulary).

- **Frontend:** Next.js 15 on Vercel (`apps/web`)
- **Backend:** Hono on Cloudflare Workers (`apps/api`)
- **AI:** Workers AI (primary) + OpenRouter (fallback)
- **DB:** Cloudflare D1 (SQLite at the edge)
- **Auth:** Better Auth (email magic-link via Resend + Google OAuth)
- **Shared:** Zod schemas + TS types (`packages/shared`)

## Local development

```bash
pnpm install
pnpm --filter api db:migrate:local
pnpm --filter api db:seed:local
pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:8787

## Deploy

See [`DEPLOY.md`](./DEPLOY.md) for the one-time setup (Cloudflare, Vercel, secrets) and the deploy loop.
