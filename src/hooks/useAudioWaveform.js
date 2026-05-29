import { useState, useEffect } from 'react'

// Decodes an audio Blob and returns a normalized peaks array (values 0–1).
// Returns null while decoding or if no blob is provided.
export function useAudioWaveform(blob, numBuckets = 200) {
  const [peaks, setPeaks] = useState(null)

  useEffect(() => {
    if (!blob) { setPeaks(null); return }
    let cancelled = false

    ;(async () => {
      try {
        const arrayBuf = await blob.arrayBuffer()
        if (cancelled) return
        const ctx = new AudioContext()
        const decoded = await ctx.decodeAudioData(arrayBuf)
        await ctx.close()
        if (cancelled) return

        const channel = decoded.getChannelData(0)
        const step = Math.max(1, Math.floor(channel.length / numBuckets))
        const out = new Float32Array(numBuckets)
        for (let i = 0; i < numBuckets; i++) {
          let peak = 0
          for (let j = 0; j < step; j++) {
            const v = Math.abs(channel[i * step + j] ?? 0)
            if (v > peak) peak = v
          }
          out[i] = peak
        }
        const maxVal = Math.max(...out, 0.0001)
        setPeaks(Array.from(out, (v) => v / maxVal))
      } catch {
        // Silently ignore decode failures (unsupported format, etc.)
      }
    })()

    return () => { cancelled = true }
  }, [blob]) // numBuckets treated as constant

  return peaks
}
