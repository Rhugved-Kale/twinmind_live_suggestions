// ── useAutoRefresh ────────────────────────────────────────────────────────────
//
// Fires a callback every intervalMs while enabled.
// We only auto-refresh suggestions when recording — no point generating
// suggestions for a stale transcript.

import { useEffect, useRef } from 'react'

export function useAutoRefresh({ callback, intervalMs = 30_000, enabled }) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    if (!enabled) return

    const id = setInterval(() => {
      callbackRef.current()
    }, intervalMs)

    return () => clearInterval(id)
  }, [enabled, intervalMs])
}