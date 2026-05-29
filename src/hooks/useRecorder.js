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
  const [state, setState]       = useState('idle') // idle | requesting | countdown | recording | done
  const [countdown, setCountdown] = useState(null)
  const [elapsed, setElapsed]   = useState(0)
  const [blob, setBlob]         = useState(null)
  const [micLevel, setMicLevel] = useState(0)
  const [permError, setPermError] = useState('')

  // Available devices — populated after first permission grant
  const [audioDevices, setAudioDevices] = useState([])
  const [videoDevices, setVideoDevices] = useState([])
  const [selectedAudioId, setSelectedAudioId] = useState('')
  const [selectedVideoId, setSelectedVideoId] = useState('')

  const videoRef          = useRef(null) // <video> element for live preview
  const streamRef         = useRef(null)
  const mediaRecorderRef  = useRef(null)
  const chunksRef         = useRef([])
  const timerRef          = useRef(null)
  const analyserRef       = useRef(null)
  const animFrameRef      = useRef(null)
  const audioCtxRef       = useRef(null)

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
    if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null }
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

  // Enumerate devices after permission is granted (labels only available post-grant)
  const refreshDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      setAudioDevices(devices.filter((d) => d.kind === 'audioinput'))
      setVideoDevices(devices.filter((d) => d.kind === 'videoinput'))
    } catch {}
  }, [])

  const requestCamera = useCallback(async (videoId, audioId) => {
    setState('requesting')
    setPermError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: (videoId || selectedVideoId)
          ? { deviceId: { exact: videoId || selectedVideoId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: (audioId || selectedAudioId)
          ? { deviceId: { exact: audioId || selectedAudioId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
          : { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.muted = true
        videoRef.current.play().catch(() => {})
      }
      startVU(stream)
      setState('idle')
      await refreshDevices()
      return stream
    } catch (err) {
      const msg = err.name === 'NotAllowedError'
        ? '攝影機 / 麥克風權限被拒絕，請在瀏覽器設定中允許。'
        : `裝置錯誤：${err.message}`
      setPermError(msg)
      setState('idle')
      throw err
    }
  }, [selectedVideoId, selectedAudioId, startVU, refreshDevices])

  // Re-request with new device selection
  const switchDevice = useCallback(async (type, deviceId) => {
    if (type === 'audio') setSelectedAudioId(deviceId)
    if (type === 'video') setSelectedVideoId(deviceId)
    stopEverything()
    const vId = type === 'video' ? deviceId : selectedVideoId
    const aId = type === 'audio' ? deviceId : selectedAudioId
    await requestCamera(vId, aId).catch(() => {})
  }, [selectedVideoId, selectedAudioId, stopEverything, requestCamera])

  // startRecording accepts either an HTMLAudioElement (legacy) or a callback invoked
  // at the exact moment recording begins (after countdown). DAWPage uses the callback
  // to coordinate playback of all audio tracks.
  const startRecording = useCallback(async (audioElOrCb) => {
    let stream = streamRef.current
    if (!stream) {
      try { stream = await requestCamera() } catch { return }
    }

    setState('countdown')
    for (let i = 3; i >= 1; i--) {
      setCountdown(i)
      await new Promise((r) => setTimeout(r, 1000))
    }
    setCountdown(null)

    // Sync trigger
    if (typeof audioElOrCb === 'function') {
      audioElOrCb()
    } else if (audioElOrCb) {
      audioElOrCb.currentTime = 0
      audioElOrCb.play().catch(() => {})
    }

    chunksRef.current = []
    const mimeType = getBestMimeType()
    const mr = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 3_000_000 })
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    mr.onstop = () => {
      const b = new Blob(chunksRef.current, { type: mimeType || 'video/webm' })
      setBlob(b)
      setState('done')
    }
    mr.start(100)
    mediaRecorderRef.current = mr

    const start = Date.now()
    setElapsed(0)
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 500)
    setState('recording')
  }, [requestCamera])

  // stopRecording accepts either an HTMLAudioElement (legacy) or a callback
  const stopRecording = useCallback((audioElOrCb) => {
    if (typeof audioElOrCb === 'function') {
      audioElOrCb()
    } else if (audioElOrCb) {
      audioElOrCb.pause()
      audioElOrCb.currentTime = 0
    }
    clearInterval(timerRef.current)
    if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop()
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

  useEffect(() => () => stopEverything(), [stopEverything])

  const formatTime = (s) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0')
    const sec = (s % 60).toString().padStart(2, '0')
    return `${m}:${sec}`
  }

  return {
    state, countdown, elapsed,
    formattedTime: formatTime(elapsed),
    blob, micLevel, permError,
    audioDevices, videoDevices,
    selectedAudioId, selectedVideoId,
    videoRef, requestCamera, switchDevice,
    startRecording, stopRecording, reset,
  }
}
