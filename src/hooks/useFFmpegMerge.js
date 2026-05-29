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
  const [loaded, setLoaded]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [progress, setProgress] = useState(0)
  const [log, setLog]           = useState('')
  const [merging, setMerging]   = useState(false)
  const [error, setError]       = useState('')
  const ffmpegRef               = useRef(null)

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

  /**
   * Merge inputs into a single output file.
   *   videoBlob — camera recording (video-only stream, no audio)
   *   micBlob   — mic recording (audio-only stream, no video)
   *   audioBlob — backing music (audio file uploaded by user)
   * Any combination of the three is accepted; at least one must be present.
   * syncOffsetMs shifts audioBlob relative to micBlob/videoBlob start.
   */
  const merge = useCallback(async ({
    videoBlob, micBlob, audioBlob,
    syncOffsetMs = 0, format = 'mp4',
  }) => {
    setError('')
    setProgress(0)
    setMerging(true)

    try {
      const ffmpeg = await ensureLoaded()
      if (!ffmpeg) throw new Error('FFmpeg not ready')

      const fmt    = EXPORT_FORMATS.find((f) => f.id === format) ?? EXPORT_FORMATS[0]
      const hasVid = !!videoBlob
      const hasMic = !!micBlob
      const hasBgm = !!audioBlob

      if (!hasVid && !hasMic && !hasBgm) throw new Error('沒有可匯出的素材')

      appendLog('Writing input files…')

      const vidExt = hasVid
        ? (videoBlob.type.includes('mp4') ? 'mp4' : 'webm')
        : null
      const micExt = hasMic
        ? (micBlob.type.includes('ogg') ? 'ogg' : 'webm')
        : null
      const bgmExt = hasBgm
        ? (audioBlob.type.includes('mpeg') || audioBlob.type.includes('mp3') ? 'mp3'
          : audioBlob.type.includes('ogg') ? 'ogg' : 'mp3')
        : null

      if (hasVid) await ffmpeg.writeFile(`vid.${vidExt}`, await fetchFile(videoBlob))
      if (hasMic) await ffmpeg.writeFile(`mic.${micExt}`, await fetchFile(micBlob))
      if (hasBgm) await ffmpeg.writeFile(`bgm.${bgmExt}`, await fetchFile(audioBlob))

      appendLog(`Merging → ${fmt.ext} (offset: ${syncOffsetMs}ms)…`)

      const delayMs = Math.max(0, syncOffsetMs)
      const trimSec = Math.max(0, -syncOffsetMs / 1000).toFixed(3)
      const outFile = `output.${fmt.ext}`

      // Returns filter fragment that delays/trims BGM; inLabel → [bgm_t]
      const bgmFilter = (inLabel) => syncOffsetMs >= 0
        ? `${inLabel}adelay=${delayMs}|${delayMs}[bgm_t]`
        : `${inLabel}atrim=start=${trimSec},asetpts=PTS-STARTPTS[bgm_t]`

      const ACODECS = { mp3: 'libmp3lame', wav: 'pcm_s16le', flac: 'flac' }
      const aC  = ACODECS[fmt.id] ?? 'libmp3lame'
      const vC  = fmt.id === 'mp4' ? 'libx264' : 'copy'
      const avAC = fmt.id === 'mp4' ? 'aac' : 'libopus'
      const mp4F = fmt.id === 'mp4' ? ['-preset', 'fast', '-movflags', '+faststart'] : []

      // Produce video stream only if format supports it AND we have camera footage
      const doVideo = hasVid && !fmt.videoOnly

      let cmd

      if (hasVid && hasMic && hasBgm) {
        // ── cam(0) + mic(1) + bgm(2) ─────────────────────────────
        const filter = bgmFilter('[2:a]') +
          `;[1:a][bgm_t]amix=inputs=2:duration=first:dropout_transition=0[aout]`
        if (doVideo) {
          cmd = [
            '-i', `vid.${vidExt}`, '-i', `mic.${micExt}`, '-i', `bgm.${bgmExt}`,
            '-filter_complex', filter, '-map', '0:v', '-map', '[aout]',
            '-c:v', vC, '-c:a', avAC, ...mp4F, '-b:a', '128k', outFile,
          ]
        } else {
          cmd = [
            '-i', `vid.${vidExt}`, '-i', `mic.${micExt}`, '-i', `bgm.${bgmExt}`,
            '-filter_complex', filter, '-map', '[aout]',
            '-c:a', aC, ...(fmt.id === 'mp3' ? ['-b:a', '192k'] : []), outFile,
          ]
        }

      } else if (hasVid && hasMic) {
        // ── cam(0) + mic(1), no BGM ───────────────────────────────
        if (doVideo) {
          cmd = [
            '-i', `vid.${vidExt}`, '-i', `mic.${micExt}`,
            '-map', '0:v', '-map', '1:a',
            '-c:v', vC, '-c:a', avAC, ...mp4F, '-b:a', '128k', outFile,
          ]
        } else {
          cmd = [
            '-i', `mic.${micExt}`,
            '-c:a', aC, ...(fmt.id === 'mp3' ? ['-b:a', '192k'] : []), outFile,
          ]
        }

      } else if (hasVid && hasBgm) {
        // ── cam(0) + bgm(1), no mic ───────────────────────────────
        // Replace [bgm_t] with [aout] since no mixing needed
        const filter = bgmFilter('[1:a]').replace('[bgm_t]', '[aout]')
        if (doVideo) {
          cmd = [
            '-i', `vid.${vidExt}`, '-i', `bgm.${bgmExt}`,
            '-filter_complex', filter, '-map', '0:v', '-map', '[aout]',
            '-c:v', vC, '-c:a', avAC, '-shortest', ...mp4F, '-b:a', '128k', outFile,
          ]
        } else {
          cmd = [
            '-i', `bgm.${bgmExt}`,
            '-c:a', aC, ...(fmt.id === 'mp3' ? ['-b:a', '192k'] : []), outFile,
          ]
        }

      } else if (hasMic && hasBgm) {
        // ── mic(0) + bgm(1), no camera → audio only ───────────────
        const filter = bgmFilter('[1:a]') +
          `;[0:a][bgm_t]amix=inputs=2:duration=first:dropout_transition=0[aout]`
        cmd = [
          '-i', `mic.${micExt}`, '-i', `bgm.${bgmExt}`,
          '-filter_complex', filter, '-map', '[aout]',
          '-c:a', aC, ...(fmt.id === 'mp3' ? ['-b:a', '192k'] : []), outFile,
        ]

      } else if (hasMic) {
        // ── mic only ──────────────────────────────────────────────
        cmd = ['-i', `mic.${micExt}`, '-c:a', aC, ...(fmt.id === 'mp3' ? ['-b:a', '192k'] : []), outFile]

      } else {
        // ── just video or just BGM ────────────────────────────────
        const src = hasVid ? `vid.${vidExt}` : `bgm.${bgmExt}`
        cmd = ['-i', src, '-c:a', aC, outFile]
      }

      await ffmpeg.exec(cmd)

      appendLog('Reading output…')
      const data = await ffmpeg.readFile(outFile)
      const mimeType = doVideo
        ? (fmt.id === 'webm' ? 'video/webm' : 'video/mp4')
        : (fmt.id === 'mp3' ? 'audio/mpeg' : fmt.id === 'wav' ? 'audio/wav' : `audio/${fmt.id}`)
      const outputBlob = new Blob([data.buffer], { type: mimeType })

      if (hasVid) await ffmpeg.deleteFile(`vid.${vidExt}`).catch(() => {})
      if (hasMic) await ffmpeg.deleteFile(`mic.${micExt}`).catch(() => {})
      if (hasBgm) await ffmpeg.deleteFile(`bgm.${bgmExt}`).catch(() => {})
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
