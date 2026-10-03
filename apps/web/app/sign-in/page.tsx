'use client';

import { useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { PageHeader } from '@/components/ui/PageHeader';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';

type Status = 'idle' | 'sending-magic' | 'magic-sent' | 'redirecting-google' | 'error';

export default function SignInPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [msg, setMsg] = useState('');

  const sendMagic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || status === 'sending-magic') return;
    setStatus('sending-magic');
    try {
      const { error } = await authClient.signIn.magicLink({
        email,
        callbackURL: `${window.location.origin}/explore`,
      });
      if (error) {
        setStatus('error');
        setMsg(error.message ?? 'Failed to send magic link');
        return;
      }
      setStatus('magic-sent');
      setMsg(`Magic link sent to ${email}. Check your inbox.`);
    } catch (err) {
      setStatus('error');
      setMsg(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const signInWithGoogle = async () => {
    setStatus('redirecting-google');
    try {
      const { error } = await authClient.signIn.social({
        provider: 'google',
        callbackURL: `${window.location.origin}/explore`,
      });
      if (error) {
        setStatus('error');
        setMsg(error.message ?? 'Google sign-in failed');
      }
      // On success Better Auth issues a 302 to Google; no further state change needed.
    } catch (err) {
      setStatus('error');
      setMsg(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const busy = status === 'sending-magic' || status === 'redirecting-google';

  return (
    <main className="mx-auto max-w-md">
      <PageHeader title="Sign in" subtitle="Use your Google account or get a one-time email link." />

      <Button
        type="button"
        variant="secondary"
        onClick={signInWithGoogle}
        disabled={busy}
        className="w-full"
      >
        {/* Google "G" mark — colored, no external asset */}
        <svg
          aria-hidden="true"
          viewBox="0 0 48 48"
          className="h-5 w-5"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
          <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.5-11.3-8.3l-6.5 5C9.5 39.6 16.2 44 24 44z" />
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C40.7 36.5 44 30.7 44 24c0-1.3-.1-2.4-.4-3.5z" />
        </svg>
        {status === 'redirecting-google' ? 'Redirecting…' : 'Continue with Google'}
      </Button>

      <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wide text-muted">
        <span className="h-px flex-1 bg-glass-border" />
        or
        <span className="h-px flex-1 bg-glass-border" />
      </div>

      <form onSubmit={sendMagic} className="space-y-3">
        <Input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          aria-label="Email"
        />
        <Button type="submit" disabled={busy} className="w-full">
          {status === 'sending-magic' ? 'Sending…' : 'Send magic link'}
        </Button>
      </form>

      {status === 'error' && (
        <div className="mt-4">
          <ErrorState title="Sign-in failed" detail={msg} />
        </div>
      )}
      {status === 'magic-sent' && (
        <p role="status" className="mt-4 text-sm text-success">
          {msg}
        </p>
      )}
    </main>
  );
}