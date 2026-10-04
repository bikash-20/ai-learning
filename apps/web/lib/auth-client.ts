'use client';

import { createAuthClient } from 'better-auth/client';
import { magicLinkClient } from 'better-auth/client/plugins';

/**
 * Better Auth client base URL. `NEXT_PUBLIC_API_BASE_URL` must be set
 * in .env.local for dev and in the Vercel project settings for prod.
 *
 * We defer the "missing env var" throw until the authClient is actually
 * used (not at module evaluation) so the Next.js build can still
 * static-render pages that import `authClient` without crashing the
 * prerender step.
 */
const RAW_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

const envErrorMsg =
  'NEXT_PUBLIC_API_BASE_URL is not set. Configure it in .env.local (dev) ' +
  'and in the Vercel project (prod). See apps/web/.env.example.';

// Capture the inferred type of the real client WITH the magic-link plugin
// so consumer code paths like `authClient.signIn.magicLink(...)` keep
// type-checking.
type AuthClientShape = ReturnType<
  typeof createAuthClient<{
    baseURL: string;
    plugins: [ReturnType<typeof magicLinkClient>];
  }>
>;

const realAuthClient: AuthClientShape | undefined = RAW_BASE
  ? createAuthClient({
      baseURL: RAW_BASE,
      plugins: [magicLinkClient()],
    })
  : undefined;

/**
 * Throw-on-use proxy that satisfies the same surface as the real client.
 * Lets the build prerender pages that import this module without
 * crashing the build (the auth call would only fail in the browser).
 */
const errorProxy = new Proxy(
  {},
  {
    get() {
      throw new Error(envErrorMsg);
    },
  },
) as unknown as AuthClientShape;

export const authClient: AuthClientShape = realAuthClient ?? errorProxy;