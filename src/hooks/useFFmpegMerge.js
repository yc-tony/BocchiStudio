import { useState, useRef, useCallback } from 'react'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

const CORE_BASE = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm'

// Supported export formats.
// locked: true = requires active subscription (paywall enforcement is in ExportModal).
export const EXPORT_FORMATS = [
  { id: 'mp4',  label: 'MP4',  desc: '影片 + 音訊',      ext: 'mp4',  videoOnly: false, locked: false },
  { id: 'webm', label: 'WEBM', desc: '影片 + 音訊（網頁）', ext: 'webm', videoOnly: false, locked: false },
  { id: 'mp3',  label: 'MP3',  desc: '僅音訊',            ext: 'mp3',  videoOnly: true,  locked: false },
  { id: 'wav',  label: 'WAV',  desc: '無損音訊',          ext: 'wav',  videoOnly: true,  locked: false },
  { id: 'flac', label: 'FLAC', desc: '無損壓縮音訊',      ext: 'flac', videoOnly: true,  locked: true  },
]

export function useFFmpegMerge() {
  const [loaded, setLoaded]   = useState(false)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [log, setLog]         = useState('')
  const [merging, setMerging] = useState(false)
  const [error, setError]     = useState('')
  const ffmpegRef             = useRef(null)

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

  // format: one of EXPORT_FORMATS[].id
  const merge = useCallback(async ({ videoBlob, audioBlob, syncOffsetMs = 0, format = 'mp4' }) => {
    setError('')
    setProgress(0)
    setMerging(true)

    try {
      const ffmpeg = await ensureLoaded()
      if (!ffmpeg) throw new Error('FFmpeg not ready')

      const fmt = EXPORT_FORMATS.find((f) => f.id === format) ?? EXPORT_FORMATS[0]
      appendLog(`Writing input files…`)

      const videoExt = videoBlob.type.includes('mp4') ? 'mp4' : 'webm'
      const audioExt = audioBlob.type.includes('mpeg') || audioBlob.type.includes('mp3') ? 'mp3'
        : audioBlob.type.includes('ogg') ? 'ogg' : 'mp3'

      await ffmpeg.writeFile(`input.${videoExt}`, await fetchFile(videoBlob))
      await ffmpeg.writeFile(`music.${audioExt}`, await fetchFile(audioBlob))

      appendLog(`Merging → ${fmt.ext} (offset: ${syncOffsetMs}ms)…`)

      const delayMs  = Math.max(0, syncOffsetMs)
      const trimSec  = Math.max(0, -syncOffsetMs / 1000).toFixed(3)
      const outFile  = `output.${fmt.ext}`

      let filterStr
      if (syncOffsetMs >= 0) {
        filterStr = `[1:a]adelay=${delayMs}|${delayMs}[mus];[0:a][mus]amix=inputs=2:duration=first:dropout_transition=0[aout]`
      } else {
        filterStr = `[1:a]atrim=start=${trimSec},asetpts=PTS-STARTPTS[mus];[0:a][mus]amix=inputs=2:duration=first:dropout_transition=0[aout]`
      }

      if (fmt.videoOnly) {
        // Audio-only export: mix tracks and strip video
        const audioCodec = { mp3: 'libmp3lame', wav: 'pcm_s16le', flac: 'flac' }[fmt.id] ?? 'libmp3lame'
        await ffmpeg.exec([
          '-i', `input.${videoExt}`,
          '-i', `music.${audioExt}`,
          '-filter_complex', filterStr,
          '-map', '[aout]',
          '-c:a', audioCodec,
          ...(fmt.id === 'mp3' ? ['-b:a', '192k'] : []),
          outFile,
        ])
      } else {
        // Video + audio export
        const videoCodec = fmt.id === 'mp4' ? 'libx264' : 'copy'
        const audioCodec = fmt.id === 'mp4' ? 'aac'     : 'libopus'
        await ffmpeg.exec([
          '-i', `input.${videoExt}`,
          '-i', `music.${audioExt}`,
          '-filter_complex', filterStr,
          '-map', '0:v',
          '-map', '[aout]',
          '-c:v', videoCodec,
          '-c:a', audioCodec,
          ...(fmt.id === 'mp4' ? ['-preset', 'fast', '-movflags', '+faststart'] : []),
          '-b:a', '128k',
          outFile,
        ])
      }

      appendLog('Reading output…')
      const data = await ffmpeg.readFile(outFile)
      const outputBlob = new Blob([data.buffer], { type: fmt.videoOnly
        ? `audio/${fmt.id === 'mp3' ? 'mpeg' : fmt.id}`
        : `video/${fmt.ext}` })

      // Clean up virtual FS
      await ffmpeg.deleteFile(`input.${videoExt}`).catch(() => {})
      await ffmpeg.deleteFile(`music.${audioExt}`).catch(() => {})
      await ffmpeg.deleteFile(outFile).catch(() => {})

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
