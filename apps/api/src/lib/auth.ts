import { betterAuth } from 'better-auth';
import { magicLink } from 'better-auth/plugins';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/d1';
import type { Env } from '../env';
import * as schema from '../db/schema';

export const auth = (env: Env) => {
  const db = drizzle(env.DB, { schema });
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
    database: drizzleAdapter(db, { provider: 'sqlite' }),
    emailAndPassword: { enabled: false }, // magic-link only
    // Cross-site (vercel.app → workers.dev) cookies need SameSite=None + Secure.
    // `secure: true` is safe here because `BETTER_AUTH_URL` is https on the
    // deployed worker; Better Auth already infers `secure` from the URL when
    // possible, but we make it explicit so it survives any baseURL change.
    advanced: {
      defaultCookieAttributes: {
        sameSite: 'none',
        secure: true,
        httpOnly: true,
        path: '/',
      },
    },
    plugins: [
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY missing');
          const from = env.RESEND_FROM ?? 'onboarding@resend.dev';
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from,
              to: email,
              subject: 'Sign in to Quantara',
              html: `<p>Click to sign in (expires in 5 min):</p><p><a href="${url}">${url}</a></p>`,
            }),
          });
          if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
        },
        expiresIn: 5 * 60,
      }),
    ],
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
  });
};

export type Auth = ReturnType<typeof auth>;