'use client';

import { createAuthClient } from 'better-auth/client';
import { magicLinkClient } from 'better-auth/client/plugins';

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8787';

export const authClient = createAuthClient({
  baseURL: BASE,
  plugins: [magicLinkClient()],
});