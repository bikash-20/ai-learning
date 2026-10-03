'use client';

import { useEffect, useRef, useState } from 'react';

type Msg = { role: 'user' | 'assistant'; content: string };

export default function ChatPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput('');
    const next: Msg[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setStreaming(true);
    setMessages([...next, { role: 'assistant', content: '' }]);

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/chat`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({ messages: next }),
    });
    if (!res.ok || !res.body) { setStreaming(false); return; }

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
        } catch {}
      }
      setMessages((cur) => {
        const c2 = [...cur];
        c2[c2.length - 1] = { role: 'assistant', content: acc };
        return c2;
      });
    }
    setStreaming(false);
  };

  return (
    <main className="mx-auto flex h-dvh max-w-3xl flex-col px-4 py-6">
      <h1 className="text-2xl font-semibold">Chat</h1>
      <div ref={scrollRef} className="mt-4 flex-1 space-y-3 overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-4">
        {messages.length === 0 && <p className="text-sm text-zinc-400">Ask a question to start.</p>}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${m.role === 'user' ? 'bg-accent text-white' : 'bg-zinc-100'}`}>
              {m.content || (streaming && i === messages.length - 1 ? '…' : '')}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          disabled={streaming}
          placeholder="Ask anything…"
          className="flex-1 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm focus:border-accent focus:outline-none"
        />
        <button onClick={send} disabled={streaming || !input.trim()} className="rounded-xl bg-accent px-5 py-2 text-sm font-medium text-white disabled:opacity-50">
          Send
        </button>
      </div>
    </main>
  );
}