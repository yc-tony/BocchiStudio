import { useState, useRef, useCallback, useEffect } from 'react'

function bestAudioMime() {
  const c = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg']
  return c.find((t) => MediaRecorder.isTypeSupported(t)) || ''
}

// Handles audio-only recording (mic / audio interface input).
// Supports multi-channel interfaces: detects available channels and routes
// the selected channel through Web Audio API before recording.
export function useMicRecorder() {
  const [state, setState]           = useState('idle') // idle | requesting | recording | done
  const [elapsed, setElapsed]       = useState(0)
  const [blob, setBlob]             = useState(null)
  const [micLevel, setMicLevel]     = useState(0)
  const [permError, setPermError]   = useState('')
  const [audioDevices, setAudioDevices]   = useState([])
  const [selectedAudioId, setSelectedAudioId] = useState('')
  const [detectedChannels, setDetectedChannels] = useState(1)
  const [selectedChannel, setSelectedChannel]   = useState(-1) // -1 = all / stereo

  const streamRef          = useRef(null)
  const mrRef              = useRef(null)
  const chunksRef          = useRef([])
  const timerRef           = useRef(null)
  const audioCtxRef        = useRef(null)   // VU meter AudioContext
  const rafRef             = useRef(null)
  const routingCtxRef      = useRef(null)   // per-recording channel routing context
  const selChRef           = useRef(-1)     // mirror of selectedChannel for callbacks
  const detChRef           = useRef(1)      // mirror of detectedChannels for callbacks

  selChRef.current = selectedChannel
  detChRef.current = detectedChannels

  // ── Device list ─────────────────────────────────────────────────
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

  // ── VU meter — routes through ChannelSplitter when ch >= 0 ─────
  const startVU = useCallback((stream, ch = -1) => {
    if (audioCtxRef.current) audioCtxRef.current.close()
    const ctx = new AudioContext()
    audioCtxRef.current = ctx
    const src = ctx.createMediaStreamSource(stream)

    let analyserIn = src
    if (ch >= 0) {
      const actualCh = stream.getAudioTracks()[0]?.getSettings().channelCount || 1
      if (actualCh > 1 && ch < actualCh) {
        const splitter = ctx.createChannelSplitter(actualCh)
        const merger   = ctx.createChannelMerger(1)
        src.connect(splitter)
        splitter.connect(merger, ch, 0)
        analyserIn = merger
      }
    }

    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    analyserIn.connect(analyser)

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

  // ── Request mic permission + detect channels ────────────────────
  const requestMic = useCallback(async (audioId) => {
    setState('requesting')
    setPermError('')
    const aId = audioId ?? selectedAudioId
    try {
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop())

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(aId ? { deviceId: { exact: aId } } : {}),
          channelCount: { ideal: 32, min: 1 }, // request as many channels as the device has
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      })
      streamRef.current = stream

      // Detect max available channels
      const audioTrack = stream.getAudioTracks()[0]
      const caps     = audioTrack.getCapabilities?.()
      const settings = audioTrack.getSettings?.()
      // Prefer capabilities max (device capability) over settings (current stream)
      const maxCh = Math.max(
        caps?.channelCount?.max ?? 1,
        settings?.channelCount ?? 1,
      )
      setDetectedChannels(maxCh)
      detChRef.current = maxCh

      // Reset channel if selection is out of range for new device
      if (selChRef.current >= maxCh) {
        setSelectedChannel(-1)
        selChRef.current = -1
      }

      stopVU()
      startVU(stream, selChRef.current)
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

  // Switching channel restarts the VU meter on the new channel
  const switchChannel = useCallback((ch) => {
    const n = Number(ch)
    setSelectedChannel(n)
    selChRef.current = n
    if (streamRef.current) {
      stopVU()
      startVU(streamRef.current, n)
    }
  }, [startVU, stopVU])

  // ── Recording ───────────────────────────────────────────────────
  const startImmediate = useCallback(async () => {
    let stream = streamRef.current
    if (!stream) { try { stream = await requestMic() } catch { return } }

    chunksRef.current = []
    const mimeType = bestAudioMime()

    // Route specific channel if selected
    let recordingStream = stream
    const ch     = selChRef.current
    const totalCh = detChRef.current

    if (ch >= 0 && totalCh > 1) {
      try {
        if (routingCtxRef.current) { routingCtxRef.current.close(); routingCtxRef.current = null }
        const rCtx     = new AudioContext()
        routingCtxRef.current = rCtx
        const actualCh = stream.getAudioTracks()[0]?.getSettings().channelCount || totalCh
        const safeCh   = Math.max(2, Math.min(32, actualCh))
        const src      = rCtx.createMediaStreamSource(stream)
        const splitter = rCtx.createChannelSplitter(safeCh)
        const merger   = rCtx.createChannelMerger(1)
        const dest     = rCtx.createMediaStreamDestination()
        src.connect(splitter)
        splitter.connect(merger, Math.min(ch, actualCh - 1), 0)
        merger.connect(dest)
        recordingStream = dest.stream
      } catch (e) {
        // Routing failed — fall back to full stream
        if (routingCtxRef.current) { routingCtxRef.current.close(); routingCtxRef.current = null }
        recordingStream = stream
      }
    }

    const mr = new MediaRecorder(recordingStream, { mimeType })
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    mr.onstop = () => {
      setBlob(new Blob(chunksRef.current, { type: mimeType || 'audio/webm' }))
      if (routingCtxRef.current) { routingCtxRef.current.close(); routingCtxRef.current = null }
      setState('done')
    }
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

  const fmtTime = (s) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`

  return {
    state, elapsed, formattedTime: fmtTime(elapsed),
    blob, micLevel, permError,
    audioDevices, selectedAudioId,
    detectedChannels, selectedChannel,
    requestMic, switchAudio, switchChannel, refreshDevices,
    startImmediate, stopImmediate,
  }
}
