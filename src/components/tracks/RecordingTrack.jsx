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
    detectedChannels, selectedChannel,
    monitoring, toggleMonitoring,
    requestMic, switchAudio, switchChannel, refreshDevices,
    startImmediate, stopImmediate,
  } = useMicRecorder()

  const micFx = usePluginChain()
  const isRecording   = state === 'recording'
  const isPlayingBack = tState === 'playing'
  const isBusy        = isRecording || state === 'requesting' || isPlayingBack

  const waveformPeaks = useAudioWaveform(track.recordedBlob)

  const audioRef   = useRef(null)
  const blobUrlRef = useRef(null)

  // Build a playback Audio element whenever a new recording blob arrives
  useEffect(() => {
    if (!track.recordedBlob) return
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
    const url   = URL.createObjectURL(track.recordedBlob)
    blobUrlRef.current = url
    const audio = new Audio(url)
    audioRef.current = audio
    audio.addEventListener('loadedmetadata', () => onDurationChange(track.id, audio.duration))
    return () => {
      audio.pause()
      audioRef.current = null
      URL.revokeObjectURL(url)
      blobUrlRef.current = null
    }
  }, [track.recordedBlob]) // eslint-disable-line

  useImperativeHandle(ref, () => ({
    getType: () => 'recording',
    transportPlay(fromTime) {
      if (mutedRef.current || !audioRef.current) return
      audioRef.current.currentTime = fromTime
      audioRef.current.play().catch(() => {})
    },
    transportPause() { audioRef.current?.pause() },
    transportStop() {
      if (state === 'recording') stopImmediate()
      audioRef.current?.pause()
      if (audioRef.current) audioRef.current.currentTime = 0
    },
    transportSeek(time) {
      if (audioRef.current) audioRef.current.currentTime = time
    },
    transportStartRecord() { if (!mutedRef.current) startImmediate() },
    transportStopRecord()  { stopImmediate() },
    getDuration()          { return audioRef.current?.duration || 0 },
  }), [state, startImmediate, stopImmediate])

  useEffect(() => { requestMic().catch(() => {}) }, []) // eslint-disable-line

  useEffect(() => {
    if (state === 'done' && blob) {
      onUpdate(track.id, { recordedBlob: blob })
      onDurationChange(track.id, elapsed) // register duration immediately so auto-stop works
    }
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
              <button className={`hd-btn ${monitoring ? 'hd-btn--monitor' : ''}`} onClick={toggleMonitoring}
                title={monitoring ? '關閉輸入監聽' : '開啟輸入監聽（即時播放，建議戴耳機避免回授）'}>IN</button>
              <button className={`hd-btn ${fxOpen ? 'hd-btn--active' : ''}`} onClick={() => setFxOpen((o) => !o)}>FX</button>
              <button className="hd-btn hd-btn--remove" onClick={() => onRemove(track.id)}>✕</button>
            </div>
          </div>

          {/* VU + status + active channel badge */}
          <div className="hd-vu">
            <VUMeter level={muted ? 0 : micLevel} bars={16} />
            {detectedChannels > 1 && !isRecording && (
              <span className="ch-badge">
                {selectedChannel >= 0 ? `CH${selectedChannel + 1}` : 'ST'}
              </span>
            )}
            {isPlayingBack                          && <span className="status-chip status-playing">▶ Playing</span>}
            {!isPlayingBack && state === 'idle'       && <span className="status-chip status-idle">Ready</span>}
            {!isPlayingBack && state === 'requesting' && <span className="status-chip status-loading">Init…</span>}
            {!isPlayingBack && isRecording            && <span className="status-chip status-rec">● {formattedTime}</span>}
            {!isPlayingBack && state === 'done'       && <span className="status-chip status-done">✓</span>}
          </div>

          {/* Device + channel selectors */}
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

            {/* Channel picker — only shown when multi-channel device detected */}
            {detectedChannels > 1 && (
              <div className="device-picker">
                <span className="device-picker-label">CH</span>
                <select
                  className="device-select"
                  value={selectedChannel}
                  onChange={(e) => switchChannel(e.target.value)}
                  disabled={isBusy}
                >
                  <option value={-1}>
                    {detectedChannels === 2 ? 'Stereo (1+2)' : `All (${detectedChannels}ch)`}
                  </option>
                  {Array.from({ length: detectedChannels }, (_, i) => (
                    <option key={i} value={i}>
                      {detectedChannels === 2
                        ? `Ch ${i + 1} ${i === 0 ? '(L)' : '(R)'}`
                        : `Ch ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
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
