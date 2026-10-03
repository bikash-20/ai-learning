'use client';

import { useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { PageHeader } from '@/components/ui/PageHeader';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';

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
    <main className="mx-auto max-w-md">
      <PageHeader title="Sign In" subtitle="We'll email you a one-time link." />
      <form onSubmit={send} className="space-y-3">
        <Input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          aria-label="Email"
        />
        <Button type="submit" disabled={status === 'sending'} className="w-full">
          {status === 'sending' ? 'Sending…' : 'Send magic link'}
        </Button>
      </form>
      {status === 'error' && <div className="mt-4"><ErrorState title="Sign-in failed" detail={msg} /></div>}
      {status === 'sent' && (
        <p role="status" className="mt-4 text-sm text-success">
          {msg}
        </p>
      )}
    </main>
  );
}