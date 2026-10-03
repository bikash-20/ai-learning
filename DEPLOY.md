# Deploy (one-time, ~20 minutes)

You do these once. After that, every push to `main` deploys both apps via CI.

## 0. Prerequisites (have these ready)

- Cloudflare account (free is fine)
- GitHub account
- Vercel account
- A Resend account + API key (free, 3k emails/month)
- An OpenRouter account + API key (free models available)
- Google Cloud project with an OAuth 2.0 Client ID (optional, but recommended)

## 1. GitHub repo

```bash
cd ~/ai-learning
git init
git add .
git commit -m "feat: scaffold ai learning platform"
gh repo create ai-learning --private --source=. --remote=origin --push
```

## 2. Cloudflare: API token, D1 database, KV (skip KV for v1)

```bash
# Login once
pnpm dlx wrangler login

# Create D1
pnpm --filter @ai-learning/api exec wrangler d1 create ai-learning-db
# Copy the printed `database_id` into apps/api/wrangler.toml (replace REPLACE_AFTER_WRANGLER_D1_CREATE)

# Apply migrations to remote
pnpm --filter @ai-learning/api db:migrate:remote

# Seed vocab + grammar
pnpm --filter @ai-learning/api db:seed:remote
```

## 4. Secrets (run from repo root)

```bash
cd apps/api

# Better Auth
pnpm dlx wrangler secret put BETTER_AUTH_SECRET     # any 32+ random string; e.g. `openssl rand -hex 32`
pnpm dlx wrangler secret put BETTER_AUTH_URL         # https://<your-worker>.workers.dev

# Google OAuth (optional — get from Google Cloud Console → OAuth Client)
pnpm dlx wrangler secret put GOOGLE_CLIENT_ID
pnpm dlx wrangler secret put GOOGLE_CLIENT_SECRET

# Resend (magic-link email)
pnpm dlx wrangler secret put RESEND_API_KEY
pnpm dlx wrangler secret put RESEND_FROM             # e.g. "AI Learning <no-reply@yourdomain.com>" (must be a verified Resend sender)

# OpenRouter (fallback)
pnpm dlx wrangler secret put OPENROUTER_API_KEY
pnpm dlx wrangler secret put OPENROUTER_MODEL        # e.g. "meta-llama/llama-3.3-70b-instruct:free"
```

## 5. Deploy the Worker

```bash
pnpm --filter @ai-learning/api deploy
```

Note the printed Worker URL (`https://ai-learning-api.<your-subdomain>.workers.dev`). Put it in `.github/workflows/deploy-api.yml` if you wire CI auto-deploy, and put it into the Vercel env in the next step.

## 6. Vercel

1. Go to https://vercel.com/new and import the GitHub repo.
3. Set **Root Directory** to `apps/web`.
4. Add env var: `NEXT_PUBLIC_API_BASE_URL` = your Worker URL from step 5.
5. Deploy.

After first deploy, come back to `apps/api/wrangler.toml` and replace `REPLACE_AFTER_VERCEL_DEPLOY.vercel.app` in `[env.production.vars].ALLOWED_ORIGINS` with your actual Vercel URL. Then `pnpm --filter @ai-learning/api deploy` again.

## 7. GitHub Actions secrets

In your GitHub repo: Settings → Secrets and variables → Actions, add:

- `CF_API_TOKEN` — Cloudflare API token with `Workers Scripts:Edit` + `D1:Edit`
- `CF_ACCOUNT_ID` — Cloudflare account ID (found on the Workers dashboard)

CI deploys the Worker on every push to `main`. Vercel auto-deploys the web app.

## Day-to-day

```bash
git add -A
git commit -m "msg"
git push   # Worker + Web both deploy
```

## Local development

```bash
pnpm install
pnpm --filter @ai-learning/api db:migrate:local
pnpm --filter @ai-learning/api db:seed:local
pnpm dev
```

API at http://localhost:8787, web at http://localhost:3000.