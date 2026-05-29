import { useState, useRef, useCallback, useEffect } from 'react'

function bestVideoMime() {
  const c = ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm', 'video/mp4']
  return c.find((t) => MediaRecorder.isTypeSupported(t)) || ''
}

// Handles video-only capture (no audio — audio is recorded separately by useMicRecorder).
// Compatible with Apple Continuity Camera (iPhone appears as a standard videoinput device
// on macOS Ventura+ when in the same Wi-Fi/Bluetooth range as the Mac).
export function useCameraRecorder() {
  const [state, setState]       = useState('idle') // idle | requesting | recording | done
  const [elapsed, setElapsed]   = useState(0)
  const [blob, setBlob]         = useState(null)
  const [permError, setPermError] = useState('')
  const [videoDevices, setVideoDevices] = useState([])
  const [selectedVideoId, setSelectedVideoId] = useState('')

  const videoRef  = useRef(null)
  const streamRef = useRef(null)
  const mrRef     = useRef(null)
  const chunksRef = useRef([])
  const timerRef  = useRef(null)

  const refreshDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      setVideoDevices(all.filter((d) => d.kind === 'videoinput'))
    } catch {}
  }, [])

  useEffect(() => {
    refreshDevices()
    navigator.mediaDevices.addEventListener('devicechange', refreshDevices)
    return () => navigator.mediaDevices.removeEventListener('devicechange', refreshDevices)
  }, [refreshDevices])

  const requestCamera = useCallback(async (videoId) => {
    setState('requesting')
    setPermError('')
    const vId = videoId ?? selectedVideoId
    try {
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop())
      const stream = await navigator.mediaDevices.getUserMedia({
        video: vId
          ? { deviceId: { exact: vId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false, // mic handled separately by RecordingTrack
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.muted = true
        videoRef.current.play().catch(() => {})
      }
      setState('idle')
      await refreshDevices()
      return stream
    } catch (err) {
      const msg = err.name === 'NotAllowedError'
        ? '攝影機權限被拒絕，請在瀏覽器設定中允許。'
        : `裝置錯誤：${err.message}`
      setPermError(msg)
      setState('idle')
      throw err
    }
  }, [selectedVideoId, refreshDevices])

  const switchCamera = useCallback(async (deviceId) => {
    setSelectedVideoId(deviceId)
    await requestCamera(deviceId).catch(() => {})
  }, [requestCamera])

  const startImmediate = useCallback(async () => {
    let stream = streamRef.current
    if (!stream) { try { stream = await requestCamera() } catch { return } }
    chunksRef.current = []
    const mimeType = bestVideoMime()
    const mr = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 3_000_000 })
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    mr.onstop = () => { setBlob(new Blob(chunksRef.current, { type: mimeType || 'video/webm' })); setState('done') }
    mr.start(100)
    mrRef.current = mr
    const start = Date.now()
    setElapsed(0)
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 500)
    setState('recording')
  }, [requestCamera])

  const stopImmediate = useCallback(() => {
    clearInterval(timerRef.current)
    if (mrRef.current?.state !== 'inactive') mrRef.current?.stop()
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null }
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  useEffect(() => () => stopImmediate(), [stopImmediate])

  const fmtTime = (s) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`

  return {
    state, elapsed, formattedTime: fmtTime(elapsed),
    blob, permError,
    videoDevices, selectedVideoId,
    videoRef, requestCamera, switchCamera, refreshDevices,
    startImmediate, stopImmediate,
  }
}
