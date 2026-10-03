'use client';

import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

/**
 * Resolves the signed-in user's role from the API. Returns 'admin' only
 * if /api/me/role says so — we no longer trust NEXT_PUBLIC_ADMIN_EMAIL on
 * the client (admin gating is server-side at the route, this hook decides
 * which UI surfaces to show).
 *
 * Until the request resolves we report `loading` so consumers can hide
 * admin-only tiles. Defaults to 'user' on any error or no-session state
 * (signed-out users are never admins).
 */
export type Role = 'user' | 'admin' | 'loading';

export const useRole = (): Role => {
  const [role, setRole] = useState<Role>('loading');

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`${API}/api/me/role`, { credentials: 'include', signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((j: { role?: string }) => {
        setRole(j?.role === 'admin' ? 'admin' : 'user');
      })
      .catch(() => setRole('user'));
    return () => ctrl.abort();
  }, []);

  return role;
};

/** Convenience: true only once we've confirmed the user is admin. */
export const isAdmin = (r: Role): boolean => r === 'admin';