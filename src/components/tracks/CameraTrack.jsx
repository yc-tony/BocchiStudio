import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import { useCameraRecorder } from '../../hooks/useCameraRecorder'
import TrackTimeline from '../TrackTimeline'
import VideoFilmstrip from '../VideoFilmstrip'

const CameraTrack = forwardRef(function CameraTrack(
  { track, onUpdate, onRemove, onDurationChange, onSeek, position, projectDuration, tState },
  ref,
) {
  const [muted, setMuted]           = useState(false)
  const [previewOpen, setPreviewOpen] = useState(true)
  const [recordedUrl, setRecordedUrl] = useState(null)
  const mutedRef = useRef(false)

  const {
    state, elapsed, formattedTime, blob, permError,
    videoDevices, selectedVideoId,
    videoRef, requestCamera, switchCamera, refreshDevices,
    startImmediate, stopImmediate,
  } = useCameraRecorder()

  const isRecording = state === 'recording'
  const isBusy      = isRecording || state === 'requesting'

  // Create/revoke blob URL for filmstrip once recording is done
  useEffect(() => {
    if (!blob) { if (recordedUrl) URL.revokeObjectURL(recordedUrl); setRecordedUrl(null); return }
    const url = URL.createObjectURL(blob)
    setRecordedUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [blob]) // eslint-disable-line

  useImperativeHandle(ref, () => ({
    getType:     () => 'camera',
    transportPlay()    {},
    transportPause()   {},
    transportStop()    { if (state === 'recording') stopImmediate() },
    transportSeek()    {},
    transportStartRecord() { if (!mutedRef.current) startImmediate() },
    transportStopRecord()  { stopImmediate() },
    getDuration()      { return state === 'done' ? elapsed : 0 },
  }), [state, elapsed, startImmediate, stopImmediate])

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
      <div className="track-row">

        {/* Left: control block */}
        <div className="track-hd">
          <div className="track-hd-top">
            <span className="track-type-dot track-type-dot--rec" style={{ background: '#6060b0' }} />
            <span className="track-name">{track.name}</span>
            <div className="track-hd-actions">
              <button className={`hd-btn ${muted ? 'hd-btn--muted' : ''}`} onClick={toggleMute}
                title={muted ? 'Include' : 'Skip (mute)'}>M</button>
              <button className={`hd-btn ${previewOpen ? 'hd-btn--active' : ''}`}
                onClick={() => setPreviewOpen((o) => !o)} title="Toggle preview">📷</button>
              <button className="hd-btn hd-btn--remove" onClick={() => onRemove(track.id)}>✕</button>
            </div>
          </div>

          {/* Status */}
          <div className="hd-vu" style={{ paddingLeft: 2 }}>
            {state === 'idle'       && <span className="status-chip status-idle">Ready</span>}
            {state === 'requesting' && <span className="status-chip status-loading">Init…</span>}
            {isRecording            && <span className="status-chip status-rec">● {formattedTime}</span>}
            {state === 'done'       && <span className="status-chip status-done">✓</span>}
          </div>

          {/* Camera device selector */}
          <div className="hd-devices">
            <div className="device-picker">
              <span className="device-picker-label">CAM</span>
              <select className="device-select" value={selectedVideoId}
                onChange={(e) => switchCamera(e.target.value)} disabled={isBusy}>
                <option value="">Default</option>
                {videoDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Camera ${d.deviceId.slice(0, 8)}`}
                  </option>
                ))}
              </select>
              <button className="hd-btn" onClick={() => { refreshDevices(); requestCamera().catch(() => {}) }}
                disabled={isBusy} title="Refresh devices">↺</button>
            </div>

            {/* Continuity Camera / cross-platform note */}
            <div className="cam-hint">
              macOS: iPhone 可透過 Continuity Camera 出現在清單中。
              手機瀏覽器亦可直接使用前 / 後鏡頭。
            </div>
          </div>

          {permError && (
            <div className="perm-error-bar">
              <span>⚠ {permError}</span>
              <button className="btn btn-sm btn-ghost" onClick={() => requestCamera().catch(() => {})}>重新授權</button>
            </div>
          )}
        </div>

        {/* Right: camera recording timeline */}
        <TrackTimeline
          position={position}
          duration={state === 'done' ? elapsed : 0}
          projectDuration={projectDuration}
          isRecording={isRecording}
          recElapsed={elapsed}
          fillClass="tl-fill--rec"
          label={isRecording ? `● REC ${formattedTime}` : state === 'done' ? `✓ ${track.name}` : null}
          onSeek={onSeek}
          backdrop={
            recordedUrl && state === 'done'
              ? <VideoFilmstrip objectUrl={recordedUrl} duration={elapsed} />
              : null
          }
        />
      </div>

      {/* Camera live preview */}
      {previewOpen && (
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
    </div>
  )
})

export default CameraTrack
