# Google OAuth setup (Cloud Console)

End-to-end steps to turn on **"Continue with Google"** on the deployed Worker.

> Time: ~5 min. Cost: free. Nothing in this doc changes app code; only Google Cloud Console + Cloudflare Worker secrets.

---

## 1. Open Google Cloud Console

Go to <https://console.cloud.google.com/> and sign in with the Google account you want to own the OAuth client.

Pick or create a project. Top-left → project picker → **New project** → name it `ai-learning` (or anything) → **Create**.

---

## 2. Configure the OAuth consent screen

Before you can create a client, Google needs the consent screen.

1. Left sidebar → **APIs & Services** → **OAuth consent screen**.
2. User type: **External** (unless you have a Workspace and want to limit to your org).
3. Fill in:
   - **App name**: `AI Learning`
   - **User support email**: your email
   - **Developer contact email**: your email
4. **Scopes**: click **Add or remove scopes**, enable:
   - `…/auth/userinfo.email`
   - `…/auth/userinfo.profile`
   - `openid`
5. **Test users** (only required while the app is in "Testing"): add any Gmail addresses you'll use to sign in.
6. **Save and continue** until the summary page, then **Back to dashboard**.

(You can leave Publishing status = "Testing" while you verify. To allow anyone with a Google account, click **Publish app** later.)

---

## 3. Create the OAuth Web Client

1. Left sidebar → **APIs & Services** → **Credentials**.
2. Top → **Create credentials** → **OAuth client ID**.
3. Application type: **Web application**.
4. Name: `AI Learning Web` (or anything).
5. **Authorized JavaScript origins** — add **both**:
   - `https://web-nine-rho-1j664llz3j.vercel.app`
   - `http://localhost:3000` (so local dev works)
7. **Authorized redirect URIs** — add **both**:
   - `https://ai-learning-api.bikashtalukder040.workers.dev/api/auth/callback/google`
   - `http://localhost:8787/api/auth/callback/google` (for local `wrangler dev`)
8. **Create**.

A modal pops up with **Client ID** and **Client secret**. Copy both now — you won't see the secret again.

---

## 4. Add the secrets to Cloudflare

The Worker is `ai-learning-api`. Run from the repo root:

```bash
cd /Users/bikashtalukder/ai-learning/apps/api
wrangler secret put GOOGLE_CLIENT_ID
# paste the Client ID, hit Enter

wrangler secret put GOOGLE_CLIENT_SECRET
# paste the Client secret, hit Enter
```

Both are stored encrypted. `ALLOWED_ORIGINS` in `wrangler.toml` already includes `https://web-nine-rho-1j664llz3j.vercel.app` and `http://localhost:3000`, so CORS is fine.

---

## 5. Redeploy the Worker

```bash
cd /Users/bikashtalukder/ai-learning/apps/api
wrangler deploy
```

Wait ~20s for the deploy to finish. (No code changed, only new secrets — Wrangler needs a redeploy to re-evaluate `socialProviders.google` at startup.)

---

## 6. Smoke-test

Open <https://web-nine-rho-1j664llz3j.vercel.app/sign-in> in an incognito window.

1. Click **Continue with Google**.
2. You should land on `accounts.google.com` and pick an account.
3. After consent, you should bounce to `/explore`, see "Hi <your name> — pick a learning mode.", and the navbar should show your avatar / initial with a Sign out menu.

If you see `redirect_uri_mismatch`:
- Double-check the redirect URI in Cloud Console is *exactly* `https://ai-learning-api.bikashtalukder040.workers.dev/api/auth/callback/google` (https, no trailing slash, `/api/auth/callback/google` at the end).

If you see `Cookie set in cross-site context will be rejected` in DevTools:
- The Worker sets `Secure; SameSite=None` on the session cookie automatically when the OAuth callback URL is https. Make sure the Worker was redeployed after you added the secrets.

---

## 7. (Optional) Promote to production

When you're ready for any Google user to sign in:

1. Cloud Console → **OAuth consent screen** → **Publish app**.
2. If Google requires verification, submit the scope justification form. For only `openid email profile` and no sensitive scopes, it usually self-approves.

That's it — the rest of the app (Chat, Quiz, Vocab, Grammar) is already gated behind `/api/me`, so once `/explore` works, everything else lights up.