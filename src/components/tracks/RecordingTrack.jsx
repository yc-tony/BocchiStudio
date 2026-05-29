import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import { useRecorder } from '../../hooks/useRecorder'
import { usePluginChain } from '../../hooks/usePluginChain'
import VUMeter from '../VUMeter'
import FxChain from '../FxChain'
import TrackTimeline from '../TrackTimeline'

const RecordingTrack = forwardRef(function RecordingTrack(
  { track, onUpdate, onRemove, onDurationChange, position, tState, onSeek },
  ref,
) {
  const [fxOpen, setFxOpen]           = useState(false)
  const [camExpanded, setCamExpanded] = useState(true)
  const [muted, setMuted]             = useState(false) // muted = skip this track in recording
  const mutedRef = useRef(false)

  const {
    state, elapsed, formattedTime, blob, micLevel, permError, hasVideo,
    audioDevices, videoDevices, selectedAudioId, selectedVideoId,
    videoRef, requestCamera, switchDevice, refreshDevices,
    startRecordingImmediate, stopRecordingImmediate, stopRecording,
  } = useRecorder()

  const micFx = usePluginChain()
  const isRecording = state === 'recording'
  const isCountdown = tState === 'countdown' // countdown lives in DAWPage now
  const isBusy      = isRecording || state === 'requesting'

  // ── Transport interface ───────────────────────────────────────
  useImperativeHandle(ref, () => ({
    getType: () => 'recording',
    transportPlay()    { /* recording tracks don't play back during a normal play */ },
    transportStop()    { if (state === 'recording') stopRecordingImmediate() },
    transportSeek()    { /* recording tracks have no seekable content yet */ },
    transportStartRecord() { if (!mutedRef.current) startRecordingImmediate() },
    transportStopRecord()  { stopRecordingImmediate() },
    getDuration()      { return elapsed },
  }), [state, elapsed, startRecordingImmediate, stopRecordingImmediate])

  useEffect(() => {
    requestCamera().catch(() => {})
  }, []) // eslint-disable-line

  useEffect(() => {
    if (state === 'done' && blob) {
      onUpdate(track.id, { recordedBlob: blob })
    }
  }, [state, blob]) // eslint-disable-line

  const toggleMute = () => {
    const next = !mutedRef.current
    mutedRef.current = next
    setMuted(next)
  }

  return (
    <div className={`track-lane track-lane--rec ${muted ? 'track-lane--muted' : ''}`}>
      <div className="track-lane-head">
        <div className="track-label">
          <span className="track-type-dot track-type-dot--rec" />
          <span className="track-name">{track.name}</span>
        </div>

        <div className="track-content track-content--col">
          {/* Device selectors */}
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
            <button
              className="btn btn-sm btn-ghost device-refresh-btn"
              onClick={() => { refreshDevices(); requestCamera().catch(() => {}) }}
              disabled={isBusy}
              title="Refresh devices"
            >
              ↺
            </button>
          </div>

          {/* Status */}
          <div className="rec-status-row">
            <VUMeter level={muted ? 0 : micLevel} bars={16} />
            <div className="rec-inline-status">
              {state === 'idle'       && <span className="status-chip status-idle">Ready</span>}
              {state === 'requesting' && <span className="status-chip status-loading">Init…</span>}
              {tState === 'countdown' && <span className="status-chip status-countdown">{/* shown in transport */}</span>}
              {isRecording            && <span className="status-chip status-rec">● {formattedTime}</span>}
              {state === 'done'       && <span className="status-chip status-done">✓ Done</span>}
              {muted                  && <span className="status-chip status-idle" style={{ marginLeft: 4 }}>SKIP</span>}
            </div>
          </div>

          {permError && (
            <div className="perm-error-bar">
              <span>⚠ {permError}</span>
              <button className="btn btn-sm btn-ghost" onClick={() => requestCamera().catch(() => {})}>
                重新授權
              </button>
            </div>
          )}
        </div>

        <div className="track-end-btns">
          <button
            className={`btn btn-sm btn-ghost mute-btn ${muted ? 'mute-btn--on' : ''}`}
            onClick={toggleMute}
            title={muted ? 'Include in recording' : 'Skip this track in recording'}
          >
            {muted ? '🚫' : 'M'}
          </button>
          {hasVideo && (
            <button
              className={`btn btn-sm btn-ghost ${camExpanded ? 'btn-ghost--active' : ''}`}
              onClick={() => setCamExpanded((o) => !o)}
              title="Camera preview"
            >
              📷
            </button>
          )}
          <button
            className={`btn btn-sm btn-ghost ${fxOpen ? 'btn-ghost--active' : ''}`}
            onClick={() => setFxOpen((o) => !o)}
          >
            FX
          </button>
          <button className="track-remove-btn" onClick={() => onRemove(track.id)}>✕</button>
        </div>
      </div>

      {/* Recording timeline */}
      <TrackTimeline
        position={isRecording ? elapsed : position}
        duration={state === 'done' ? elapsed : 0}
        isRecording={isRecording}
        onSeek={onSeek}
      />

      {/* Camera preview */}
      {hasVideo && camExpanded && (
        <div className="track-camera-wrap">
          <video ref={videoRef} className="track-camera-video" autoPlay playsInline muted />
          {tState === 'countdown' && (
            <div className="track-camera-overlay">
              <div className="cam-countdown-label">Recording starts…</div>
            </div>
          )}
          {isRecording && (
            <div className="cam-rec-badge">● REC {formattedTime}</div>
          )}
        </div>
      )}

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
})

export default RecordingTrack
