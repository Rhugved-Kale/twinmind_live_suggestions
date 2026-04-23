// ── Export ────────────────────────────────────────────────────────────────────
// Exports the full session as JSON: transcript chunks, suggestion batches,
// and chat history. The assignment says JSON or plain text is fine; we use
// JSON so it's machine-readable for their evaluation pipeline.

export function exportSession({ transcriptChunks, suggestionBatches, chatMessages }) {
    const session = {
      exported_at: new Date().toISOString(),
      transcript: transcriptChunks.map(c => ({
        timestamp: new Date(c.timestamp).toISOString(),
        text: c.text,
      })),
      suggestion_batches: suggestionBatches.map(b => ({
        timestamp: new Date(b.timestamp).toISOString(),
        suggestions: b.suggestions.map(s => ({
          type:    s.type,
          preview: s.preview,
        })),
      })),
      chat: chatMessages.map(m => ({
        timestamp: new Date(m.timestamp).toISOString(),
        role:    m.role,
        content: m.content,
      })),
    }
  
    const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `twinmind-session-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }