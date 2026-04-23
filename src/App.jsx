// ── App ───────────────────────────────────────────────────────────────────────
//
// Root component. All session state lives here and flows down as props.
// Child components never directly call the Groq API — they call handlers.
//
// STATE ARCHITECTURE:
// - transcriptChunks: [{id, timestamp, text}] — immutable append-only
// - suggestionBatches: [{id, timestamp, suggestions: [{id, type, preview, detail_prompt}]}]
// - chatMessages: [{id, timestamp, role, content}]
// - settings: user-editable prompts, API key, context window sizes

import { useState, useCallback, useRef } from 'react'
import { TranscriptColumn }   from './components/TranscriptColumn.jsx'
import { SuggestionsColumn }  from './components/SuggestionsColumn.jsx'
import { ChatColumn }         from './components/ChatColumn.jsx'
import { SettingsPanel }      from './components/SettingsPanel.jsx'
import { useAudioRecorder }   from './hooks/useAudioRecorder.js'
import { useAutoRefresh }     from './hooks/useAutoRefresh.js'
import {
  transcribeAudio,
  generateSuggestions,
  streamChatResponse,
  DEFAULT_SUGGESTIONS_PROMPT,
  DEFAULT_CHAT_PROMPT,
} from './lib/groq.js'
import { exportSession } from './lib/export.js'
import { hasSpeech }    from './lib/audioUtils.js'
import './styles/global.css'

// ── helpers ───────────────────────────────────────────────────────────────────
function uid() {
  return Math.random().toString(36).slice(2, 10)
}

const DEFAULT_SETTINGS = {
  apiKey:             '',
  suggestionsPrompt:  DEFAULT_SUGGESTIONS_PROMPT,
  chatPrompt:         DEFAULT_CHAT_PROMPT,
  suggestionsContext: 1200,
  chatContext:        8000,
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  // ── State ────────────────────────────────────────────────────────────────
  const [settings, setSettings]             = useState(DEFAULT_SETTINGS)
  const [showSettings, setShowSettings]     = useState(false)

  const [transcriptChunks, setTranscriptChunks]    = useState([])
  const [suggestionBatches, setSuggestionBatches]  = useState([])
  const [chatMessages, setChatMessages]            = useState([])

  const [isTranscribing, setIsTranscribing]        = useState(false)
  const [isGenerating, setIsGenerating]            = useState(false)
  const [isStreaming, setIsStreaming]              = useState(false)
  const [activeSuggestionId, setActiveSuggestionId] = useState(null)
  const [error, setError]                          = useState(null)

  // Ref for full transcript text (avoids stale closures in callbacks)
  const transcriptRef = useRef('')

  // ── Error helper ─────────────────────────────────────────────────────────
  function showError(msg) {
    setError(msg)
    setTimeout(() => setError(null), 6000)
  }

  // ── Audio chunk handler ───────────────────────────────────────────────────
  // Called by useAudioRecorder every ~30s with a new audio Blob.
  const handleAudioChunk = useCallback(async (blob) => {
    if (!settings.apiKey) {
      showError('No API key set — open Settings to add your Groq API key')
      return
    }

    setIsTranscribing(true)
    try {
      // Check for speech before sending to Whisper.
      // Silent chunks cause Whisper to hallucinate
      const speechDetected = await hasSpeech(blob)
      if (!speechDetected) {
        console.log('Silent chunk detected — skipping transcription')
        setIsTranscribing(false)
        return
      }

      const type = blob.type || 'audio/webm'
      const ext  = type.includes('mp4') ? 'mp4'
                 : type.includes('ogg') ? 'ogg'
                 : 'webm'
      const file = blob instanceof File ? blob : new File([blob], `audio.${ext}`, { type })
      const text = await transcribeAudio(file, settings.apiKey)
      if (!text) return

      const chunk = { id: uid(), timestamp: Date.now(), text }
      setTranscriptChunks(prev => [...prev, chunk])
      transcriptRef.current += (transcriptRef.current ? '\n' : '') + text
    } catch (err) {
      showError(`Transcription error: ${err.message}`)
    } finally {
      setIsTranscribing(false)
    }
  }, [settings.apiKey])

  // ── Mic toggle ────────────────────────────────────────────────────────────
  const { isRecording, start: startRecording, stop: stopRecording } = useAudioRecorder({
    onChunk: handleAudioChunk,
  })

  async function toggleMic() {
    if (!settings.apiKey) {
      setShowSettings(true)
      return
    }
    if (isRecording) {
      stopRecording()
    } else {
      try {
        await startRecording()
      } catch {
        showError('Microphone access denied — please allow mic access in your browser')
      }
    }
  }

  // ── Generate suggestions ──────────────────────────────────────────────────
  // Pulls recent transcript context, sends to Groq, appends new batch.
  async function handleReloadSuggestions() {
    if (!settings.apiKey) {
      setShowSettings(true)
      return
    }
    if (isGenerating) return

    setIsGenerating(true)
    try {
      // Collect previews from last 2 batches to avoid repetition
      const recentBatches = suggestionBatches.slice(-2)
      const alreadyShown  = recentBatches.flatMap(b => b.suggestions.map(s => s.preview))

      const suggestions = await generateSuggestions(
        transcriptRef.current,
        alreadyShown,
        settings.apiKey,
        settings.suggestionsPrompt,
        settings.suggestionsContext,
      )

      if (suggestions.length === 0) {
        showError('No suggestions returned — try recording more audio first')
        return
      }

      const batch = {
        id:          uid(),
        timestamp:   Date.now(),
        suggestions: suggestions.map(s => ({ ...s, id: uid() })),
      }

      setSuggestionBatches(prev => [...prev, batch])
    } catch (err) {
      showError(`Suggestion error: ${err.message}`)
    } finally {
      setIsGenerating(false)
    }
  }

  // Auto-refresh every 30s while recording
  useAutoRefresh({
    callback:    handleReloadSuggestions,
    intervalMs:  30_000,
    enabled:     isRecording,
  })

  // ── Select a suggestion card ──────────────────────────────────────────────
  // Marks the card as active and kicks off a streaming chat response.
  function handleSelectSuggestion(suggestion) {
    setActiveSuggestionId(suggestion.id)
    // Build the user message from the suggestion context
    const userText = `${suggestion.preview}\n\n${suggestion.detail_prompt}`
    sendChatMessage(userText)
  }

  // ── Send chat message (user typed or suggestion clicked) ──────────────────
  async function sendChatMessage(text) {
    if (isStreaming) return

    const userMsg = { id: uid(), timestamp: Date.now(), role: 'user', content: text }
    const asstMsg = { id: uid(), timestamp: Date.now(), role: 'assistant', content: '' }

    setChatMessages(prev => [...prev, userMsg, asstMsg])
    setIsStreaming(true)

    try {
      // Build messages array for the API (all previous turns)
      const history = [...chatMessages, userMsg].map(m => ({
        role:    m.role,
        content: m.content,
      }))

      let accumulated = ''
      const stream = streamChatResponse(
        history,
        transcriptRef.current,
        settings.apiKey,
        settings.chatPrompt,
        settings.chatContext,
      )

      for await (const token of stream) {
        accumulated += token
        // Update the assistant message in place
        setChatMessages(prev => {
          const next = [...prev]
          next[next.length - 1] = { ...next[next.length - 1], content: accumulated }
          return next
        })
      }
    } catch (err) {
      showError(`Chat error: ${err.message}`)
      // Remove the empty assistant message on error
      setChatMessages(prev => prev.slice(0, -1))
    } finally {
      setIsStreaming(false)
    }
  }

  // ── Export ────────────────────────────────────────────────────────────────
  function handleExport() {
    exportSession({ transcriptChunks, suggestionBatches, chatMessages })
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="app">
      {/* Top bar */}
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-logo">TwinMind</span>
          <span style={{ color: 'var(--border-focus)', fontSize: 12 }}>—</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Live Suggestions</span>
        </div>
        <div className="topbar-right">
          {error && (
            <span style={{ fontSize: 11, color: '#ef4444', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              ⚠ {error}
            </span>
          )}
          <button className="btn" onClick={handleExport} title="Export session as JSON">
            <DownloadIcon />
            Export
          </button>
          <button
            className="btn"
            onClick={() => setShowSettings(true)}
            style={!settings.apiKey ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : {}}
          >
            <GearIcon />
            {settings.apiKey ? 'Settings' : 'Add API Key'}
          </button>
        </div>
      </div>

      {/* 3 columns */}
      <div className="columns">
        <TranscriptColumn
          chunks={transcriptChunks}
          isRecording={isRecording}
          isTranscribing={isTranscribing}
          onToggleMic={toggleMic}
        />

        <SuggestionsColumn
          batches={suggestionBatches}
          activeSuggestionId={activeSuggestionId}
          isLoading={isGenerating}
          isRecording={isRecording}
          onReload={handleReloadSuggestions}
          onSelectSuggestion={handleSelectSuggestion}
        />

        <ChatColumn
          messages={chatMessages}
          isStreaming={isStreaming}
          onSend={sendChatMessage}
        />
      </div>

      {/* Settings overlay */}
      {showSettings && (
        <SettingsPanel
          settings={settings}
          onSave={setSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────
function GearIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  )
}
