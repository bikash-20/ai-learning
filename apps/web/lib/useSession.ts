'use client';

import { useCallback, useEffect, useState } from 'react';
import { authClient } from '@/lib/auth-client';

export type SessionUser = {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
};

type SessionState = {
  loading: boolean;
  user: SessionUser | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

/**
 * Lightweight session hook. Calls Better Auth's `getSession`, which works with
 * the session cookie set by both magic-link and Google OAuth flows.
 *
 * There is NO per-user login limit, lockout, or session count cap. Users can
 * sign in and out as many times as they want, on as many devices as they
 * want. The only restriction is a 30s cooldown on resending the SAME magic
 * link to the same email, enforced in the sign-in page itself.
 */
export const useSession = (): SessionState => {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await authClient.getSession();
      if (error || !data) setUser(null);
      else setUser(data.user as SessionUser);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    // Best-effort: hit Better Auth's signOut endpoint and clear local state.
    // We never block sign-out on network errors — the local state clears
    // regardless so the UI can redirect immediately.
    try {
      await authClient.signOut();
    } catch {
      /* network error — local state still cleared below */
    }
    setUser(null);
  }, []);

  return { loading, user, refresh, signOut };
};