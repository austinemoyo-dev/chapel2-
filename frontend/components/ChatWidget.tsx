'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTIONS = [
  'How do I register?',
  'My face capture keeps failing',
  'How do I check my attendance?',
  'Registration is closed — can I still finish?',
];

// ─── Simple bold renderer ─────────────────────────────────────────────────────
function Markdown({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, i) => (
        <span key={i}>
          {line.split(/\*\*(.*?)\*\*/g).map((part, j) =>
            j % 2 === 1 ? <strong key={j}>{part}</strong> : part
          )}
          {'\n'}
        </span>
      ))}
    </>
  );
}

export default function ChatWidget() {
  const [open, setOpen]         = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput]       = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError]       = useState('');
  const bottomRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLInputElement>(null);
  const abortRef   = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 120);
  }, [open]);

  const send = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || streaming) return;

    setError('');
    setInput('');

    const nextMessages: Message[] = [...messages, { role: 'user', content: text }];
    setMessages(nextMessages);
    setStreaming(true);

    // Placeholder assistant bubble that fills as chunks arrive
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    abortRef.current = new AbortController();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const msg = res.status === 429
          ? 'Too many messages — please wait a moment and try again.'
          : 'Something went wrong. Please try again.';
        throw new Error(msg);
      }

      if (!res.body) throw new Error('No response body.');

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: 'assistant',
            content: updated[updated.length - 1].content + chunk,
          };
          return updated;
        });
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setError(msg);
      // Replace the empty placeholder with an error message
      setMessages((prev) => {
        const updated = [...prev];
        if (updated[updated.length - 1]?.content === '') {
          updated[updated.length - 1] = { role: 'assistant', content: msg };
        }
        return updated;
      });
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, messages, streaming]);

  const stop = () => {
    abortRef.current?.abort();
    setStreaming(false);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); }
  };

  return (
    <>
      {/* Floating trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Chapel support chat"
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-[0_8px_32px_rgba(139,0,255,0.35)] flex items-center justify-center transition-all duration-300 active:scale-95 hover:scale-105"
        style={{ background: 'linear-gradient(135deg,#7C3AED 0%,#A855F7 100%)' }}
      >
        {open ? (
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/>
          </svg>
        ) : (
          <>
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/>
            </svg>
            {/* Pulse ring */}
            <span className="absolute w-full h-full rounded-full border-2 border-purple-400 opacity-50 animate-ping" />
          </>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          className="fixed bottom-24 right-6 z-50 flex flex-col rounded-[1.5rem] overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.20)] animate-slide-up-fade"
          style={{
            width:  'min(400px, calc(100vw - 3rem))',
            height: 'min(580px, calc(100dvh - 10rem))',
            background: 'rgba(255,255,255,0.98)',
            backdropFilter: 'blur(28px)',
            border: '1.5px solid rgba(139,0,255,0.15)',
          }}
        >

          {/* ── Header ── */}
          <div
            className="flex items-center justify-between px-5 py-3.5 shrink-0"
            style={{ background: 'linear-gradient(135deg,#7C3AED 0%,#A855F7 100%)' }}
          >
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-xl select-none">⛪</div>
                {/* Online dot */}
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-400 border-2 border-purple-600" />
              </div>
              <div>
                <p className="text-white font-bold text-sm leading-tight">Chapel Assistant</p>
                <p className="text-white/65 text-[10px]">Powered by Llama AI · Free · Always on</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {messages.length > 0 && (
                <button
                  onClick={() => { setMessages([]); setError(''); }}
                  className="text-white/55 hover:text-white text-[11px] font-medium transition-colors"
                >
                  New chat
                </button>
              )}
            </div>
          </div>

          {/* ── Messages ── */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scroll-smooth">

            {messages.length === 0 && (
              <div className="flex flex-col items-center py-6 text-center">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl mb-4 shadow-sm"
                     style={{ background: 'linear-gradient(135deg,#EDE9FE,#F5F3FF)' }}>
                  💬
                </div>
                <p className="text-sm font-semibold text-gray-700 mb-1">How can I help you today?</p>
                <p className="text-xs text-gray-400 mb-5 max-w-[240px] leading-relaxed">
                  Ask me anything about registration, face capture, attendance, or your service group.
                </p>
                <div className="w-full flex flex-col gap-2">
                  {SUGGESTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => void send(q)}
                      className="text-left text-xs px-4 py-2.5 rounded-xl border border-purple-100 bg-purple-50/70 text-purple-700 hover:bg-purple-100 hover:border-purple-200 transition-colors font-medium leading-snug"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => {
              const isUser = msg.role === 'user';
              const isEmpty = !msg.content && !isUser;
              return (
                <div key={i} className={`flex items-end gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
                  {/* Avatar for assistant */}
                  {!isUser && (
                    <div className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[11px] mb-0.5"
                         style={{ background: 'linear-gradient(135deg,#7C3AED,#A855F7)' }}>
                      ⛪
                    </div>
                  )}

                  <div
                    className={`max-w-[82%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words
                      ${isUser
                        ? 'text-white rounded-br-sm shadow-sm'
                        : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                      }`}
                    style={isUser ? { background: 'linear-gradient(135deg,#7C3AED 0%,#A855F7 100%)' } : {}}
                  >
                    {isEmpty ? (
                      /* Typing dots while waiting for first chunk */
                      <span className="flex gap-1 items-center h-4 px-1">
                        {[0, 150, 300].map((d) => (
                          <span key={d} className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce"
                                style={{ animationDelay: `${d}ms` }}/>
                        ))}
                      </span>
                    ) : isUser ? (
                      msg.content
                    ) : (
                      <Markdown text={msg.content} />
                    )}
                  </div>
                </div>
              );
            })}

            {error && (
              <p className="text-xs text-red-500 text-center px-4">{error}</p>
            )}

            <div ref={bottomRef}/>
          </div>

          {/* ── Input ── */}
          <div className="px-4 pb-4 pt-2 shrink-0 border-t border-gray-100">
            <div className="flex items-center gap-2 bg-gray-50 rounded-2xl px-4 py-2.5 border border-gray-200 focus-within:border-purple-300 transition-colors shadow-sm">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder={streaming ? 'Responding…' : 'Ask me anything…'}
                disabled={streaming}
                className="flex-1 bg-transparent text-sm text-gray-800 placeholder:text-gray-400 outline-none disabled:opacity-60"
              />

              {streaming ? (
                <button
                  onClick={stop}
                  className="w-8 h-8 rounded-xl bg-red-100 flex items-center justify-center transition-all active:scale-95"
                  aria-label="Stop"
                >
                  <span className="w-3 h-3 bg-red-500 rounded-sm"/>
                </button>
              ) : (
                <button
                  onClick={() => void send()}
                  disabled={!input.trim()}
                  className="w-8 h-8 rounded-xl flex items-center justify-center transition-all disabled:opacity-30 active:scale-95 hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg,#7C3AED 0%,#A855F7 100%)' }}
                  aria-label="Send"
                >
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </button>
              )}
            </div>
            <p className="text-[10px] text-gray-300 text-center mt-2 select-none">
              AI can make mistakes — verify important info with Austine or FY
            </p>
          </div>
        </div>
      )}
    </>
  );
}
