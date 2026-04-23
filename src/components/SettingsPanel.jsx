// ── SettingsPanel ─────────────────────────────────────────────────────────────
// Overlay for API key input and prompt/parameter editing.
// All settings are passed in as props and controlled by parent state,
// so changes are immediately reflected everywhere without prop drilling hacks.

import { useState } from 'react'
import { DEFAULT_SUGGESTIONS_PROMPT, DEFAULT_CHAT_PROMPT } from '../lib/groq.js'

export function SettingsPanel({ settings, onSave, onClose }) {
  const [local, setLocal] = useState({ ...settings })

  function set(key, value) {
    setLocal(prev => ({ ...prev, [key]: value }))
  }

  function handleSave() {
    onSave(local)
    onClose()
  }

  function handleReset() {
    setLocal({
      ...local,
      suggestionsPrompt:    DEFAULT_SUGGESTIONS_PROMPT,
      chatPrompt:           DEFAULT_CHAT_PROMPT,
      suggestionsContext:   1200,
      chatContext:          8000,
    })
  }

  return (
    <div className="overlay-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="overlay-panel">
        <div className="overlay-title">Settings</div>

        {/* API Key */}
        <div className="overlay-section">
          <div className="overlay-label">Groq API Key</div>
          <div className="overlay-sublabel">Paste your key from console.groq.com — never stored anywhere except this browser session.</div>
          <input
            className="overlay-input"
            type="password"
            placeholder="gsk_..."
            value={local.apiKey}
            onChange={e => set('apiKey', e.target.value)}
            autoComplete="off"
          />
        </div>

        <div className="divider" />

        {/* Context windows */}
        <div className="overlay-section">
          <div className="overlay-label">Context Windows</div>
          <div className="overlay-row">
            <div className="overlay-section">
              <div className="overlay-sublabel">Suggestions — recent transcript chars (default 1200 ≈ ~2-3 min)</div>
              <input
                className="overlay-input"
                type="number"
                min={200}
                max={8000}
                step={100}
                value={local.suggestionsContext}
                onChange={e => set('suggestionsContext', Number(e.target.value))}
              />
            </div>
            <div className="overlay-section">
              <div className="overlay-sublabel">Chat — full transcript chars passed to answers (default 8000)</div>
              <input
                className="overlay-input"
                type="number"
                min={1000}
                max={32000}
                step={1000}
                value={local.chatContext}
                onChange={e => set('chatContext', Number(e.target.value))}
              />
            </div>
          </div>
        </div>

        <div className="divider" />

        {/* Suggestions prompt */}
        <div className="overlay-section">
          <div className="overlay-label">Live Suggestions System Prompt</div>
          <div className="overlay-sublabel">
            Controls what suggestions are generated. Must instruct the model to return JSON with the schema:
            {"{ suggestions: [{ type, preview, detail_prompt }] }"}
          </div>
          <textarea
            className="overlay-input overlay-textarea"
            value={local.suggestionsPrompt}
            onChange={e => set('suggestionsPrompt', e.target.value)}
            rows={8}
          />
        </div>

        {/* Chat prompt */}
        <div className="overlay-section">
          <div className="overlay-label">Chat / Expanded Answer System Prompt</div>
          <div className="overlay-sublabel">
            Controls detailed answers when a suggestion is clicked or the user types a question.
            Full transcript context is automatically appended.
          </div>
          <textarea
            className="overlay-input overlay-textarea"
            value={local.chatPrompt}
            onChange={e => set('chatPrompt', e.target.value)}
            rows={6}
          />
        </div>

        <div className="overlay-footer">
          <button className="btn" onClick={handleReset}>Reset to defaults</button>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-accent" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  )
}
