import { useState, useRef, useCallback } from 'react'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

const CORE_BASE = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm'

export function useFFmpegMerge() {
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0) // 0-100
  const [log, setLog] = useState('')
  const [merging, setMerging] = useState(false)
  const [error, setError] = useState('')
  const ffmpegRef = useRef(null)

  const appendLog = (msg) => setLog((prev) => (prev + '\n' + msg).slice(-2000))

  const ensureLoaded = useCallback(async () => {
    if (loaded && ffmpegRef.current) return ffmpegRef.current
    if (loading) return null

    setLoading(true)
    setError('')
    appendLog('Loading FFmpeg.wasm core…')

    const ffmpeg = new FFmpeg()
    ffmpegRef.current = ffmpeg

    ffmpeg.on('log', ({ message }) => appendLog(message))
    ffmpeg.on('progress', ({ progress: p }) => setProgress(Math.round(p * 100)))

    try {
      await ffmpeg.load({
        coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
      })
      setLoaded(true)
      setLoading(false)
      appendLog('FFmpeg ready.')
      return ffmpeg
    } catch (err) {
      setError(`FFmpeg load failed: ${err.message}`)
      setLoading(false)
      throw err
    }
  }, [loaded, loading])

  const merge = useCallback(async ({ videoBlob, audioBlob, syncOffsetMs = 0 }) => {
    setError('')
    setProgress(0)
    setMerging(true)

    try {
      const ffmpeg = await ensureLoaded()
      if (!ffmpeg) throw new Error('FFmpeg not ready')

      appendLog('Writing input files…')

      const videoExt = videoBlob.type.includes('mp4') ? 'mp4' : 'webm'
      const audioExt = audioBlob.type.includes('mpeg') || audioBlob.type.includes('mp3')
        ? 'mp3' : audioBlob.type.includes('ogg') ? 'ogg' : 'mp3'

      await ffmpeg.writeFile(`input.${videoExt}`, await fetchFile(videoBlob))
      await ffmpeg.writeFile(`music.${audioExt}`, await fetchFile(audioBlob))

      appendLog(`Merging (sync offset: ${syncOffsetMs}ms)…`)

      const delayMs = Math.max(0, syncOffsetMs)
      const trimSec = Math.max(0, -syncOffsetMs / 1000).toFixed(3)
      const outputExt = 'webm'

      // Build audio filter: mix mic audio from recording + music track (with optional delay/trim)
      let filterStr
      if (syncOffsetMs >= 0) {
        // Music starts [delayMs] after video: adelay on music
        filterStr = `[1:a]adelay=${delayMs}|${delayMs}[mus];[0:a][mus]amix=inputs=2:duration=first:dropout_transition=0[aout]`
      } else {
        // Music started before recording; trim the first |offset| seconds of music
        filterStr = `[1:a]atrim=start=${trimSec},asetpts=PTS-STARTPTS[mus];[0:a][mus]amix=inputs=2:duration=first:dropout_transition=0[aout]`
      }

      await ffmpeg.exec([
        '-i', `input.${videoExt}`,
        '-i', `music.${audioExt}`,
        '-filter_complex', filterStr,
        '-map', '0:v',
        '-map', '[aout]',
        '-c:v', 'copy',
        '-c:a', 'libopus',
        '-b:a', '128k',
        `output.${outputExt}`,
      ])

      appendLog('Reading output…')
      const data = await ffmpeg.readFile(`output.${outputExt}`)
      const outputBlob = new Blob([data.buffer], { type: `video/${outputExt}` })

      // Clean up virtual FS
      await ffmpeg.deleteFile(`input.${videoExt}`).catch(() => {})
      await ffmpeg.deleteFile(`music.${audioExt}`).catch(() => {})
      await ffmpeg.deleteFile(`output.${outputExt}`).catch(() => {})

      setProgress(100)
      setMerging(false)
      appendLog('Done!')
      return outputBlob
    } catch (err) {
      const msg = err.message || 'Merge failed'
      setError(msg)
      appendLog(`ERROR: ${msg}`)
      setMerging(false)
      throw err
    }
  }, [ensureLoaded])

  return { loaded, loading, merging, progress, log, error, merge, ensureLoaded }
}
