'use client';

import { useState } from 'react';
import { authClient } from '@/lib/auth-client';

export default function SignInPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [msg, setMsg] = useState('');

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || status === 'sending') return;
    setStatus('sending');
    try {
      const { error } = await authClient.signIn.magicLink({
        email,
        callbackURL: `${window.location.origin}/chat`,
      });
      if (error) { setStatus('error'); setMsg(error.message ?? 'Failed to send'); return; }
      setStatus('sent');
      setMsg(`Magic link sent to ${email}. Check your inbox.`);
    } catch (err) {
      setStatus('error');
      setMsg(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-3xl font-bold">Sign in</h1>
      <p className="mt-2 text-sm text-zinc-500">We'll email you a one-time link.</p>
      <form onSubmit={send} className="mt-6 space-y-3">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          disabled={status === 'sending'}
          className="w-full rounded-xl bg-accent px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {status === 'sending' ? 'Sending…' : 'Send magic link'}
        </button>
      </form>
      {msg && (
        <p className={`mt-4 text-sm ${status === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>{msg}</p>
      )}
    </main>
  );
}