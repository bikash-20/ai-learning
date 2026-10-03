'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { useSession } from '@/lib/useSession';
import { GlassCard } from '@/components/ui/GlassCard';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';

type Status = 'idle' | 'sending-magic' | 'magic-sent' | 'redirecting-google' | 'error';

const RESEND_COOLDOWN_MS = 30_000;
const COOLDOWN_KEY = 'magicLink:sentAt';

function safeReturnTo(raw: string | null): string {
  // Only same-origin paths are allowed as returnTo; anything else falls back
  // to the home page. This prevents open-redirect to attacker-controlled URLs.
  if (!raw) return '/';
  if (!raw.startsWith('/')) return '/';
  if (raw.startsWith('//')) return '/';
  return raw;
}

/**
 * Inner page component — wraps the body so useSearchParams can be used with
 * a Suspense boundary (Next.js requirement).
 */
function SignInInner() {
  const router = useRouter();
  const params = useSearchParams();
  const returnTo = safeReturnTo(params.get('returnTo'));
  const { loading: sessionLoading, user } = useSession();

  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [msg, setMsg] = useState('');
  const [cooldownLeft, setCooldownLeft] = useState(0);

  // If the user is already signed in, redirect away from /sign-in.
  useEffect(() => {
    if (!sessionLoading && user) router.replace(returnTo);
  }, [sessionLoading, user, returnTo, router]);

  // Resend cooldown ticker — uses an interval so the button label updates.
  useEffect(() => {
    if (cooldownLeft <= 0) return;
    const t = setInterval(() => {
      const sentAt = Number(localStorage.getItem(COOLDOWN_KEY) ?? '0');
      const left = Math.max(0, RESEND_COOLDOWN_MS - (Date.now() - sentAt));
      setCooldownLeft(left);
      if (left <= 0) clearInterval(t);
    }, 250);
    return () => clearInterval(t);
  }, [cooldownLeft]);

  const targetUrl = (): string => `${window.location.origin}${returnTo}`;

  const sendMagic = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!email || status === 'sending-magic') return;
    // Enforce the 30-second resend cooldown. This is a UX guard, not a login
    // limit: the user can sign out and sign in again any number of times,
    // with multiple devices, and we never lock anyone out.
    const sentAt = Number(localStorage.getItem(COOLDOWN_KEY) ?? '0');
    const since = Date.now() - sentAt;
    if (since < RESEND_COOLDOWN_MS) {
      setStatus('error');
      setMsg(`Please wait ${Math.ceil((RESEND_COOLDOWN_MS - since) / 1000)}s before requesting another link to this email.`);
      return;
    }
    setStatus('sending-magic');
    try {
      const { error } = await authClient.signIn.magicLink({
        email,
        callbackURL: targetUrl(),
      });
      if (error) {
        setStatus('error');
        setMsg(error.message ?? 'Failed to send magic link');
        return;
      }
      localStorage.setItem(COOLDOWN_KEY, String(Date.now()));
      setCooldownLeft(RESEND_COOLDOWN_MS);
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
        callbackURL: targetUrl(),
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

  const reset = () => {
    setStatus('idle');
    setMsg('');
    setEmail('');
  };

  const busy = status === 'sending-magic' || status === 'redirecting-google';
  const cooldownSecs = Math.ceil(cooldownLeft / 1000);
  const cooldownActive = cooldownSecs > 0 && status === 'magic-sent';

  if (sessionLoading) {
    return <LoadingState><div className="text-sm text-muted">Checking your session…</div></LoadingState>;
  }

  // Confirmed-sent state shows the confirmation card with resend + change-email.
  if (status === 'magic-sent') {
    return (
      <GlassCard>
        <div className="font-display text-2xl uppercase tracking-display text-fg">Check your email</div>
        <p className="mt-2 text-sm text-muted">{msg}</p>
        <div className="mt-5 space-y-2">
          <Button
            type="button"
            variant="primary"
            onClick={() => void sendMagic()}
            disabled={cooldownActive}
            className="w-full"
          >
            {cooldownActive ? `Resend in ${cooldownSecs}s` : 'Resend magic link'}
          </Button>
          <Button type="button" variant="ghost" onClick={reset} className="w-full">
            Use a different email
          </Button>
        </div>
        <p className="mt-4 text-xs text-muted">
          The link expires in 5 minutes. You can request a new one any time after the {RESEND_COOLDOWN_MS / 1000}s cooldown.
        </p>
      </GlassCard>
    );
  }

  return (
    <GlassCard>
      <div className="font-display text-2xl uppercase tracking-display text-fg">Sign in</div>
      <p className="mt-2 text-sm text-muted">Use your Google account or get a one-time email link.</p>

      <Button
        type="button"
        variant="secondary"
        onClick={signInWithGoogle}
        disabled={busy}
        className="mt-5 w-full"
      >
        <svg aria-hidden="true" viewBox="0 0 48 48" className="h-5 w-5" xmlns="http://www.w3.org/2000/svg">
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
    </GlassCard>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<LoadingState><div className="text-sm text-muted">Loading…</div></LoadingState>}>
      <SignInInner />
    </Suspense>
  );
}