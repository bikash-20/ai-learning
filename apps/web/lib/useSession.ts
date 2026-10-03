'use client';

import { useEffect, useState } from 'react';
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
 * the session cookie set by both magic-link and Google OAuth flows. Returns a
 * stable `signOut` so any UI element can log the user out.
 */
export const useSession = (): SessionState => {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
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
  };

  useEffect(() => {
    void refresh();
  }, []);

  const signOut = async () => {
    await authClient.signOut();
    setUser(null);
  };

  return { loading, user, refresh, signOut };
};
