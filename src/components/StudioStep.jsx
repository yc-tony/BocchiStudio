import { useRef, useState, useEffect } from 'react'
import { useRecorder } from '../hooks/useRecorder'
import VUMeter from './VUMeter'

export default function StudioStep({ trackInfo, onRecordingComplete, onReset }) {
  const audioRef = useRef(null)
  const [volume, setVolume] = useState(0.8)
  const [trackLevel, setTrackLevel] = useState(0) // VU for backing track
  const [cameraReady, setCameraReady] = useState(false)

  const {
    state, countdown, formattedTime, blob, micLevel, permError,
    videoRef, requestCamera, startRecording, stopRecording, reset,
  } = useRecorder()

  // Auto-request camera on mount
  useEffect(() => {
    requestCamera().then(() => setCameraReady(true)).catch(() => {})
  }, []) // eslint-disable-line

  // Sync audio element volume
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume])

  // Animate track VU meter using AudioContext
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !trackInfo?.objectUrl) return

    let ctx, src, analyser, raf
    const setup = () => {
      ctx = new AudioContext()
      src = ctx.createMediaElementSource(audio)
      analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      src.connect(analyser)
      analyser.connect(ctx.destination) // must reconnect to get audio out
      const data = new Uint8Array(analyser.frequencyBinCount)
      const tick = () => {
        analyser.getByteFrequencyData(data)
        const rms = Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length) / 128
        setTrackLevel(Math.min(1, rms * 2))
        raf = requestAnimationFrame(tick)
      }
      tick()
    }
    const handlePlay = () => {
      if (!ctx) setup()
      else ctx.resume()
    }
    audio.addEventListener('play', handlePlay)
    return () => {
      audio.removeEventListener('play', handlePlay)
      if (raf) cancelAnimationFrame(raf)
      if (ctx) ctx.close()
    }
  }, [trackInfo])

  // When recording finishes, pass blob up
  useEffect(() => {
    if (state === 'done' && blob) {
      onRecordingComplete(blob)
    }
  }, [state, blob]) // eslint-disable-line

  const isRecording = state === 'recording'
  const isCountdown = state === 'countdown'
  const isBusy = isRecording || isCountdown || state === 'requesting'

  const handleRec = async () => {
    if (isRecording) {
      stopRecording(audioRef.current)
    } else {
      await startRecording(audioRef.current)
    }
  }

  const handleResetAll = () => {
    reset()
    onReset()
  }

  return (
    <div className="studio-wrap">
      {/* Hidden audio element for backing track */}
      {trackInfo?.objectUrl && (
        <audio
          ref={audioRef}
          src={trackInfo.objectUrl}
          preload="auto"
          style={{ display: 'none' }}
        />
      )}

      <div className="studio-top-row">
        {/* ── Track panel ────────────────────────────── */}
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
                  if (audioRef.current?.paused) audioRef.current.play()
                  else { audioRef.current?.pause(); audioRef.current && (audioRef.current.currentTime = 0) }
                }}
                disabled={isRecording}
                title="Preview track"
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
          </div>
        </div>

        {/* ── Camera panel ───────────────────────────── */}
        <div className="panel camera-panel">
          <div className="panel-header">
            <span className="panel-title">CAMERA PREVIEW</span>
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
              <video
                ref={videoRef}
                className="camera-video"
                autoPlay
                playsInline
                muted
              />

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
                  <button className="btn btn-sm btn-ghost" onClick={() => requestCamera().then(() => setCameraReady(true)).catch(() => {})}>
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

        {/* ── Controls panel ─────────────────────────── */}
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
                {state === 'idle' && 'READY TO RECORD'}
                {state === 'requesting' && 'REQUESTING…'}
                {isCountdown && `COUNTDOWN: ${countdown}`}
                {isRecording && `REC ● ${formattedTime}`}
                {state === 'done' && 'COMPLETE'}
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
          </div>
        </div>
      </div>

      {/* ── Toolbar ──────────────────────────────────── */}
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
