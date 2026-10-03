'use client';

import { createAuthClient } from 'better-auth/client';
import { magicLinkClient } from 'better-auth/client/plugins';

const RAW_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';
// Surface a clear build/runtime error if the env var was never set instead
// of silently pointing at localhost (which would manifest as an opaque
// "No connection" / "Failed to fetch" error in production).
if (!RAW_BASE) {
  throw new Error(
    'NEXT_PUBLIC_API_BASE_URL is not set. Configure it in .env.local (dev) ' +
      'and in the Vercel project (prod). See apps/web/.env.example.',
  );
}

export const authClient = createAuthClient({
  baseURL: RAW_BASE,
  plugins: [magicLinkClient()],
});