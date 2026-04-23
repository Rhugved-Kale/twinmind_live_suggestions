// ── TranscriptColumn ──────────────────────────────────────────────────────────
//
// Left column: mic button + transcript chunks.
// Each chunk is a separate card so the user can see the conversation building
// over time. The latest chunk is visually highlighted.

import { useEffect, useRef } from 'react'

function MicIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="22"/>
    </svg>
  )
}

function StopIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <rect x="4" y="4" width="16" height="16" rx="2"/>
    </svg>
  )
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function TranscriptColumn({ chunks, isRecording, isTranscribing, onToggleMic }) {
  const bottomRef = useRef(null)

  // Auto-scroll to bottom whenever a new chunk arrives
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chunks])

  const hasContent = chunks.length > 0

  return (
    <div className="column">
      <div className="col-header">
        <span className="col-title">1. Mic &amp; Transcript</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isTranscribing && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
              <div className="spinner" style={{ width: 10, height: 10 }} />
              transcribing
            </div>
          )}
          <span className="col-badge">
            {isRecording ? 'LIVE' : 'IDLE'}
          </span>
        </div>
      </div>

      {/* Mic control row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 14px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <button
          className={`mic-btn ${isRecording ? 'recording' : ''}`}
          onClick={onToggleMic}
          title={isRecording ? 'Stop recording' : 'Start recording'}
        >
          {isRecording ? <StopIcon /> : <MicIcon />}
        </button>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {isRecording
            ? 'Recording — transcript appends every ~30s'
            : 'Click mic to start'}
        </span>
      </div>

      <div className="col-body">
        {!hasContent && (
          <div className="transcript-idle">
            <div className={`status-dot ${isRecording ? 'recording' : 'idle'}`} />
            {isRecording
              ? 'Listening… first chunk appears in ~30s'
              : 'No transcript yet — start the mic'}
          </div>
        )}

        {chunks.map((chunk, i) => (
          <div
            key={chunk.id}
            className={`transcript-chunk ${i === chunks.length - 1 ? 'latest' : ''}`}
          >
            <div className="chunk-ts">{formatTime(chunk.timestamp)}</div>
            {chunk.text}
          </div>
        ))}

        <div ref={bottomRef} />
      </div>
    </div>
  )
}
