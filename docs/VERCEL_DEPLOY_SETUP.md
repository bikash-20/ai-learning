# Vercel auto-deploy setup

The `.github/workflows/deploy-web.yml` workflow auto-builds and deploys
`apps/web` to Vercel on every push to `main`. It needs three repo
secrets; set them once and forget.

## 1. Get the values

```bash
# Already in apps/web/.vercel/project.json (gitignored):
#   projectId: prj_vt7GBDDjVk0oiEN6Cra6VJn4Gnkw
#   orgId:     team_Hn2n2SLNIQKACaKcA1LsB2Ky

# Create a Vercel API token at:
#   https://vercel.com/account/tokens
# Scope: full account access, name it "GitHub Actions"
```

## 2. Add the secrets

```bash
gh secret set VERCEL_TOKEN     --repo bikash-20/ai-learning --body "<vercel_token>"
gh secret set VERCEL_ORG_ID    --repo bikash-20/ai-learning --body "team_Hn2n2SLNIQKACaKcA1LsB2Ky"
gh secret set VERCEL_PROJECT_ID --repo bikash-20/ai-learning --body "prj_vt7GBDDjVk0oiEN6Cra6VJn4Gnkw"
```

(Or add them at
`https://github.com/bikash-20/ai-learning/settings/secrets/actions`.)

## 3. Trigger a deploy

```bash
gh workflow run deploy-web.yml --repo bikash-20/ai-learning --ref main
gh run watch --repo bikash-20/ai-learning
```

The first run will create a fresh production deployment and roll the
alias `web-nine-rho-1j664llz3j.vercel.app` (and any custom domains)
onto it.

## Manual fallback (until secrets are set)

```bash
cd apps/web
vercel deploy --prod --yes
```

## What deploy-web does

- Triggered on push to `main` when `apps/web/**`, `packages/**`, or
  this workflow file changes.
- Runs `pnpm install --frozen-lockfile` once for the monorepo.
- `amondnet/vercel-action@v25` builds `apps/web` (Next.js) using
  `apps/web/vercel.json` (`buildCommand: pnpm --filter @quantara/web
  build`, framework: nextjs, root: apps/web) and promotes to
  production.
- Concurrency group `deploy-web` prevents two deploys racing; the
  later one waits for the earlier one.

## Why it was failing before

The repo root had no Next.js app, so plain `vercel deploy` from the
monorepo root kept erroring. `apps/web/vercel.json` pins the build
command + framework so the action builds the right thing.