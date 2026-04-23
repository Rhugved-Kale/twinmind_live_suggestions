// ── audioUtils.js ─────────────────────────────────────────────────────────────
//
// Silence detection: measure RMS energy of an audio blob.
// Returns true if the audio contains actual speech (energy above threshold).
// Used to gate Whisper calls — silent chunks cause Whisper to hallucinate.

/**
 * Returns true if the audio blob contains enough energy to be worth
 * transcribing. Prevents Whisper hallucinations on silent chunks.
 * @param {Blob|File} blob
 * @returns {Promise<boolean>}
 */
export async function hasSpeech(blob) {
    try {
      const arrayBuffer = await blob.arrayBuffer()
      const audioCtx    = new AudioContext()
      let   audioBuffer
  
      try {
        audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
      } finally {
        audioCtx.close()
      }
  
      const data = audioBuffer.getChannelData(0)
  
      // Compute RMS (root mean square) energy
      let sum = 0
      for (let i = 0; i < data.length; i++) {
        sum += data[i] * data[i]
      }
      const rms = Math.sqrt(sum / data.length)
  
      // Threshold tuned for speech vs background noise.
      // 0.01 = very quiet room noise, 0.02+ = audible speech.
      return rms > 0.015
    } catch {
      // If we can't decode, assume it has speech and let Whisper decide
      return true
    }
  }