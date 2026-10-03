'use client';

import { useEffect, useRef, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ChatBubble } from '@/components/ui/ChatBubble';
import { TypingDots } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { GlassCard } from '@/components/ui/GlassCard';

type Msg = { role: 'user' | 'assistant'; content: string };

export default function ChatPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streaming]);

  const send = async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput('');
    setErr(null);
    const next: Msg[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setStreaming(true);
    setMessages([...next, { role: 'assistant', content: '' }]);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/chat`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ messages: next }),
      });
      if (!res.ok || !res.body) throw new Error(`API ${res.status}`);

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        for (const line of dec.decode(value, { stream: true }).split('\n')) {
          if (!line.startsWith('data:')) continue;
          try {
            const j = JSON.parse(line.slice(5).trim());
            if (j.response !== undefined) acc += j.response;
          } catch {
            /* malformed SSE line, skip */
          }
        }
        setMessages((cur) => {
          const c2 = [...cur];
          c2[c2.length - 1] = { role: 'assistant', content: acc };
          return c2;
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to reach the tutor');
    } finally {
      setStreaming(false);
    }
  };

  const last = messages.at(-1);

  return (
    <main className="flex h-[calc(100dvh-7rem)] flex-col sm:h-[calc(100dvh-8rem)]">
      <PageHeader title="Chat" subtitle="Ask anything. The tutor streams back." />

      <GlassCard className="flex flex-1 flex-col gap-3 overflow-hidden p-3">
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-2">
          {messages.length === 0 && (
            <EmptyState title="No messages yet" hint="Try: Explain the difference between 'for' and 'since'." />
          )}
          {messages.map((m, i) => (
            <ChatBubble key={i} role={m.role}>{m.content}</ChatBubble>
          ))}
          {streaming && last?.role === 'assistant' && last.content === '' && (
            <div className="flex justify-start"><TypingDots /></div>
          )}
          {err && <ErrorState title="Couldn’t reach the server" detail="Check NEXT_PUBLIC_API_BASE_URL and your connection." />}
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