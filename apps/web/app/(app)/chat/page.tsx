'use client';

import { useEffect, useRef, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ChatBubble } from '@/components/ui/ChatBubble';
import { TypingDots } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlassCard } from '@/components/ui/GlassCard';
import { ModelChip, ModelChipToggle } from '@/components/ui/ModelChip';

type Msg = {
  role: 'user' | 'assistant';
  content: string;
  model?: string;
};

type ChatError = {
  category: 'network' | 'busy' | 'auth' | 'unknown';
  technical?: string;
};

const friendlyError = (category: ChatError['category']): string => {
  switch (category) {
    case 'network':
      return "We can't reach the tutor right now. Check your connection and retry.";
    case 'busy':
      return 'All AI models are busy. Please retry in a moment.';
    case 'auth':
      return 'Your session expired. Please sign in again.';
    default:
      return "We couldn't get a reply. Please try again.";
  }
};

const categorize = (err: unknown): ChatError => {
  if (typeof window !== 'undefined' && !window.navigator.onLine) return { category: 'network' };
  const msg = err instanceof Error ? err.message : String(err);
  if (/fetch|network|failed to fetch/i.test(msg)) return { category: 'network', technical: msg };
  if (/UPSTREAM_UNAVAILABLE|UPSTREAM_AUTH|502|503/.test(msg)) return { category: 'busy', technical: msg };
  if (/401|UNAUTHORIZED/.test(msg)) return { category: 'auth', technical: msg };
  return { category: 'unknown', technical: msg };
};

export default function ChatPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [chatError, setChatError] = useState<ChatError | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streaming]);

  const send = async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput('');
    setChatError(null);

    const next: Msg[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setStreaming(true);
    // Placeholder assistant message that we'll fill with streamed text.
    setMessages([...next, { role: 'assistant', content: '' }]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/chat`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({ messages: next }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '');
        let category: ChatError['category'] = 'unknown';
        if (res.status === 401) category = 'auth';
        else if (res.status === 502 || res.status === 503) category = 'busy';
        throw Object.assign(new Error(text || `API ${res.status}`), { _category: category });
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = '';
      let modelFromHeader: string | undefined = res.headers.get('x-model-used') ?? undefined;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        for (const line of dec.decode(value, { stream: true }).split('\n')) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          try {
            const j = JSON.parse(payload) as
              | { event?: 'token'; text?: string }
              | { event?: 'done'; provider?: string; model?: string; tokens?: number }
              | { event?: 'error'; code?: string; message?: string }
              | { text?: string }
              | { provider?: string; model?: string };
            // Tokens
            if ('text' in j && typeof j.text === 'string') {
              acc += j.text;
            }
            // done event — capture authoritative model id
            if ('model' in j && typeof j.model === 'string') {
              modelFromHeader = j.model;
            }
            if ('event' in j && j.event === 'error') {
              throw Object.assign(new Error(j.message ?? 'stream error'), {
                _category: j.code === 'UPSTREAM_AUTH' ? 'auth' : 'busy',
              });
            }
          } catch (parseErr) {
            // Re-throw our own thrown errors
            if (parseErr instanceof Error && (parseErr as Error & { _category?: unknown })._category) throw parseErr;
            /* malformed SSE line, skip */
          }
        }
        setMessages((cur) => {
          const c2 = [...cur];
          const last = c2[c2.length - 1];
          if (last && last.role === 'assistant') {
            const next: Msg = { ...last, content: acc };
            if (modelFromHeader) next.model = modelFromHeader;
            c2[c2.length - 1] = next;
          }
          return c2;
        });
      }

      // Final pass: attach model even if no further tokens arrived
      if (modelFromHeader) {
        setMessages((cur) => {
          const c2 = [...cur];
          const last = c2[c2.length - 1];
          if (last && last.role === 'assistant' && !last.model) {
            c2[c2.length - 1] = { ...last, model: modelFromHeader };
          }
          return c2;
        });
      }
    } catch (e) {
      const cat = categorize(e);
      setChatError(cat);
      // Drop the empty assistant placeholder so the retry button is visible.
      setMessages((cur) => {
        if (cur.length > 0 && cur[cur.length - 1]?.role === 'assistant' && cur[cur.length - 1]?.content === '') {
          return cur.slice(0, -1);
        }
        return cur;
      });
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const retry = () => {
    setChatError(null);
    // If the last message is the user's, just resend it.
    const last = messages[messages.length - 1];
    if (last?.role === 'user') {
      setInput(last.content);
      // Strip the last user msg so send() re-adds it cleanly.
      setMessages(messages.slice(0, -1));
    }
  };

  const last = messages[messages.length - 1];

  return (
    <main className="flex h-[calc(100dvh-7rem)] flex-col sm:h-[calc(100dvh-8rem)]">
      <PageHeader
        title="Chat"
        subtitle="Ask anything. The tutor streams back."
        right={<ModelChipToggle />}
      />

      <GlassCard className="flex flex-1 flex-col gap-3 overflow-hidden p-3">
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-2">
          {messages.length === 0 && (
            <EmptyState title="No messages yet" hint="Try: Explain the difference between 'for' and 'since'." />
          )}
          {messages.map((m, i) => (
            <div key={i} className={m.role === 'assistant' ? 'flex flex-col items-start' : ''}>
              <ChatBubble role={m.role}>{m.content}</ChatBubble>
              {m.role === 'assistant' && m.model && <ModelChip modelId={m.model} />}
            </div>
          ))}
          {streaming && last?.role === 'assistant' && last.content === '' && (
            <div className="flex justify-start"><TypingDots /></div>
          )}
          {chatError && (
            <div className="glass rounded-card p-4">
              <div className="font-display text-lg uppercase tracking-display text-fg">
                {chatError.category === 'network'
                  ? 'No connection'
                  : chatError.category === 'busy'
                    ? 'All AI models are busy'
                    : chatError.category === 'auth'
                      ? 'Please sign in again'
                      : "We couldn't get a reply"}
              </div>
              <p className="mt-1 text-sm text-muted">{friendlyError(chatError.category)}</p>
              {process.env.NODE_ENV !== 'production' && chatError.technical && (
                <p className="mt-1 text-xs text-muted/80">dev: {chatError.technical}</p>
              )}
              <div className="mt-3">
                <Button type="button" size="sm" variant="ghost" onClick={retry}>
                  Retry
                </Button>
              </div>
            </div>
          )}
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); send(); }}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={streaming}
            placeholder="Ask anything…"
            aria-label="Message"
            className="flex-1"
          />
          <Button type="submit" disabled={streaming || !input.trim()}>Send</Button>
        </form>
      </GlassCard>
    </main>
  );
}