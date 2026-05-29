import { useState, useEffect } from 'react'
import { useRecorder } from '../../hooks/useRecorder'
import { usePluginChain } from '../../hooks/usePluginChain'
import VUMeter from '../VUMeter'
import FxChain from '../FxChain'

export default function RecordingTrack({ track, onUpdate, onRemove, onRecordStart, onRecordStop }) {
  const [fxOpen, setFxOpen]           = useState(false)
  const [camExpanded, setCamExpanded] = useState(true)

  const {
    state, countdown, formattedTime, blob, micLevel, permError,
    audioDevices, videoDevices, selectedAudioId, selectedVideoId,
    videoRef, requestCamera, switchDevice, refreshDevices,
    startRecording, stopRecording,
  } = useRecorder()

  const micFx = usePluginChain()

  const isRecording = state === 'recording'
  const isCountdown = state === 'countdown'
  const isBusy      = isRecording || isCountdown || state === 'requesting'

  useEffect(() => {
    requestCamera().catch(() => {})
  }, []) // eslint-disable-line

  useEffect(() => {
    if (state === 'done' && blob) onUpdate(track.id, { recordedBlob: blob })
  }, [state, blob]) // eslint-disable-line

  const handleRec = async () => {
    if (isRecording) stopRecording(onRecordStop)
    else await startRecording(onRecordStart)
  }

  return (
    <div className="track-lane track-lane--rec">
      <div className="track-lane-head">

        <div className="track-label">
          <span className="track-type-dot track-type-dot--rec" />
          <span className="track-name">{track.name}</span>
        </div>

        <div className="track-content track-content--col">
          {/* ── Device pickers — always visible ───────────── */}
          <div className="device-row">
            <div className="device-picker">
              <span className="device-picker-label">MIC</span>
              <select
                className="device-select"
                value={selectedAudioId}
                onChange={(e) => switchDevice('audio', e.target.value)}
                disabled={isBusy}
              >
                <option value="">Default</option>
                {audioDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Input ${d.deviceId.slice(0, 8)}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="device-picker">
              <span className="device-picker-label">CAM</span>
              <select
                className="device-select"
                value={selectedVideoId}
                onChange={(e) => switchDevice('video', e.target.value)}
                disabled={isBusy}
              >
                <option value="">Default</option>
                {videoDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Camera ${d.deviceId.slice(0, 8)}`}
                  </option>
                ))}
              </select>
            </div>

            {/* Refresh button — re-enumerates and populates labels after first permission grant */}
            <button
              className="btn btn-sm btn-ghost device-refresh-btn"
              onClick={() => {
                refreshDevices()
                if (!streamRef) requestCamera().catch(() => {})
              }}
              disabled={isBusy}
              title="Refresh device list"
            >
              ↺
            </button>
          </div>

          {/* ── Status row ─────────────────────────────────── */}
          <div className="rec-status-row">
            <VUMeter level={micLevel} bars={16} />
            <div className="rec-inline-status">
              {state === 'idle'       && <span className="status-chip status-idle">Ready</span>}
              {state === 'requesting' && <span className="status-chip status-loading">Init…</span>}
              {isCountdown            && <span className="status-chip status-countdown">{countdown}</span>}
              {isRecording            && <span className="status-chip status-rec">● {formattedTime}</span>}
              {state === 'done'       && <span className="status-chip status-done">✓ Done</span>}
            </div>
            {permError && (
              <span className="track-error" title={permError}>⚠ 權限錯誤</span>
            )}
          </div>
        </div>

        <div className="track-end-btns">
          <button
            className={`rec-btn-sm ${isRecording ? 'rec-btn-sm--on' : ''}`}
            onClick={handleRec}
            disabled={state === 'requesting' || isCountdown}
            title={isRecording ? 'Stop' : 'Record'}
          >
            {isRecording ? '⏹' : '⏺'}
          </button>
          <button
            className={`btn btn-sm btn-ghost ${camExpanded ? 'btn-ghost--active' : ''}`}
            onClick={() => setCamExpanded((o) => !o)}
            title="Camera preview"
          >
            📷
          </button>
          <button
            className={`btn btn-sm btn-ghost ${fxOpen ? 'btn-ghost--active' : ''}`}
            onClick={() => setFxOpen((o) => !o)}
          >
            FX
          </button>
          <button className="track-remove-btn" onClick={() => onRemove(track.id)}>✕</button>
        </div>
      </div>

      {/* ── Camera preview ──────────────────────────────────── */}
      {camExpanded && (
        <div className="track-camera-wrap">
          <video ref={videoRef} className="track-camera-video" autoPlay playsInline muted />

          {permError && (
            <div className="track-camera-overlay">
              <div style={{ fontSize: '1.5rem' }}>📵</div>
              <div style={{ fontSize: '0.78rem', textAlign: 'center', maxWidth: 240 }}>{permError}</div>
              <button className="btn btn-sm btn-ghost" onClick={() => requestCamera().catch(() => {})}>
                再試一次
              </button>
            </div>
          )}

          {isCountdown && (
            <div className="track-camera-overlay">
              <div className="cam-countdown-num" key={countdown}>{countdown}</div>
              <div className="cam-countdown-label">Recording starts…</div>
            </div>
          )}

          {isRecording && (
            <div className="cam-rec-badge">● REC {formattedTime}</div>
          )}
        </div>
      )}

      {/* ── Mic FX (monitor only) ──────────────────────────── */}
      {fxOpen && (
        <div className="track-fx-panel">
          <FxChain
            plugins={micFx.plugins}
            onAdd={micFx.addPlugin}
            onRemove={micFx.removePlugin}
            onToggle={micFx.togglePlugin}
            onUpdateParam={micFx.updateParam}
          />
          <div className="mic-fx-note">FX 僅影響監聽，錄音保留原始訊號</div>
        </div>
      )}
    </div>
  )
}
