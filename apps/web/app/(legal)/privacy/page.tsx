import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'How Quantara handles your data.',
};

export default function PrivacyPage() {
  return (
    <div className="space-y-5 text-sm leading-relaxed text-fg sm:text-base">
      <header>
        <h1 className="font-display text-2xl uppercase tracking-display text-fg sm:text-3xl">
          Privacy
        </h1>
        <p className="mt-1 text-xs text-muted">
          Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </header>

      <p className="rounded-card border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
        <strong>Placeholder.</strong> This page needs legal review before launch. Treat the
        contents below as a draft, not legal advice.
      </p>

      <h2 className="font-display text-sm uppercase tracking-display text-muted">
        What we collect
      </h2>
      <p>
        To run the service we store the email you sign in with, your name (if you provide one),
        your saved quiz answers, flashcard review grades, exam attempts, XP totals, AI explanation
        cache hits, and the chat history you have with the tutor. We do not sell any of this
        data. We do not run third-party trackers on the marketing or in-app pages.
      </p>

      <h2 className="font-display text-sm uppercase tracking-display text-muted">
        How we use it
      </h2>
      <p>
        Your email is your account. Quiz answers and flashcard grades are how we compute progress
        and adapt the spaced-repetition algorithm. AI requests are routed via Cloudflare&rsquo;s network
        and OpenRouter free-tier endpoints; prompts and responses are stored briefly in our cache to
        avoid duplicate calls.
      </p>

      <h2 className="font-display text-sm uppercase tracking-display text-muted">
        Cookies & sessions
      </h2>
      <p>
        We use first-party HTTP-only cookies to keep you signed in. There are no analytics
        cookies and no advertising cookies.
      </p>

      <h2 className="font-display text-sm uppercase tracking-display text-muted">
        Deleting your data
      </h2>
      <p>
        You can delete your account at any time from the settings page. Deleting your account
        removes your email, name, quiz history, flashcard progress, XP, and chat history.
        Cached AI responses that no longer reference an existing account are purged within 30
        days.
      </p>

      <h2 className="font-display text-sm uppercase tracking-display text-muted">
        Contact
      </h2>
      <p>
        Questions or requests? Reach the founder at the email listed on the home page.
      </p>
    </div>
  );
}