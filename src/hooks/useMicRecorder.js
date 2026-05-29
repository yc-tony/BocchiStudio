import { useState, useRef, useCallback, useEffect } from 'react'

function bestAudioMime() {
  const c = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg']
  return c.find((t) => MediaRecorder.isTypeSupported(t)) || ''
}

// Handles audio-only recording (mic / audio interface input).
//
// Continuous monitoring model: once the mic is granted, the input stream and VU
// meter stay live for the lifetime of the track — the meter reacts to signal at
// all times, not only while recording. Pressing record simply starts buffering
// the already-flowing signal via MediaRecorder; stopping leaves monitoring running.
// The stream/VU are only torn down when the track unmounts.
//
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
  const [monitoring, setMonitoring] = useState(false) // live input playback

  const streamRef          = useRef(null)
  const mrRef              = useRef(null)
  const chunksRef          = useRef([])
  const timerRef           = useRef(null)
  const audioCtxRef        = useRef(null)   // VU meter AudioContext
  const rafRef             = useRef(null)
  const routingCtxRef      = useRef(null)   // per-recording channel routing context
  const monitorGainRef     = useRef(null)   // output gain for live monitoring
  const selChRef           = useRef(-1)     // mirror of selectedChannel for callbacks
  const detChRef           = useRef(1)      // mirror of detectedChannels for callbacks
  const monitorRef         = useRef(false)  // mirror of monitoring for startVU

  selChRef.current = selectedChannel
  detChRef.current = detectedChannels
  monitorRef.current = monitoring

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

    // Chrome starts AudioContext in "suspended" when created outside a direct
    // user-gesture. Two defenses:
    // 1. Try resume() immediately (works if a prior gesture exists in this tab).
    // 2. Resume on the next DOM interaction as a fallback.
    ctx.resume().catch(() => {})
    const resumeOnGesture = () => {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    }
    document.addEventListener('click',      resumeOnGesture, { once: true })
    document.addEventListener('keydown',    resumeOnGesture, { once: true })
    document.addEventListener('touchstart', resumeOnGesture, { once: true, passive: true })

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
    analyser.fftSize = 1024
    analyserIn.connect(analyser)

    // Output gain → destination. Doubles as the live-monitoring volume:
    // 0 = silent (meter still works), 1 = hear the input in real time.
    // A path to destination also keeps the graph alive in some browsers.
    const monitorGain = ctx.createGain()
    monitorGain.gain.value = monitorRef.current ? 1 : 0
    monitorGainRef.current = monitorGain
    analyserIn.connect(monitorGain)
    monitorGain.connect(ctx.destination)

    // Peak detection via time-domain waveform — correct and responsive for
    // instrument signals (guitar, bass) where energy is frequency-specific.
    // data[i] ∈ [0, 255], center = 128. |data[i] - 128| = amplitude sample.
    const data = new Uint8Array(analyser.fftSize)
    const tick = () => {
      if (audioCtxRef.current !== ctx) return  // context was replaced, stop loop
      analyser.getByteTimeDomainData(data)
      let peak = 0
      for (let i = 0; i < data.length; i++) {
        const v = Math.abs(data[i] - 128)
        if (v > peak) peak = v
      }
      // peak ÷ 128 = normalised amplitude 0..1
      // ×1.8 so a typical instrument at –14 dBFS shows ~50% on the meter
      setMicLevel(Math.min(1, (peak / 128) * 1.8))
      rafRef.current = requestAnimationFrame(tick)
    }
    tick()
  }, [])

  const stopVU = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null }
    monitorGainRef.current = null
    setMicLevel(0)
  }, [])

  // Toggle live input monitoring — hear the incoming signal through the output.
  // Ramps the gain to avoid clicks. Survives device/channel switches via monitorRef.
  const toggleMonitoring = useCallback(() => {
    const next = !monitorRef.current
    monitorRef.current = next
    setMonitoring(next)
    const ctx = audioCtxRef.current
    const g   = monitorGainRef.current
    if (ctx && g) {
      ctx.resume().catch(() => {})
      g.gain.setTargetAtTime(next ? 1 : 0, ctx.currentTime, 0.015)
    }
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

    // Re-acquire mic if stream is gone or its tracks have ended.
    // This also happens to be a user-gesture call site (record button),
    // so getUserMedia / AudioContext.resume() will be permitted.
    const isLive = stream?.getAudioTracks().some(t => t.readyState === 'live')
    if (!stream || !isLive) {
      try { stream = await requestMic() } catch { return }
    }

    // Resume the VU AudioContext here — the record-button click IS a user
    // gesture, so resume() will succeed even if it was blocked on mount.
    // A suspended context with a MediaStreamSource can prevent MediaRecorder
    // from starting on Chrome (NotSupportedError).
    if (audioCtxRef.current?.state !== 'running') {
      await audioCtxRef.current?.resume().catch(() => {})
    }

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
        // Must resume — recording through a suspended AudioContext produces silence
        await rCtx.resume()
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

    // Don't pass { mimeType: '' } — Chrome rejects start() with empty string.
    const mrOpts = mimeType ? { mimeType } : {}
    const mr = new MediaRecorder(recordingStream, mrOpts)

    const onData = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    const onStop = () => {
      setBlob(new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' }))
      if (routingCtxRef.current) { routingCtxRef.current.close(); routingCtxRef.current = null }
      setState('done')
    }
    mr.ondataavailable = onData
    mr.onstop = onStop

    try {
      mr.start(100)
    } catch (e) {
      // Last-resort: re-request mic and record from a brand-new raw stream.
      // This handles cases where the existing stream was invalidated or the
      // codec negotiation failed.
      console.warn('MediaRecorder.start() failed, re-acquiring mic:', e.message)
      let freshStream
      try { freshStream = await requestMic() } catch { return }
      const mr2 = new MediaRecorder(freshStream)
      mr2.ondataavailable = onData
      mr2.onstop = onStop
      mr2.start(100)
      mrRef.current = mr2
      const t0 = Date.now()
      setElapsed(0)
      timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 500)
      setState('recording')
      return
    }

    mrRef.current = mr
    const start = Date.now()
    setElapsed(0)
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 500)
    setState('recording')
  }, [requestMic])

  // Stop recording only — monitoring stream + VU stay alive so the meter
  // keeps reacting to input after the take ends.
  const stopImmediate = useCallback(() => {
    clearInterval(timerRef.current)
    if (mrRef.current?.state !== 'inactive') mrRef.current?.stop()
    // stream + VU intentionally left running for continuous monitoring
  }, [])

  // Full teardown — release the mic, stop the VU, drop any routing context.
  // Only on track unmount.
  const teardown = useCallback(() => {
    clearInterval(timerRef.current)
    if (mrRef.current?.state !== 'inactive') mrRef.current?.stop()
    stopVU()
    if (routingCtxRef.current) { routingCtxRef.current.close(); routingCtxRef.current = null }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null }
  }, [stopVU])

  useEffect(() => () => teardown(), [teardown])

  const fmtTime = (s) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`

  return {
    state, elapsed, formattedTime: fmtTime(elapsed),
    blob, micLevel, permError,
    audioDevices, selectedAudioId,
    detectedChannels, selectedChannel,
    monitoring, toggleMonitoring,
    requestMic, switchAudio, switchChannel, refreshDevices,
    startImmediate, stopImmediate,
  }
}
