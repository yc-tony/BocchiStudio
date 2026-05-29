import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import { useMicRecorder } from '../../hooks/useMicRecorder'
import { usePluginChain } from '../../hooks/usePluginChain'
import { useAudioWaveform } from '../../hooks/useAudioWaveform'
import VUMeter from '../VUMeter'
import FxChain from '../FxChain'
import WaveformBars from '../WaveformBars'
import TrackTimeline from '../TrackTimeline'

const RecordingTrack = forwardRef(function RecordingTrack(
  { track, onUpdate, onRemove, onDurationChange, onSeek, position, projectDuration, tState },
  ref,
) {
  const [fxOpen, setFxOpen] = useState(false)
  const [muted, setMuted]   = useState(false)
  const mutedRef = useRef(false)

  const {
    state, elapsed, formattedTime, blob, micLevel, permError,
    audioDevices, selectedAudioId,
    requestMic, switchAudio, refreshDevices,
    startImmediate, stopImmediate,
  } = useMicRecorder()

  const micFx = usePluginChain()
  const isRecording = state === 'recording'
  const isBusy      = isRecording || state === 'requesting'

  const waveformPeaks = useAudioWaveform(track.recordedBlob)

  useImperativeHandle(ref, () => ({
    getType:     () => 'recording',
    transportPlay()    {},
    transportPause()   {},
    transportStop()    { if (state === 'recording') stopImmediate() },
    transportSeek()    {},
    transportStartRecord() { if (!mutedRef.current) startImmediate() },
    transportStopRecord()  { stopImmediate() },
    getDuration()      { return state === 'done' ? elapsed : 0 },
  }), [state, elapsed, startImmediate, stopImmediate])

  useEffect(() => { requestMic().catch(() => {}) }, []) // eslint-disable-line

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
            <span className="track-type-dot track-type-dot--rec" />
            <span className="track-name">{track.name}</span>
            <div className="track-hd-actions">
              <button className={`hd-btn ${muted ? 'hd-btn--muted' : ''}`} onClick={toggleMute}
                title={muted ? 'Include in recording' : 'Skip (mute)'}>M</button>
              <button className={`hd-btn ${fxOpen ? 'hd-btn--active' : ''}`} onClick={() => setFxOpen((o) => !o)}>FX</button>
              <button className="hd-btn hd-btn--remove" onClick={() => onRemove(track.id)}>✕</button>
            </div>
          </div>

          {/* VU + status */}
          <div className="hd-vu">
            <VUMeter level={muted ? 0 : micLevel} bars={14} />
            {state === 'idle'       && <span className="status-chip status-idle">Ready</span>}
            {state === 'requesting' && <span className="status-chip status-loading">Init…</span>}
            {isRecording            && <span className="status-chip status-rec">● {formattedTime}</span>}
            {state === 'done'       && <span className="status-chip status-done">✓</span>}
          </div>

          {/* Device selector */}
          <div className="hd-devices">
            <div className="device-picker">
              <span className="device-picker-label">MIC</span>
              <select className="device-select" value={selectedAudioId}
                onChange={(e) => switchAudio(e.target.value)} disabled={isBusy}>
                <option value="">Default</option>
                {audioDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Input ${d.deviceId.slice(0, 8)}`}
                  </option>
                ))}
              </select>
              <button className="hd-btn" onClick={() => { refreshDevices(); requestMic().catch(() => {}) }}
                disabled={isBusy} title="Refresh devices">↺</button>
            </div>
          </div>

          {permError && (
            <div className="perm-error-bar">
              <span>⚠ {permError}</span>
              <button className="btn btn-sm btn-ghost" onClick={() => requestMic().catch(() => {})}>重新授權</button>
            </div>
          )}
        </div>

        {/* Right: recording timeline */}
        <TrackTimeline
          position={position}
          duration={state === 'done' ? elapsed : 0}
          projectDuration={projectDuration}
          isRecording={isRecording}
          recElapsed={elapsed}
          fillClass="tl-fill--rec"
          label={isRecording ? `● REC ${formattedTime}` : state === 'done' ? `✓ ${track.name}` : null}
          onSeek={onSeek}
          backdrop={waveformPeaks
            ? <WaveformBars peaks={waveformPeaks} color="rgba(176,64,64,0.28)" />
            : null}
        />
      </div>

      {/* FX chain */}
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
