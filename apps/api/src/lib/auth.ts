import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/d1';
import type { Env } from '../env';
import * as schema from '../db/schema';

export const auth = (env: Env) => {
  const db = drizzle(env.DB, { schema });
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    database: drizzleAdapter(db, { provider: 'sqlite' }),
    emailAndPassword: { enabled: false }, // magic-link only
    socialProviders: {
      ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
            },
          }
        : {}),
    },
    emailVerification: undefined,
  });
};

export type Auth = ReturnType<typeof auth>;