// ── useAudioRecorder ──────────────────────────────────────────────────────────
//
// Handles mic capture and chunked audio emission every ~30 seconds.

import { useRef, useState, useCallback } from 'react'

const CHUNK_INTERVAL_MS = 30_000

export function useAudioRecorder({ onChunk }) {
  const [isRecording, setIsRecording] = useState(false)
  const mediaRecorderRef = useRef(null)
  const streamRef        = useRef(null)
  const chunksRef        = useRef([])
  const headerChunkRef   = useRef(null)  // first chunk = webm init segment
  const flushIntervalRef = useRef(null)
  const mimeTypeRef      = useRef('')
  const onChunkRef       = useRef(onChunk)

  onChunkRef.current = onChunk

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current   = stream
      chunksRef.current   = []
      headerChunkRef.current = null

      const mimeType = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
      ].find(m => MediaRecorder.isTypeSupported(m)) || ''

      mimeTypeRef.current = mimeType

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {})
      mediaRecorderRef.current = recorder

      recorder.addEventListener('dataavailable', (e) => {
        if (!e.data || e.data.size === 0) return

        if (headerChunkRef.current === null) {
          // First chunk contains the webm initialization segment — save it
          headerChunkRef.current = e.data
        }
        chunksRef.current.push(e.data)
      })

      flushIntervalRef.current = setInterval(() => {
        const chunks = chunksRef.current.splice(0)
        if (chunks.length === 0) return

        const type = mimeTypeRef.current || 'audio/webm'

        // Prepend header to every batch so each blob is a valid webm file.
        // Skip prepending if chunks[0] is already the header (first batch).
        const isFirstBatch = chunks[0] === headerChunkRef.current
        const blobParts    = isFirstBatch || !headerChunkRef.current
          ? chunks
          : [headerChunkRef.current, ...chunks]

        const blob = new Blob(blobParts, { type })
        if (blob.size < 2048) return

        const ext  = type.includes('mp4') ? 'mp4'
                   : type.includes('ogg') ? 'ogg'
                   : 'webm'

        const file = new File([blob], `audio.${ext}`, { type })
        onChunkRef.current(file)
      }, CHUNK_INTERVAL_MS)

      recorder.start(1000)
      setIsRecording(true)
    } catch (err) {
      console.error('Mic access failed:', err)
      throw err
    }
  }, [])

  const stop = useCallback(() => {
    clearInterval(flushIntervalRef.current)
    flushIntervalRef.current = null

    const chunks = chunksRef.current.splice(0)
    if (chunks.length > 0 && headerChunkRef.current) {
      const type      = mimeTypeRef.current || 'audio/webm'
      const isFirst   = chunks[0] === headerChunkRef.current
      const blobParts = isFirst ? chunks : [headerChunkRef.current, ...chunks]
      const blob      = new Blob(blobParts, { type })

      if (blob.size >= 2048) {
        const ext  = type.includes('mp4') ? 'mp4'
                   : type.includes('ogg') ? 'ogg'
                   : 'webm'
        onChunkRef.current(new File([blob], `audio.${ext}`, { type }))
      }
    }

    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    streamRef.current?.getTracks().forEach(t => t.stop())
    setIsRecording(false)
  }, [])

  return { isRecording, start, stop }
}