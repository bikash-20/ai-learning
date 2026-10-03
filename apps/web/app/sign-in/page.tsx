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
      <h1 className="text-3xl font-bold text-fg">Sign in</h1>
      <p className="mt-2 text-sm text-muted">We'll email you a one-time link.</p>
      <form onSubmit={send} className="mt-6 space-y-3">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="input-base"
        />
        <button type="submit" disabled={status === 'sending'} className="btn-primary w-full">
          {status === 'sending' ? 'Sending…' : 'Send magic link'}
        </button>
      </form>
      {msg && (
        <p
          role="status"
          className={`mt-4 text-sm ${status === 'error' ? 'text-danger' : 'text-accent'}`}
        >
          {msg}
        </p>
      )}
    </main>
  );
}