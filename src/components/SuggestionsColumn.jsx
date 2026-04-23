// ── SuggestionsColumn ─────────────────────────────────────────────────────────
//
// Middle column: suggestion batches, reload button, auto-refresh countdown.
//
// DESIGN DECISIONS:
// - Batches are stacked newest-first (most recent at top, older ones below and
//   faded). This matches the prototype and keeps the most useful info visible.
// - We fade older batches progressively rather than hiding them — the user can
//   scroll back to see conversation history.
// - The countdown timer shows time until next auto-refresh when recording.
//   This helps users understand the rhythm and builds trust in the system.

import { useState, useEffect } from 'react'

const TAG_LABELS = {
  question:     'Question to ask',
  answer:       'Answer',
  talking_point:'Talking point',
  fact_check:   'Fact check',
  clarify:      'Clarify',
}

// Maps API type values to CSS class names
const TYPE_CSS = {
  question:      'question',
  answer:        'answer',
  talking_point: 'talking',
  fact_check:    'fact',
  clarify:       'clarify',
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function SuggestionCard({ suggestion, isActive, onClick }) {
  return (
    <button
      className={`suggestion-card ${isActive ? 'active' : ''}`}
      onClick={onClick}
    >
      <div className="card-top">
        <span className={`card-tag ${TYPE_CSS[suggestion.type] || 'question'}`}>
          {TAG_LABELS[suggestion.type] || suggestion.type}
        </span>
      </div>
      <div className="card-preview">{suggestion.preview}</div>
      {!isActive && (
        <div className="card-hint">Click for detailed answer →</div>
      )}
    </button>
  )
}

export function SuggestionsColumn({
  batches,
  activeSuggestionId,
  isLoading,
  isRecording,
  onReload,
  onSelectSuggestion,
}) {
  const [countdown, setCountdown] = useState(30)

  // Countdown timer that resets every 30s while recording
  useEffect(() => {
    if (!isRecording) {
      setCountdown(30)
      return
    }

    setCountdown(30)
    const tick = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          return 30 // reset after auto-refresh fires
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(tick)
  }, [isRecording, batches.length]) // reset countdown on new batch too

  const hasBatches = batches.length > 0

  return (
    <div className="column">
      <div className="col-header">
        <span className="col-title">2. Live Suggestions</span>
        <span className="col-badge">{batches.length} BATCH{batches.length !== 1 ? 'ES' : ''}</span>
      </div>

      {/* Controls row */}
      <div className="suggestions-controls">
        <button
          className="btn"
          onClick={onReload}
          disabled={isLoading}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          {isLoading ? (
            <>
              <div className="spinner" />
              Generating…
            </>
          ) : (
            <>
              <RefreshIcon />
              Reload suggestions
            </>
          )}
        </button>
        {isRecording && !isLoading && (
          <span className="refresh-hint">
            auto-refresh in {countdown}s
          </span>
        )}
      </div>

      <div className="col-body">
        {!hasBatches && !isLoading && (
          <div className="suggestions-idle">
            {isRecording
              ? 'Generating first suggestions…'
              : 'Start recording or click Reload to generate suggestions'}
          </div>
        )}

        {isLoading && !hasBatches && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
            <div className="spinner" style={{ width: 20, height: 20 }} />
          </div>
        )}

        {/* Batches: newest first */}
        {[...batches].reverse().map((batch, batchIdx) => (
          <div key={batch.id} className="batch">
            <div className="batch-label">
              {batchIdx === 0 ? 'Latest' : formatTime(batch.timestamp)}
            </div>
            {batch.suggestions.map((s) => (
              <SuggestionCard
                key={s.id}
                suggestion={s}
                isActive={activeSuggestionId === s.id}
                onClick={() => onSelectSuggestion(s, batch)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function RefreshIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
      <path d="M21 3v5h-5"/>
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
      <path d="M8 16H3v5"/>
    </svg>
  )
}
