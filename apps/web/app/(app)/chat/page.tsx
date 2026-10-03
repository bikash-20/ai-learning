'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { ChatBubble } from '@/components/ui/ChatBubble';
import { ChatInput } from '@/components/ui/ChatInput';
import { ChatHistory } from '@/components/ui/ChatHistory';
import { ModeChips, type ChatMode } from '@/components/ui/ModeChips';
import { QuickStart } from '@/components/ui/QuickStart';
import { MessageActions } from '@/components/ui/MessageActions';
import { TypingDots } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlassCard } from '@/components/ui/GlassCard';
import { ModelChip, ModelChipToggle } from '@/components/ui/ModelChip';
import { ChatBubbleIcon } from '@/components/ui/icons';

type Msg = {
  role: 'user' | 'assistant';
  content: string;
  model?: string | undefined;
  cached?: boolean | undefined;
};

type ChatErrorCategory =
  | 'offline'
  | 'network'
  | 'auth'
  | 'rate_limited'
  | 'busy'
  | 'unknown';

type ChatError = {
  category: ChatErrorCategory;
  technical?: string | undefined;
  retryAfter?: number | undefined;
  upstreamMessage?: string | undefined;
};

const friendlyError = (category: ChatErrorCategory, upstreamMessage?: string): string => {
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
      return upstreamMessage
        ? `The tutor is busy: ${upstreamMessage}`
        : 'The tutor is busy right now. Please retry in a moment.';
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
    case 'busy': return 'The tutor is busy';
    default: return "We couldn't get a reply";
  }
};

type SseEvent =
  | { kind: 'token'; text: string }
  | {
      kind: 'done';
      provider: 'workers' | 'openrouter';
      model: string;
      tokens?: number | undefined;
      cached?: boolean | undefined;
      firstTokenAtMs?: number | undefined;
      conversationId?: string | undefined;
      mode?: ChatMode | undefined;
    }
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
    const p = parsed as {
      provider?: unknown;
      model?: unknown;
      tokens?: unknown;
      cached?: unknown;
      firstTokenAtMs?: unknown;
      conversationId?: unknown;
      mode?: unknown;
    };
    if (typeof p.model !== 'string') return null;
    const allowedModes: ChatMode[] = ['general', 'code', 'math', 'theory', 'explain'];
    const mode = allowedModes.includes(p.mode as ChatMode) ? (p.mode as ChatMode) : undefined;
    return {
      kind: 'done',
      provider: p.provider === 'openrouter' ? 'openrouter' : 'workers',
      model: p.model,
      tokens: typeof p.tokens === 'number' ? p.tokens : undefined,
      cached: p.cached === true,
      firstTokenAtMs: typeof p.firstTokenAtMs === 'number' ? p.firstTokenAtMs : undefined,
      conversationId: typeof p.conversationId === 'string' ? p.conversationId : undefined,
      mode,
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
      emit(state.pendingEvent || 'data', state.pendingData);
      state.pendingEvent = '';
      state.pendingData = '';
      continue;
    }
    if (line.startsWith(':')) continue;
    if (line.startsWith('event:')) {
      state.pendingEvent = line.slice(6).trim();
      continue;
    }
    if (line.startsWith('data:')) {
      const data = line.slice(5).trim();
      state.pendingData = state.pendingData ? `${state.pendingData}\n${data}` : data;
      continue;
    }
  }
  state.buf = state.buf.slice(start);
};

/**
 * Read every message in a conversation. Used when the user picks one
 * from the sidebar. Returns the messages in chronological order so we
 * can render them in the existing message array shape.
 */
type ServerMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  provider?: 'workers' | 'openrouter' | null;
  model?: string | null;
  tokens?: number | null;
  createdAt: string;
};

const loadMessages = async (conversationId: string): Promise<{
  messages: Msg[];
  mode: ChatMode;
}> => {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/chat/conversations/${conversationId}/messages`,
    { credentials: 'include' },
  );
  if (!res.ok) throw new Error(`API ${res.status}`);
  const j = (await res.json()) as { messages: ServerMessage[] };
  const messages: Msg[] = (j.messages ?? [])
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
      model: m.model ?? undefined,
      cached: false,
    }));
  return { messages, mode: 'general' };
};

export default function ChatPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [chatError, setChatError] = useState<ChatError | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [mode, setMode] = useState<ChatMode>('general');
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [historyMobileOpen, setHistoryMobileOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streaming]);

  const startNewConversation = useCallback(async (m: ChatMode = 'general') => {
    // Abort any in-flight stream before switching conversations.
    abortRef.current?.abort();
    setStreaming(false);
    setMessages([]);
    setInput('');
    setChatError(null);
    setMode(m);
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/chat/conversations`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: m }),
    });
    if (!res.ok) {
      setChatError({ category: 'unknown', technical: `Create conversation failed: API ${res.status}` });
      return;
    }
    const j = (await res.json()) as { conversation?: { id?: string } };
    if (j.conversation?.id) setConversationId(j.conversation.id);
    setHistoryRefreshKey((k) => k + 1);
    setHistoryMobileOpen(false);
  }, []);

  const selectConversation = useCallback(async (id: string) => {
    abortRef.current?.abort();
    setStreaming(false);
    setMessages([]);
    setInput('');
    setChatError(null);
    setConversationId(id);
    setHistoryMobileOpen(false);
    try {
      const { messages } = await loadMessages(id);
      setMessages(messages);
    } catch (e) {
      setChatError({ category: 'unknown', technical: String(e) });
    }
  }, []);

  const send = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || streaming) return;
    setInput('');
    setChatError(null);

    // If we don't have a conversation yet, create one with the current mode.
    let cid = conversationId;
    if (!cid) {
      try {
        const r = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/chat/conversations`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode }),
        });
        if (r.ok) {
          const j = (await r.json()) as { conversation?: { id?: string } };
          if (j.conversation?.id) {
            cid = j.conversation.id;
            setConversationId(cid);
          }
        }
      } catch {
        /* fall through — server will create one if missing too */
      }
    }

    const next: Msg[] = [...messages, { role: 'user', content: text }];
    setMessages([...next, { role: 'assistant', content: '' }]);
    setStreaming(true);
    setHistoryRefreshKey((k) => k + 1);

    const controller = new AbortController();
    abortRef.current = controller;

    let bytesReceived = 0;

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
        body: JSON.stringify({
          messages: next,
          mode,
          ...(cid ? { conversationId: cid } : {}),
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '');
        let category: ChatErrorCategory = 'unknown';
        let retryAfter: number | undefined;
        let upstreamMessage: string | undefined;
        if (res.status === 401) category = 'auth';
        else if (res.status === 429) {
          category = 'rate_limited';
          const ra = res.headers.get('Retry-After');
          if (ra) retryAfter = Number(ra);
        } else if (res.status === 502 || res.status === 503) {
          category = 'busy';
          try {
            const j = JSON.parse(text) as { message?: unknown };
            if (typeof j.message === 'string') upstreamMessage = j.message;
          } catch { /* ignore */ }
        }
        throw Object.assign(new Error(text || `API ${res.status}`), {
          _category: category,
          _retryAfter: retryAfter,
          _upstreamMessage: upstreamMessage,
        });
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
          if (ev.conversationId && !cid) {
            cid = ev.conversationId;
            setConversationId(ev.conversationId);
          }
          // Refresh history so the sidebar shows the (now-titled) conversation.
          setHistoryRefreshKey((k) => k + 1);
        } else if (ev.kind === 'error') {
          let category: ChatErrorCategory = 'unknown';
          switch (ev.code) {
            case 'UPSTREAM_AUTH': category = 'auth'; break;
            case 'RATE_LIMITED': category = 'rate_limited'; break;
            case 'UPSTREAM_UNAVAILABLE':
            case 'AI_INVALID_OUTPUT':
              category = 'busy';
              break;
            case 'UNAUTHORIZED': category = 'auth'; break;
            case 'INTERNAL': category = 'unknown'; break;
            default: category = 'busy';
          }
          throw Object.assign(new Error(ev.message), {
            _category: category,
            _upstreamMessage: ev.message,
          });
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bytesReceived += value?.byteLength ?? 0;
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
      const caught = e as Error & {
        _category?: ChatErrorCategory;
        _retryAfter?: number;
        _upstreamMessage?: string;
      };
      const taggedCat = caught._category;
      const cat: ChatErrorCategory =
        bytesReceived === 0 && !taggedCat
          ? 'network'
          : taggedCat ?? categorize(e);
      setChatError({
        category: cat,
        technical: caught.message ?? String(e),
        ...(caught._retryAfter !== undefined ? { retryAfter: caught._retryAfter } : {}),
        ...(caught._upstreamMessage ? { upstreamMessage: caught._upstreamMessage } : {}),
      });

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
  }, [input, streaming, conversationId, messages, mode, router]);

  const categorize = (err: unknown): ChatErrorCategory => {
    if (typeof window !== 'undefined' && !window.navigator.onLine) return 'offline';
    const msg = err instanceof Error ? err.message : String(err);
    if (/401|UNAUTHORIZED|UPSTREAM_AUTH/i.test(msg)) return 'auth';
    if (/429|RATE_LIMITED/i.test(msg)) return 'rate_limited';
    if (/UPSTREAM_UNAVAILABLE|UPSTREAM_AUTH|502|503/i.test(msg)) return 'busy';
    if (/fetch|network|failed to fetch/i.test(msg)) return 'network';
    return 'unknown';
  };

  const stop = () => {
    abortRef.current?.abort();
  };

  const retry = () => {
    setChatError(null);
    const last = messages[messages.length - 1];
    if (last?.role === 'user') {
      const userText = last.content;
      setMessages(messages.slice(0, -1));
      setInput(userText);
      // Send on next tick so the input state takes hold.
      queueMicrotask(() => send(userText));
    } else {
      void send();
    }
  };

  const regenerate = () => {
    // Drop the last assistant reply; if the previous message was a user
    // message, resend it.
    if (streaming) return;
    setMessages((cur) => {
      if (cur.length === 0) return cur;
      const next = cur.slice(0, -1);
      const last = next[next.length - 1];
      if (last?.role === 'user') {
        const userText = last.content;
        queueMicrotask(() => send(userText));
      }
      return next;
    });
  };

  const editLastUser = () => {
    if (streaming) return;
    let captured = '';
    setMessages((cur) => {
      // Walk back to the last user message, drop everything from that
      // point on, and re-populate the input box.
      for (let i = cur.length - 1; i >= 0; i--) {
        if (cur[i]?.role === 'user') {
          captured = cur[i]!.content;
          return cur.slice(0, i);
        }
      }
      return cur;
    });
    setInput(captured);
  };

  const last = messages[messages.length - 1];
  const lastAssistantIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === 'assistant') return i;
    }
    return -1;
  })();
  const lastUserIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === 'user') return i;
    }
    return -1;
  })();

  return (
    <main className="-mx-3 flex h-[calc(100dvh-7rem)] flex-col gap-3 px-3 sm:-mx-4 sm:h-[calc(100dvh-8rem)] sm:flex-row sm:px-4">
      {/* === Sidebar === */}
      <ChatHistory
        selectedId={conversationId}
        onSelect={selectConversation}
        onNew={() => startNewConversation(mode)}
        refreshKey={historyRefreshKey}
        mobileOpen={historyMobileOpen}
        onCloseMobile={() => setHistoryMobileOpen(false)}
      />

      {/* === Main === */}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <PageHeader
          title="Chat"
          subtitle="Ask anything CS, math, or code. The tutor streams back."
          right={
            <div className="flex items-center gap-2">
              <ModelChipToggle />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="sm:hidden"
                onClick={() => setHistoryMobileOpen(true)}
                aria-label="Open history"
              >
                <ChatBubbleIcon size={16} decorative />
                History
              </Button>
            </div>
          }
        />

        <div className="flex flex-wrap items-center gap-2">
          <ModeChips
            value={mode}
            onChange={(m) => setMode(m)}
            disabled={streaming}
          />
        </div>

        <GlassCard className="flex flex-1 flex-col gap-3 overflow-hidden p-3">
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-2">
            {messages.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center gap-6">
                <EmptyState
                  title="Start a STEM conversation"
                  hint="Pick a mode above, or pick a quick start below."
                />
                <QuickStart mode={mode} onPick={(p) => void send(p)} />
              </div>
            )}

            {messages.map((m, i) => (
              <div
                key={i}
                className={`group flex flex-col ${m.role === 'assistant' ? 'items-start' : 'items-end'}`}
              >
                <ChatBubble role={m.role}>{m.content}</ChatBubble>
                <div className="flex items-center gap-2">
                  {m.role === 'assistant' && m.model && (
                    <ModelChip modelId={m.model} cached={m.cached} />
                  )}
                  <MessageActions
                    text={m.content}
                    {...(m.role === 'assistant' && i === lastAssistantIdx && !streaming
                      ? { onRegenerate: regenerate }
                      : {})}
                    {...(m.role === 'user' && i === lastUserIdx
                      ? { onEdit: editLastUser }
                      : {})}
                  />
                </div>
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
                <p className="mt-1 text-sm text-muted">
                  {friendlyError(chatError.category, chatError.upstreamMessage)}
                </p>
                {chatError.retryAfter !== undefined && (
                  <p className="mt-1 text-xs text-muted/80">
                    Try again in {Math.max(1, Math.ceil(chatError.retryAfter / 60))} min.
                  </p>
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
                        <Button type="button" size="sm" variant="ghost" onClick={() => window.location.reload()}>
                          Reload
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <ChatInput
            value={input}
            onChange={setInput}
            onSend={() => void send()}
            onStop={stop}
            streaming={streaming}
            disabled={chatError?.category === 'auth'}
          />
        </GlassCard>
      </div>
    </main>
  );
}