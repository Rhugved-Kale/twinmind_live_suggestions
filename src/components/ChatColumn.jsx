// ── ChatColumn ────────────────────────────────────────────────────────────────
//
// Right column: one continuous chat per session.
//
// DESIGN DECISIONS:
// - We stream the response token by token using the Groq SSE API. This gives
//   first-token latency of ~300-600ms, which feels snappy even if the full
//   response takes 3-5s.
// - The last assistant message is rendered with a blinking cursor while
//   streaming, removed once the stream completes.
// - Chat input supports Shift+Enter for newlines and Enter to send.
// - We maintain full chat history in parent state so clicking multiple
//   suggestions builds a coherent multi-turn conversation.

import { useEffect, useRef, useState } from 'react'

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function ChatColumn({ messages, isStreaming, onSend }) {
  const [input, setInput]     = useState('')
  const bottomRef             = useRef(null)
  const textareaRef           = useRef(null)

  // Auto-scroll on new messages and while streaming
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isStreaming])

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  function submit() {
    const text = input.trim()
    if (!text || isStreaming) return
    onSend(text)
    setInput('')
    // Reset textarea height
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  function handleInput(e) {
    setInput(e.target.value)
    // Auto-grow textarea
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = 'auto'
      ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`
    }
  }

  const hasMessages = messages.length > 0

  return (
    <div className="column" style={{ borderRight: 'none' }}>
      <div className="col-header">
        <span className="col-title">3. Chat (Detailed Answers)</span>
        <span className="col-badge">SESSION-ONLY</span>
      </div>

      <div className="chat-body">
        {!hasMessages && (
          <div className="chat-idle">
            Clicking a suggestion adds it to this chat and streams a detailed answer.<br />
            You can also type questions directly below.<br /><br />
            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
              One continuous chat per session — no login, no persistence.
            </span>
          </div>
        )}

        {messages.map((msg, i) => {
          const isLast      = i === messages.length - 1
          const isStreaming_ = isStreaming && isLast && msg.role === 'assistant'

          return (
            <div key={msg.id} className={`chat-message ${msg.role}`}>
              <div className="msg-meta">
                {msg.role === 'user' ? 'You' : 'Assistant'} · {formatTime(msg.timestamp)}
              </div>
              <div className={`msg-bubble ${isStreaming_ ? 'streaming-cursor' : ''}`}>
                {msg.content || (isStreaming_ ? '' : '…')}
              </div>
            </div>
          )
        })}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="chat-footer">
        <textarea
          ref={textareaRef}
          className="chat-input"
          placeholder="Ask anything…"
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          disabled={isStreaming}
          rows={1}
        />
        <button
          className="btn btn-accent"
          onClick={submit}
          disabled={isStreaming || !input.trim()}
          style={{ flexShrink: 0, padding: '8px 14px' }}
        >
          {isStreaming ? <div className="spinner" style={{ borderTopColor: '#000' }} /> : 'Send'}
        </button>
      </div>
    </div>
  )
}
