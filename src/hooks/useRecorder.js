import { useState, useRef, useCallback, useEffect } from 'react'

function getBestMimeType() {
  const candidates = [
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9,opus',
    'video/webm',
    'video/mp4',
  ]
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || ''
}

export function useRecorder() {
  const [state, setState] = useState('idle') // idle | requesting | countdown | recording | done
  const [countdown, setCountdown] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const [blob, setBlob] = useState(null)
  const [micLevel, setMicLevel] = useState(0) // 0-1, for VU meter
  const [permError, setPermError] = useState('')

  const videoRef = useRef(null) // <video> element for live preview
  const streamRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const analyserRef = useRef(null)
  const animFrameRef = useRef(null)
  const audioCtxRef = useRef(null)

  // Animate mic VU meter
  const startVU = useCallback((stream) => {
    const ctx = new AudioContext()
    const src = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    src.connect(analyser)
    analyserRef.current = analyser
    audioCtxRef.current = ctx

    const data = new Uint8Array(analyser.frequencyBinCount)
    const tick = () => {
      analyser.getByteFrequencyData(data)
      const rms = Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length) / 128
      setMicLevel(Math.min(1, rms * 2))
      animFrameRef.current = requestAnimationFrame(tick)
    }
    tick()
  }, [])

  const stopVU = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    if (audioCtxRef.current) {
      audioCtxRef.current.close()
      audioCtxRef.current = null
    }
    setMicLevel(0)
  }, [])

  const stopEverything = useCallback(() => {
    clearInterval(timerRef.current)
    stopVU()
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
  }, [stopVU])

  const requestCamera = useCallback(async () => {
    setState('requesting')
    setPermError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.muted = true
        videoRef.current.play().catch(() => {})
      }
      startVU(stream)
      setState('idle')
      return stream
    } catch (err) {
      const msg = err.name === 'NotAllowedError'
        ? '攝影機 / 麥克風權限被拒絕，請在瀏覽器設定中允許。'
        : `裝置錯誤：${err.message}`
      setPermError(msg)
      setState('idle')
      throw err
    }
  }, [startVU])

  const startRecording = useCallback(async (audioEl) => {
    let stream = streamRef.current
    if (!stream) {
      try { stream = await requestCamera() } catch { return }
    }

    // 3-2-1 countdown
    setState('countdown')
    for (let i = 3; i >= 1; i--) {
      setCountdown(i)
      await new Promise((r) => setTimeout(r, 1000))
    }
    setCountdown(null)

    // Sync: start music + start recorder at the same time
    if (audioEl) {
      audioEl.currentTime = 0
      audioEl.play().catch(() => {})
    }

    chunksRef.current = []
    const mimeType = getBestMimeType()
    const mr = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 3_000_000 })
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    mr.onstop = () => {
      const type = mimeType || 'video/webm'
      const b = new Blob(chunksRef.current, { type })
      setBlob(b)
      setState('done')
    }
    mr.start(100)
    mediaRecorderRef.current = mr

    // Elapsed timer
    const start = Date.now()
    setElapsed(0)
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 500)

    setState('recording')
  }, [requestCamera])

  const stopRecording = useCallback((audioEl) => {
    if (audioEl) { audioEl.pause(); audioEl.currentTime = 0 }
    clearInterval(timerRef.current)
    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current?.stop()
    }
    stopEverything()
  }, [stopEverything])

  const reset = useCallback(() => {
    stopEverything()
    setBlob(null)
    setElapsed(0)
    setCountdown(null)
    setState('idle')
    chunksRef.current = []
  }, [stopEverything])

  // Cleanup on unmount
  useEffect(() => () => stopEverything(), [stopEverything])

  const formatTime = (s) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0')
    const sec = (s % 60).toString().padStart(2, '0')
    return `${m}:${sec}`
  }

  return {
    state,
    countdown,
    elapsed,
    formattedTime: formatTime(elapsed),
    blob,
    micLevel,
    permError,
    videoRef,
    requestCamera,
    startRecording,
    stopRecording,
    reset,
  }
}
