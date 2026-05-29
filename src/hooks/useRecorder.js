import { useState, useRef, useCallback, useEffect } from 'react'

function getBestMimeType(hasVideo) {
  if (!hasVideo) {
    const audio = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg']
    return audio.find((t) => MediaRecorder.isTypeSupported(t)) || ''
  }
  const candidates = [
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9,opus',
    'video/webm',
    'video/mp4',
  ]
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || ''
}

export function useRecorder() {
  const [state, setState]         = useState('idle')
  const [countdown, setCountdown] = useState(null)
  const [elapsed, setElapsed]     = useState(0)
  const [blob, setBlob]           = useState(null)
  const [micLevel, setMicLevel]   = useState(0)
  const [permError, setPermError] = useState('')
  const [hasVideo, setHasVideo]   = useState(false) // false = audio-only stream

  const [audioDevices, setAudioDevices] = useState([])
  const [videoDevices, setVideoDevices] = useState([])
  const [selectedAudioId, setSelectedAudioId] = useState('')
  const [selectedVideoId, setSelectedVideoId] = useState('')

  const videoRef         = useRef(null)
  const streamRef        = useRef(null)
  const mediaRecorderRef = useRef(null)
  const chunksRef        = useRef([])
  const timerRef         = useRef(null)
  const analyserRef      = useRef(null)
  const animFrameRef     = useRef(null)
  const audioCtxRef      = useRef(null)

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

  const refreshDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      setAudioDevices(all.filter((d) => d.kind === 'audioinput'))
      setVideoDevices(all.filter((d) => d.kind === 'videoinput'))
    } catch {}
  }, [])

  useEffect(() => {
    refreshDevices()
    navigator.mediaDevices.addEventListener('devicechange', refreshDevices)
    return () => navigator.mediaDevices.removeEventListener('devicechange', refreshDevices)
  }, [refreshDevices])

  const requestCamera = useCallback(async (videoId, audioId) => {
    setState('requesting')
    setPermError('')
    const vId = videoId ?? selectedVideoId
    const aId = audioId ?? selectedAudioId

    const audioConstraints = aId
      ? { deviceId: { exact: aId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      : { echoCancellation: false, noiseSuppression: false, autoGainControl: false }

    const videoConstraints = vId
      ? { deviceId: { exact: vId }, width: { ideal: 1280 }, height: { ideal: 720 } }
      : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }

    let stream = null

    // Try video + audio first; fall back to audio-only if camera is unavailable or denied.
    // This lets users with a recording interface but no camera still record audio.
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: audioConstraints,
      })
      setHasVideo(true)
    } catch {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints })
        setHasVideo(false)
      } catch (audioErr) {
        const msg = audioErr.name === 'NotAllowedError'
          ? '麥克風權限被拒絕，請在瀏覽器設定中允許存取。'
          : `裝置錯誤：${audioErr.message}`
        setPermError(msg)
        setState('idle')
        throw audioErr
      }
    }

    streamRef.current = stream

    const videoTracks = stream.getVideoTracks()
    if (videoRef.current && videoTracks.length > 0) {
      videoRef.current.srcObject = stream
      videoRef.current.muted = true
      videoRef.current.play().catch(() => {})
    }

    startVU(stream)
    setState('idle')
    await refreshDevices()
    return stream
  }, [selectedVideoId, selectedAudioId, startVU, refreshDevices])

  const switchDevice = useCallback(async (type, deviceId) => {
    const newVId = type === 'video' ? deviceId : selectedVideoId
    const newAId = type === 'audio' ? deviceId : selectedAudioId
    if (type === 'video') setSelectedVideoId(deviceId)
    if (type === 'audio') setSelectedAudioId(deviceId)
    stopEverything()
    setState('idle')
    await requestCamera(newVId, newAId).catch(() => {})
  }, [selectedVideoId, selectedAudioId, stopEverything, requestCamera])

  // Starts recording immediately — no countdown.
  // Used by the transport system which handles its own countdown.
  const startRecordingImmediate = useCallback(async () => {
    let stream = streamRef.current
    if (!stream) {
      try { stream = await requestCamera() } catch { return }
    }
    chunksRef.current = []
    const hasVid = stream.getVideoTracks().length > 0
    const mimeType = getBestMimeType(hasVid)
    const mr = new MediaRecorder(stream, {
      mimeType,
      ...(hasVid ? { videoBitsPerSecond: 3_000_000 } : {}),
    })
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    mr.onstop = () => {
      setBlob(new Blob(chunksRef.current, { type: mimeType || (hasVid ? 'video/webm' : 'audio/webm') }))
      setState('done')
    }
    mr.start(100)
    mediaRecorderRef.current = mr
    const start = Date.now()
    setElapsed(0)
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 500)
    setState('recording')
  }, [requestCamera])

  const stopRecordingImmediate = useCallback(() => {
    clearInterval(timerRef.current)
    if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop()
    stopEverything()
  }, [stopEverything])

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

    if (typeof audioElOrCb === 'function') audioElOrCb()
    else if (audioElOrCb) { audioElOrCb.currentTime = 0; audioElOrCb.play().catch(() => {}) }

    chunksRef.current = []
    const hasVid = stream.getVideoTracks().length > 0
    const mimeType = getBestMimeType(hasVid)
    const mr = new MediaRecorder(stream, {
      mimeType,
      ...(hasVid ? { videoBitsPerSecond: 3_000_000 } : {}),
    })
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    mr.onstop = () => {
      setBlob(new Blob(chunksRef.current, { type: mimeType || (hasVid ? 'video/webm' : 'audio/webm') }))
      setState('done')
    }
    mr.start(100)
    mediaRecorderRef.current = mr

    const start = Date.now()
    setElapsed(0)
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 500)
    setState('recording')
  }, [requestCamera])

  const stopRecording = useCallback((audioElOrCb) => {
    if (typeof audioElOrCb === 'function') audioElOrCb()
    else if (audioElOrCb) { audioElOrCb.pause(); audioElOrCb.currentTime = 0 }
    clearInterval(timerRef.current)
    if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop()
    stopEverything()
  }, [stopEverything])

  const reset = useCallback(() => {
    stopEverything()
    setBlob(null); setElapsed(0); setCountdown(null); setState('idle')
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
    blob, micLevel, permError, hasVideo,
    audioDevices, videoDevices,
    selectedAudioId, selectedVideoId,
    videoRef, requestCamera, switchDevice, refreshDevices,
    startRecording, stopRecording,
    startRecordingImmediate, stopRecordingImmediate,
    reset,
  }
}
