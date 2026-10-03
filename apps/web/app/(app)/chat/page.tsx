'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
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
  model?: string | undefined;
  cached?: boolean | undefined;
};

type ChatErrorCategory = 'offline' | 'network' | 'auth' | 'rate_limited' | 'busy' | 'unknown';

type ChatError = {
  category: ChatErrorCategory;
  technical?: string | undefined;
  /** Optional Retry-After seconds from the server, if it sent one. */
  retryAfter?: number | undefined;
};

const friendlyError = (category: ChatErrorCategory): string => {
  switch (category) {
    case 'offline':
      return "You're offline. Reconnect and try again.";
    case 'network':
      return "We can't reach the tutor right now. Check your connection and retry.";
    case 'auth':
      return 'Your session expired. Please sign in again.';
    case 'rate_limited':
      return "You're sending messages too quickly. Wait a moment, then retry.";
    case 'busy':
      return 'All AI models are busy. Please retry in a moment.';
    default:
      return "We couldn't get a reply. Please try again.";
  }
};

const errorTitle = (category: ChatErrorCategory): string => {
  switch (category) {
    case 'offline': return 'You appear to be offline';
    case 'network': return 'No connection';
    case 'auth': return 'Please sign in again';
    case 'rate_limited': return 'Slow down a moment';
    case 'busy': return 'All AI models are busy';
    default: return "We couldn't get a reply";
  }
};

/**
 * Parse a single SSE event. The server may send:
 *   `event: token\ndata: {"text":"…"}`      → assistant token
 *   `event: done\ndata: {provider,model,…}` → stream complete
 *   `event: error\ndata: {code,message,…}`  → upstream error, surface to UI
 *   `: keepalive`                            → comment, ignore
 *
 * Returns the parsed event payload, or null for comments / unparseable lines.
 */
type SseEvent =
  | { kind: 'token'; text: string }
  | { kind: 'done'; provider: 'workers' | 'openrouter'; model: string; tokens?: number | undefined; cached?: boolean | undefined; firstTokenAtMs?: number | undefined }
  | { kind: 'error'; code: string; message: string; details?: unknown }
  | { kind: 'comment' };

const parseSseEvent = (eventName: string | undefined, data: string): SseEvent | null => {
  if (eventName === undefined) return null;
  if (eventName === '') return { kind: 'comment' };
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  if (eventName === 'token') {
    const p = parsed as { text?: unknown };
    return typeof p.text === 'string' ? { kind: 'token', text: p.text } : null;
  }
  if (eventName === 'done') {
    const p = parsed as { provider?: unknown; model?: unknown; tokens?: unknown; cached?: unknown; firstTokenAtMs?: unknown };
    if (typeof p.model !== 'string') return null;
    return {
      kind: 'done',
      provider: p.provider === 'openrouter' ? 'openrouter' : 'workers',
      model: p.model,
      tokens: typeof p.tokens === 'number' ? p.tokens : undefined,
      cached: p.cached === true,
      firstTokenAtMs: typeof p.firstTokenAtMs === 'number' ? p.firstTokenAtMs : undefined,
    };
  }
  if (eventName === 'error') {
    const p = parsed as { code?: unknown; message?: unknown; details?: unknown };
    return {
      kind: 'error',
      code: typeof p.code === 'string' ? p.code : 'UPSTREAM_UNAVAILABLE',
      message: typeof p.message === 'string' ? p.message : 'AI service is temporarily unavailable.',
      details: p.details,
    };
  }
  return null;
};

/**
 * SSE line parser. Reads bytes from the stream and emits one event at a
 * time. Keeps a partial-line buffer for chunks that split a frame.
 *
 * The server emits one event per blank-line:
 *   `event: token\ndata: {...}\n\n`
 * We buffer until we see a blank line, then dispatch.
 */
type SseParserState = { buf: string; pendingEvent: string; pendingData: string };
const feedSseParser = (
  state: SseParserState,
  chunk: string,
  emit: (eventName: string, data: string) => void,
): void => {
  state.buf += chunk;
  let start = 0;
  while (true) {
    const nlIdx = state.buf.indexOf('\n', start);
    if (nlIdx === -1) break;
    const line = state.buf.slice(start, nlIdx).replace(/\r$/, '');
    start = nlIdx + 1;
    if (line === '') {
      // End of event — flush.
      emit(state.pendingEvent || 'data', state.pendingData);
      state.pendingEvent = '';
      state.pendingData = '';
      continue;
    }
    if (line.startsWith(':')) continue; // SSE comment, ignore
    if (line.startsWith('event:')) {
      state.pendingEvent = line.slice(6).trim();
      continue;
    }
    if (line.startsWith('data:')) {
      const data = line.slice(5).trim();
      state.pendingData = state.pendingData ? `${state.pendingData}\n${data}` : data;
      continue;
    }
    // Unknown line — ignore per spec.
  }
  state.buf = state.buf.slice(start);
};

export default function ChatPage() {
  const router = useRouter();
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

    // Detect offline at send-time so the user sees the right error
    // immediately, rather than waiting for the fetch to fail.
    if (typeof window !== 'undefined' && !window.navigator.onLine) {
      setChatError({ category: 'offline' });
      setStreaming(false);
      setMessages((cur) => {
        if (cur.length > 0 && cur[cur.length - 1]?.role === 'assistant' && cur[cur.length - 1]?.content === '') {
          return cur.slice(0, -1);
        }
        return cur;
      });
      return;
    }

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
        let category: ChatErrorCategory = 'unknown';
        let retryAfter: number | undefined;
        if (res.status === 401) category = 'auth';
        else if (res.status === 429) {
          category = 'rate_limited';
          const ra = res.headers.get('Retry-After');
          if (ra) retryAfter = Number(ra);
        }
        else if (res.status === 502 || res.status === 503) category = 'busy';
        throw Object.assign(new Error(text || `API ${res.status}`), { _category: category, _retryAfter: retryAfter });
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = '';
      let modelFromHeader: string | undefined = res.headers.get('x-model-used') ?? undefined;
      let cachedFromStream = false;
      const parser: SseParserState = { buf: '', pendingEvent: '', pendingData: '' };

      const flushEvent = (eventName: string, data: string) => {
        const ev = parseSseEvent(eventName, data);
        if (!ev) return;
        if (ev.kind === 'token') {
          acc += ev.text;
        } else if (ev.kind === 'done') {
          modelFromHeader = ev.model;
          cachedFromStream = ev.cached === true;
        } else if (ev.kind === 'error') {
          throw Object.assign(new Error(ev.message), { _category: ev.code === 'UPSTREAM_AUTH' ? 'auth' : 'busy' });
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        feedSseParser(parser, dec.decode(value, { stream: true }), flushEvent);
        setMessages((cur) => {
          const c2 = [...cur];
          const last = c2[c2.length - 1];
          if (last && last.role === 'assistant') {
            c2[c2.length - 1] = {
              ...last,
              content: acc,
              cached: cachedFromStream || last.cached,
              ...(modelFromHeader && !last.model ? { model: modelFromHeader } : {}),
            };
          }
          return c2;
        });
      }

      // Final pass: attach model if no further tokens arrived.
      setMessages((cur) => {
        const c2 = [...cur];
        const last = c2[c2.length - 1];
        if (last && last.role === 'assistant') {
          return [{
            ...last,
            content: acc || last.content,
            cached: cachedFromStream,
            ...(modelFromHeader && !last.model ? { model: modelFromHeader } : {}),
          }];
        }
        return c2;
      });
    } catch (e) {
      const cat = (e as Error & { _category?: ChatErrorCategory })._category ?? categorize(e);
      const retryAfter = (e as Error & { _retryAfter?: number })._retryAfter;
      setChatError({ category: cat, technical: e instanceof Error ? e.message : String(e), retryAfter });

      // 401 → redirect to sign-in once.
      if (cat === 'auth') {
        const ret = typeof window !== 'undefined' ? `?returnTo=${encodeURIComponent(window.location.pathname)}` : '';
        router.replace(`/sign-in${ret}`);
      }

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

  const categorize = (err: unknown): ChatErrorCategory => {
    if (typeof window !== 'undefined' && !window.navigator.onLine) return 'offline';
    const msg = err instanceof Error ? err.message : String(err);
    if (/fetch|network|failed to fetch/i.test(msg)) return 'network';
    if (/401|UNAUTHORIZED|UPSTREAM_AUTH/i.test(msg)) return 'auth';
    if (/429|RATE_LIMITED/i.test(msg)) return 'rate_limited';
    if (/UPSTREAM_UNAVAILABLE|UPSTREAM_AUTH|502|503/i.test(msg)) return 'busy';
    return 'unknown';
  };

  const retry = () => {
    setChatError(null);
    const last = messages[messages.length - 1];
    if (last?.role === 'user') {
      setInput(last.content);
      setMessages(messages.slice(0, -1));
    } else {
      // No pending user msg (e.g. server error before insert). Just send again.
      send();
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
              {m.role === 'assistant' && m.model && <ModelChip modelId={m.model} cached={m.cached} />}
            </div>
          ))}
          {streaming && last?.role === 'assistant' && last.content === '' && (
            <div className="flex justify-start"><TypingDots /></div>
          )}
          {chatError && (
            <div className="glass rounded-card p-4">
              <div className="font-display text-lg uppercase tracking-display text-fg">
                {errorTitle(chatError.category)}
              </div>
              <p className="mt-1 text-sm text-muted">{friendlyError(chatError.category)}</p>
              {chatError.retryAfter !== undefined && (
                <p className="mt-1 text-xs text-muted/80">Try again in {Math.ceil(chatError.retryAfter / 60) || 1} min.</p>
              )}
              {process.env.NODE_ENV !== 'production' && chatError.technical && (
                <p className="mt-1 text-xs text-muted/80">dev: {chatError.technical}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {chatError.category === 'auth' ? (
                  <Button type="button" size="sm" onClick={() => router.push('/sign-in')}>Sign in</Button>
                ) : (
                  <>
                    <Button type="button" size="sm" variant="ghost" onClick={retry}>Retry</Button>
                    {chatError.category === 'offline' && (
                      <Button type="button" size="sm" variant="ghost" onClick={() => window.location.reload()}>Reload</Button>
                    )}
                  </>
                )}
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