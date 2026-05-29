import { useState, useRef, useCallback, useEffect } from 'react'

function bestAudioMime() {
  const c = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg']
  return c.find((t) => MediaRecorder.isTypeSupported(t)) || ''
}

// Handles audio-only recording (mic input).
// Video capture is done separately by useCameraRecorder.
export function useMicRecorder() {
  const [state, setState]       = useState('idle') // idle | requesting | recording | done
  const [elapsed, setElapsed]   = useState(0)
  const [blob, setBlob]         = useState(null)
  const [micLevel, setMicLevel] = useState(0)
  const [permError, setPermError] = useState('')
  const [audioDevices, setAudioDevices] = useState([])
  const [selectedAudioId, setSelectedAudioId] = useState('')

  const streamRef   = useRef(null)
  const mrRef       = useRef(null)
  const chunksRef   = useRef([])
  const timerRef    = useRef(null)
  const audioCtxRef = useRef(null)
  const rafRef      = useRef(null)

  const refreshDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      setAudioDevices(all.filter((d) => d.kind === 'audioinput'))
    } catch {}
  }, [])

  useEffect(() => {
    refreshDevices()
    navigator.mediaDevices.addEventListener('devicechange', refreshDevices)
    return () => navigator.mediaDevices.removeEventListener('devicechange', refreshDevices)
  }, [refreshDevices])

  const startVU = useCallback((stream) => {
    if (audioCtxRef.current) audioCtxRef.current.close()
    const ctx = new AudioContext()
    audioCtxRef.current = ctx
    const src = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    src.connect(analyser)
    const data = new Uint8Array(analyser.frequencyBinCount)
    const tick = () => {
      analyser.getByteFrequencyData(data)
      const rms = Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length) / 128
      setMicLevel(Math.min(1, rms * 2))
      rafRef.current = requestAnimationFrame(tick)
    }
    tick()
  }, [])

  const stopVU = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null }
    setMicLevel(0)
  }, [])

  const requestMic = useCallback(async (audioId) => {
    setState('requesting')
    setPermError('')
    const aId = audioId ?? selectedAudioId
    try {
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop())
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: aId
          ? { deviceId: { exact: aId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
          : { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      })
      streamRef.current = stream
      stopVU(); startVU(stream)
      setState('idle')
      await refreshDevices()
      return stream
    } catch (err) {
      const msg = err.name === 'NotAllowedError'
        ? '麥克風權限被拒絕，請在瀏覽器設定中允許。'
        : `裝置錯誤：${err.message}`
      setPermError(msg)
      setState('idle')
      throw err
    }
  }, [selectedAudioId, startVU, stopVU, refreshDevices])

  const switchAudio = useCallback(async (deviceId) => {
    setSelectedAudioId(deviceId)
    await requestMic(deviceId).catch(() => {})
  }, [requestMic])

  const startImmediate = useCallback(async () => {
    let stream = streamRef.current
    if (!stream) { try { stream = await requestMic() } catch { return } }
    chunksRef.current = []
    const mimeType = bestAudioMime()
    const mr = new MediaRecorder(stream, { mimeType })
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    mr.onstop = () => { setBlob(new Blob(chunksRef.current, { type: mimeType || 'audio/webm' })); setState('done') }
    mr.start(100)
    mrRef.current = mr
    const start = Date.now()
    setElapsed(0)
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 500)
    setState('recording')
  }, [requestMic])

  const stopImmediate = useCallback(() => {
    clearInterval(timerRef.current)
    if (mrRef.current?.state !== 'inactive') mrRef.current?.stop()
    stopVU()
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null }
  }, [stopVU])

  useEffect(() => () => stopImmediate(), [stopImmediate])

  const fmtTime = (s) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`

  return {
    state, elapsed, formattedTime: fmtTime(elapsed),
    blob, micLevel, permError,
    audioDevices, selectedAudioId,
    requestMic, switchAudio, refreshDevices,
    startImmediate, stopImmediate,
  }
}
