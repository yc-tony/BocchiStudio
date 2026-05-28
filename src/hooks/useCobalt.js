import { useState, useCallback } from 'react'

export function useCobalt() {
  const [status, setStatus] = useState('idle') // idle | loading | success | error
  const [error, setError] = useState('')

  const loadTrack = useCallback(async (youtubeUrl) => {
    setStatus('loading')
    setError('')

    try {
      const res = await fetch('/cobalt-api/', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: youtubeUrl,
          downloadMode: 'audio',
          audioFormat: 'mp3',
          audioBitrate: '128',
          filenameStyle: 'basic',
        }),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Cobalt API ${res.status}: ${text.slice(0, 120)}`)
      }

      const data = await res.json()

      if (data.status === 'error') {
        throw new Error(data.error?.code || JSON.stringify(data.error) || 'Unknown API error')
      }

      const downloadUrl = data.url
      if (!downloadUrl) throw new Error('No download URL in API response')

      // Fetch the audio as a blob so FFmpeg can use it later
      const audioRes = await fetch(downloadUrl)
      if (!audioRes.ok) throw new Error(`Audio download failed: ${audioRes.status}`)

      const blob = await audioRes.blob()
      const objectUrl = URL.createObjectURL(blob)
      const title = data.filename ? data.filename.replace(/\.\w+$/, '') : 'Unknown Track'

      setStatus('success')
      return { blob, objectUrl, title }
    } catch (err) {
      const msg = err.message || 'Failed to load track'
      setError(msg)
      setStatus('error')
      throw new Error(msg)
    }
  }, [])

  // Manual fallback: user picks a local audio file
  const loadFromFile = useCallback((file) => {
    const blob = file
    const objectUrl = URL.createObjectURL(blob)
    const title = file.name.replace(/\.\w+$/, '')
    setStatus('success')
    setError('')
    return { blob, objectUrl, title }
  }, [])

  return { status, error, loadTrack, loadFromFile }
}
