import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import { useRecorder } from '../../hooks/useRecorder'
import { usePluginChain } from '../../hooks/usePluginChain'
import VUMeter from '../VUMeter'
import FxChain from '../FxChain'
import TrackTimeline from '../TrackTimeline'

const RecordingTrack = forwardRef(function RecordingTrack(
  { track, onUpdate, onRemove, onDurationChange, onSeek, position, tState },
  ref,
) {
  const [fxOpen, setFxOpen]           = useState(false)
  const [camExpanded, setCamExpanded] = useState(true)
  const [muted, setMuted]             = useState(false)
  const mutedRef = useRef(false)

  const {
    state, elapsed, formattedTime, blob, micLevel, permError, hasVideo,
    audioDevices, videoDevices, selectedAudioId, selectedVideoId,
    videoRef, requestCamera, switchDevice, refreshDevices,
    startRecordingImmediate, stopRecordingImmediate,
  } = useRecorder()

  const micFx = usePluginChain()
  const isRecording = state === 'recording'
  const isBusy      = isRecording || state === 'requesting'

  useImperativeHandle(ref, () => ({
    getType: () => 'recording',
    transportPlay()    {},
    transportStop()    { if (state === 'recording') stopRecordingImmediate() },
    transportSeek()    {},
    transportStartRecord() { if (!mutedRef.current) startRecordingImmediate() },
    transportStopRecord()  { stopRecordingImmediate() },
    getDuration()      { return state === 'done' ? elapsed : 0 },
  }), [state, elapsed, startRecordingImmediate, stopRecordingImmediate])

  useEffect(() => { requestCamera().catch(() => {}) }, []) // eslint-disable-line

  useEffect(() => {
    if (state === 'done' && blob) onUpdate(track.id, { recordedBlob: blob })
  }, [state, blob]) // eslint-disable-line

  const toggleMute = () => {
    const next = !mutedRef.current
    mutedRef.current = next; setMuted(next)
  }

  return (
    <div className={`track-wrapper ${muted ? 'track-wrapper--muted' : ''}`}>
      {/* ── Main row ──────────────────────────────────── */}
      <div className="track-row">

        {/* Left: control block */}
        <div className="track-hd">
          <div className="track-hd-top">
            <span className="track-type-dot track-type-dot--rec" />
            <span className="track-name">{track.name}</span>
            <div className="track-hd-actions">
              <button
                className={`hd-btn ${muted ? 'hd-btn--muted' : ''}`}
                onClick={toggleMute}
                title={muted ? 'Include' : 'Skip (mute)'}
              >M</button>
              {hasVideo && (
                <button
                  className={`hd-btn ${camExpanded ? 'hd-btn--active' : ''}`}
                  onClick={() => setCamExpanded((o) => !o)}
                  title="Camera preview"
                >📷</button>
              )}
              <button
                className={`hd-btn ${fxOpen ? 'hd-btn--active' : ''}`}
                onClick={() => setFxOpen((o) => !o)}
              >FX</button>
              <button className="hd-btn hd-btn--remove" onClick={() => onRemove(track.id)}>✕</button>
            </div>
          </div>

          {/* VU + status */}
          <div className="hd-vu" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <VUMeter level={muted ? 0 : micLevel} bars={14} />
            {state === 'idle'       && <span className="status-chip status-idle">Ready</span>}
            {state === 'requesting' && <span className="status-chip status-loading">Init…</span>}
            {isRecording            && <span className="status-chip status-rec">● {formattedTime}</span>}
            {state === 'done'       && <span className="status-chip status-done">✓</span>}
          </div>

          {/* Device pickers */}
          <div className="hd-devices">
            <div className="device-picker">
              <span className="device-picker-label">MIC</span>
              <select className="device-select" value={selectedAudioId}
                onChange={(e) => switchDevice('audio', e.target.value)} disabled={isBusy}>
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
              <select className="device-select" value={selectedVideoId}
                onChange={(e) => switchDevice('video', e.target.value)} disabled={isBusy}>
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
              disabled={isBusy} title="Refresh devices"
            >↺</button>
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

        {/* Right: recording timeline */}
        <TrackTimeline
          position={position}
          duration={state === 'done' ? elapsed : 0}
          isRecording={isRecording}
          recElapsed={elapsed}
          fillClass="tl-fill--rec"
          label={isRecording ? `● REC ${formattedTime}` : state === 'done' ? `✓ ${track.name}` : null}
          onSeek={onSeek}
        />
      </div>

      {/* Camera preview expansion */}
      {hasVideo && camExpanded && (
        <div className="track-addon-row track-addon-row--cam">
          <div className="track-addon-hd" />
          <div className="track-addon-body track-addon-body--cam">
            <video ref={videoRef} className="track-camera-video" autoPlay playsInline muted />
            {tState === 'countdown' && (
              <div className="track-camera-overlay">
                <div className="cam-countdown-label">Recording starts…</div>
              </div>
            )}
            {isRecording && <div className="cam-rec-badge">● REC {formattedTime}</div>}
          </div>
        </div>
      )}

      {/* FX panel */}
      {fxOpen && (
        <div className="track-addon-row">
          <div className="track-addon-hd" />
          <div className="track-addon-body">
            <FxChain
              plugins={micFx.plugins}
              onAdd={micFx.addPlugin}
              onRemove={micFx.removePlugin}
              onToggle={micFx.togglePlugin}
              onUpdateParam={micFx.updateParam}
            />
            <div className="mic-fx-note">FX 僅影響監聽，錄音保留原始訊號</div>
          </div>
        </div>
      )}
    </div>
  )
})

export default RecordingTrack
