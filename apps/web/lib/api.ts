'use client';

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8787';

export const api = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
};