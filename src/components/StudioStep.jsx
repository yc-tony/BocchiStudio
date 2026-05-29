import { useRef, useState, useEffect, useCallback } from 'react'
import { useRecorder } from '../hooks/useRecorder'
import {
  usePluginChain,
  buildAndConnectChain,
  teardownChain,
  updateLiveParam,
} from '../hooks/usePluginChain'
import VUMeter from './VUMeter'
import FxChain from './FxChain'

export default function StudioStep({ trackInfo, onRecordingComplete, onReset }) {
  const audioRef = useRef(null)
  const [volume, setVolume]         = useState(0.8)
  const [trackLevel, setTrackLevel] = useState(0)
  const [cameraReady, setCameraReady] = useState(false)

  // ── Web Audio refs (not React state — changing them must not trigger renders) ──
  const ctxRef       = useRef(null) // AudioContext
  const srcRef       = useRef(null) // MediaElementSourceNode (one per audio element)
  const analyserRef  = useRef(null) // AnalyserNode for backing-track VU
  const bgNodeMapRef = useRef({})   // live plugin nodes keyed by plugin.id

  // Plugin chain state for each track
  const bgFx  = usePluginChain() // Backing track FX
  const micFx = usePluginChain() // Mic monitor FX (affects monitoring, not recording — see note below)

  // Keep a stable ref to bgFx.plugins so the param-update callback never captures a stale closure
  const bgPluginsRef = useRef([])
  bgPluginsRef.current = bgFx.plugins

  const {
    state, countdown, formattedTime, blob, micLevel, permError,
    videoRef, requestCamera, startRecording, stopRecording, reset,
  } = useRecorder()

  // Request camera on mount
  useEffect(() => {
    requestCamera().then(() => setCameraReady(true)).catch(() => {})
  }, []) // eslint-disable-line

  // Sync volume slider → audio element
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume])

  // ── Backing track AudioContext setup ──────────────────────────────────────────
  // Recreated every time the user loads a new track file.
  // We intentionally do NOT connect source here — the FX chain effect (below) handles that.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const ctx = new AudioContext()
    ctxRef.current = ctx

    // createMediaElementSource ties this AudioContext to this exact audio element;
    // recreating the context when trackInfo changes is the only safe way to handle a new file.
    const src = ctx.createMediaElementSource(audio)
    srcRef.current = src

    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    analyserRef.current = analyser
    analyser.connect(ctx.destination)

    // VU meter animation loop
    const data = new Uint8Array(analyser.frequencyBinCount)
    let raf
    const tick = () => {
      analyser.getByteFrequencyData(data)
      const rms = Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length) / 128
      setTrackLevel(Math.min(1, rms * 2))
      raf = requestAnimationFrame(tick)
    }
    tick()

    return () => {
      cancelAnimationFrame(raf)
      ctx.close()
      ctxRef.current  = null
      srcRef.current  = null
      analyserRef.current = null
      bgNodeMapRef.current = {}
    }
  }, [trackInfo]) // eslint-disable-line

  // ── Backing track FX chain wiring ─────────────────────────────────────────────
  // Runs whenever plugins change OR a new track is loaded (trackInfo in deps keeps
  // the chain in sync after the AudioContext is recreated above).
  useEffect(() => {
    const ctx     = ctxRef.current
    const src     = srcRef.current
    const analyser = analyserRef.current
    if (!ctx || !src || !analyser) return

    teardownChain(src, bgNodeMapRef.current)
    bgNodeMapRef.current = buildAndConnectChain(ctx, src, bgFx.plugins, analyser)
  }, [bgFx.plugins, trackInfo]) // eslint-disable-line

  // Pass recording result to parent
  useEffect(() => {
    if (state === 'done' && blob) onRecordingComplete(blob)
  }, [state, blob]) // eslint-disable-line

  const isRecording = state === 'recording'
  const isCountdown = state === 'countdown'
  const isBusy      = isRecording || isCountdown || state === 'requesting'

  const handleRec = async () => {
    if (isRecording) {
      stopRecording(audioRef.current)
    } else {
      // Browsers suspend AudioContext until a user gesture; resume here before playback
      if (ctxRef.current?.state === 'suspended') await ctxRef.current.resume()
      await startRecording(audioRef.current)
    }
  }

  // Update a backing-track plugin param: try a live AudioParam update first to
  // avoid the brief glitch of a full chain rebuild; fall back to full rebuild
  // (which is triggered automatically when bgFx.plugins state changes).
  const handleBgParamUpdate = useCallback((id, key, val) => {
    bgFx.updateParam(id, key, val)
    const plugin = bgPluginsRef.current.find((p) => p.id === id)
    if (plugin) updateLiveParam(bgNodeMapRef.current, plugin, key, val)
  }, [bgFx.updateParam]) // eslint-disable-line

  const handleResetAll = () => { reset(); onReset() }

  return (
    <div className="studio-wrap">
      {/* Hidden audio element — source for the backing track AudioContext */}
      {trackInfo?.objectUrl && (
        <audio ref={audioRef} src={trackInfo.objectUrl} preload="auto" style={{ display: 'none' }} />
      )}

      <div className="studio-top-row">

        {/* ── Track 1: Backing Track ──────────────────────────────────────── */}
        <div className="panel track-panel">
          <div className="panel-header">
            <span className="panel-title">BACKING TRACK</span>
            <span className={`badge ${trackLevel > 0.01 ? 'badge-green' : 'badge-gray'}`}>
              <span className="badge-dot" />
              {trackLevel > 0.01 ? 'PLAYING' : 'READY'}
            </span>
          </div>
          <div className="panel-body">
            <div className="track-title" title={trackInfo?.title}>{trackInfo?.title || '—'}</div>

            <div style={{ marginTop: 12 }}>
              <div className="vu-label">OUTPUT LEVEL</div>
              <VUMeter level={trackLevel} bars={20} />
            </div>

            <div className="audio-controls" style={{ marginTop: 12 }}>
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  if (audioRef.current?.paused) {
                    ctxRef.current?.resume()
                    audioRef.current.play()
                  } else {
                    audioRef.current?.pause()
                    if (audioRef.current) audioRef.current.currentTime = 0
                  }
                }}
                disabled={isRecording}
              >
                {audioRef.current?.paused === false ? '⏸ PAUSE' : '▶ PREVIEW'}
              </button>
            </div>

            <div className="vol-row">
              <span>VOL</span>
              <input
                type="range" min="0" max="1" step="0.01"
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                style={{ flex: 1 }}
              />
              <span>{Math.round(volume * 100)}%</span>
            </div>

            <FxChain
              plugins={bgFx.plugins}
              onAdd={bgFx.addPlugin}
              onRemove={bgFx.removePlugin}
              onToggle={bgFx.togglePlugin}
              onUpdateParam={handleBgParamUpdate}
            />
          </div>
        </div>

        {/* ── Track 2: Camera Track ───────────────────────────────────────── */}
        <div className="panel camera-panel">
          <div className="panel-header">
            <span className="panel-title">CAMERA TRACK</span>
            {isRecording && (
              <span className="badge badge-red">
                <span className="badge-dot" />
                REC {formattedTime}
              </span>
            )}
            {isCountdown && (
              <span className="badge badge-amber">
                <span className="badge-dot" />
                GET READY
              </span>
            )}
          </div>
          <div className="panel-body" style={{ padding: 12 }}>
            <div className="camera-wrap">
              <video ref={videoRef} className="camera-video" autoPlay playsInline muted />

              {!cameraReady && !permError && (
                <div className="camera-placeholder">
                  <div className="camera-icon">📷</div>
                  <span>正在存取攝影機…</span>
                </div>
              )}

              {permError && (
                <div className="camera-placeholder">
                  <div className="camera-icon">🚫</div>
                  <span style={{ textAlign: 'center', maxWidth: 240 }}>{permError}</span>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => requestCamera().then(() => setCameraReady(true)).catch(() => {})}
                  >
                    重試
                  </button>
                </div>
              )}

              {isRecording && (
                <div className="rec-overlay">
                  <div className="rec-badge">● REC</div>
                  <div className="rec-timer">{formattedTime}</div>
                </div>
              )}

              {isCountdown && (
                <div className="countdown-overlay">
                  <div className="countdown-number" key={countdown}>{countdown}</div>
                  <div className="countdown-label">RECORDING STARTS…</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Track 3: Mic / Recording ────────────────────────────────────── */}
        <div className="panel controls-panel">
          <div className="panel-header">
            <span className="panel-title">MIC INPUT</span>
            <span className={`badge ${micLevel > 0.02 ? 'badge-green' : 'badge-gray'}`}>
              <span className="badge-dot" />
              {micLevel > 0.02 ? 'SIGNAL' : 'SILENT'}
            </span>
          </div>
          <div className="panel-body controls-body">
            <div className="vu-section">
              <div className="vu-label">MIC LEVEL</div>
              <VUMeter level={micLevel} bars={20} />
            </div>

            <div className="rec-section">
              <button
                className={`rec-button ${isRecording ? 'recording' : ''}`}
                onClick={handleRec}
                disabled={state === 'requesting' || isCountdown}
                title={isRecording ? 'Stop Recording' : 'Start Recording'}
              >
                {isRecording ? '⏹' : '⏺'}
              </button>
              <div className="rec-status-text">
                {state === 'idle'       && 'READY TO RECORD'}
                {state === 'requesting' && 'REQUESTING…'}
                {isCountdown            && `COUNTDOWN: ${countdown}`}
                {isRecording            && `REC ● ${formattedTime}`}
                {state === 'done'       && 'COMPLETE'}
              </div>
              {isRecording && (
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => stopRecording(audioRef.current)}
                >
                  ⏹ STOP
                </button>
              )}
            </div>

            {/* Mic FX chain — currently affects headphone monitoring only.
                Full post-FX recording requires AudioWorklet-based capture (future). */}
            <FxChain
              plugins={micFx.plugins}
              onAdd={micFx.addPlugin}
              onRemove={micFx.removePlugin}
              onToggle={micFx.togglePlugin}
              onUpdateParam={micFx.updateParam}
            />
            <div className="mic-fx-note">* FX 僅影響監聽，不影響錄音原始訊號</div>
          </div>
        </div>
      </div>

      {/* ── Session toolbar ──────────────────────────────────────────────────── */}
      <div className="studio-toolbar">
        <div className="headphone-warning">
          <span>🎧</span>
          <span>請確認戴上耳機再開始錄製，避免回音</span>
        </div>
        <div className="toolbar-actions">
          <button className="btn btn-ghost btn-sm" onClick={handleResetAll} disabled={isBusy}>
            ← 更換曲目
          </button>
        </div>
      </div>
    </div>
  )
}
