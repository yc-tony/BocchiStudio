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
    videoRef, requestCamera, switchDevice, startRecording, stopRecording, reset,
  } = useRecorder()

  const micFx = usePluginChain()

  const isRecording = state === 'recording'
  const isCountdown = state === 'countdown'
  const isBusy      = isRecording || isCountdown || state === 'requesting'

  // Request camera+mic on mount
  useEffect(() => {
    requestCamera().catch(() => {})
  }, []) // eslint-disable-line

  // Bubble recorded blob to parent when done
  useEffect(() => {
    if (state === 'done' && blob) onUpdate(track.id, { recordedBlob: blob })
  }, [state, blob]) // eslint-disable-line

  const handleRec = async () => {
    if (isRecording) {
      stopRecording(onRecordStop)
    } else {
      await startRecording(onRecordStart)
    }
  }

  return (
    <div className="track-lane track-lane--recording">
      <div className="track-lane-head">
        <div className="track-label">
          <span className="track-type-icon">🎙</span>
          <span className="track-name">{track.name}</span>
        </div>

        <div className="track-content">
          <VUMeter level={micLevel} bars={14} />

          <div className="rec-inline-status">
            {state === 'idle'       && <span className="status-chip status-idle">READY</span>}
            {state === 'requesting' && <span className="status-chip status-loading">INIT…</span>}
            {isCountdown            && <span className="status-chip status-countdown">{countdown}</span>}
            {isRecording            && <span className="status-chip status-rec">● {formattedTime}</span>}
            {state === 'done'       && <span className="status-chip status-done">✓ DONE</span>}
          </div>

          {permError && <span className="track-error" title={permError}>⚠ 權限</span>}

          {/* Device selectors */}
          {audioDevices.length > 0 && (
            <select
              className="device-select"
              value={selectedAudioId}
              onChange={(e) => switchDevice('audio', e.target.value)}
              disabled={isBusy}
              title="Microphone"
            >
              {audioDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  🎙 {d.label || `Mic ${d.deviceId.slice(0, 6)}`}
                </option>
              ))}
            </select>
          )}
          {videoDevices.length > 0 && (
            <select
              className="device-select"
              value={selectedVideoId}
              onChange={(e) => switchDevice('video', e.target.value)}
              disabled={isBusy}
              title="Camera"
            >
              {videoDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  📷 {d.label || `Camera ${d.deviceId.slice(0, 6)}`}
                </option>
              ))}
            </select>
          )}
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
            FX {fxOpen ? '▲' : '▼'}
          </button>
          <button className="track-remove-btn" onClick={() => onRemove(track.id)} title="Remove Track">✕</button>
        </div>
      </div>

      {/* Camera preview — collapsible */}
      {camExpanded && (
        <div className="track-camera-wrap">
          <video ref={videoRef} className="track-camera-video" autoPlay playsInline muted />

          {permError && (
            <div className="track-camera-overlay track-camera-overlay--error">
              <div>🚫</div>
              <div style={{ fontSize: '0.75rem', textAlign: 'center', maxWidth: 220 }}>{permError}</div>
              <button className="btn btn-sm btn-ghost" onClick={() => requestCamera().catch(() => {})}>重試</button>
            </div>
          )}

          {isCountdown && (
            <div className="track-camera-overlay track-camera-overlay--countdown">
              <div className="cam-countdown-num" key={countdown}>{countdown}</div>
              <div className="cam-countdown-label">RECORDING STARTS…</div>
            </div>
          )}

          {isRecording && (
            <div className="cam-rec-badge">● REC {formattedTime}</div>
          )}
        </div>
      )}

      {/* Mic FX chain (monitor only) */}
      {fxOpen && (
        <div className="track-fx-panel">
          <FxChain
            plugins={micFx.plugins}
            onAdd={micFx.addPlugin}
            onRemove={micFx.removePlugin}
            onToggle={micFx.togglePlugin}
            onUpdateParam={micFx.updateParam}
          />
          <div className="mic-fx-note">* FX 僅影響監聽，錄音為原始訊號</div>
        </div>
      )}
    </div>
  )
}
