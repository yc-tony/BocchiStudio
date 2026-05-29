import { useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react'
import TrackTimeline from '../TrackTimeline'

const VideoTrack = forwardRef(function VideoTrack(
  { track, onUpdate, onRemove, onDurationChange, onSeek, position, tState },
  ref,
) {
  const videoRef              = useRef(null)
  const [dragOver, setDragOver] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [muted, setMuted]       = useState(false)
  const mutedRef = useRef(false)

  useImperativeHandle(ref, () => ({
    getType: () => 'video',
    transportPlay(fromTime) {
      if (mutedRef.current || !videoRef.current || !track.objectUrl) return
      videoRef.current.currentTime = fromTime
      videoRef.current.play().catch(() => {})
    },
    transportPause() { videoRef.current?.pause() },
    transportStop() {
      videoRef.current?.pause()
      if (videoRef.current) videoRef.current.currentTime = 0
    },
    transportSeek(time) {
      if (videoRef.current) videoRef.current.currentTime = time
    },
    transportStartRecord() {},
    transportStopRecord()  {},
    getDuration() { return videoRef.current?.duration || 0 },
  }), [track.objectUrl])

  const handleFile = (file) => {
    if (!file?.type.startsWith('video/')) return
    if (track.objectUrl) URL.revokeObjectURL(track.objectUrl)
    onUpdate(track.id, { blob: file, objectUrl: URL.createObjectURL(file), name: file.name.replace(/\.\w+$/, '') })
  }

  const handleVideoLoad = useCallback(() => {
    const dur = videoRef.current?.duration
    if (dur && isFinite(dur)) onDurationChange(track.id, dur)
  }, [track.id, onDurationChange])

  const toggleMute = () => {
    const next = !mutedRef.current
    mutedRef.current = next; setMuted(next)
    if (videoRef.current) videoRef.current.muted = next
  }

  const duration = videoRef.current?.duration || 0

  return (
    <div className={`track-wrapper ${muted ? 'track-wrapper--muted' : ''}`}>
      <div className="track-row">

        {/* Left: control block */}
        <div className="track-hd">
          <div className="track-hd-top">
            <span className="track-type-dot track-type-dot--video" />
            <span className="track-name">{track.name}</span>
            <div className="track-hd-actions">
              <button
                className={`hd-btn ${muted ? 'hd-btn--muted' : ''}`}
                onClick={toggleMute}
                title={muted ? 'Unmute' : 'Mute'}
              >M</button>
              {track.objectUrl && (
                <button
                  className={`hd-btn ${expanded ? 'hd-btn--active' : ''}`}
                  onClick={() => setExpanded((o) => !o)}
                >🎞</button>
              )}
              <button className="hd-btn hd-btn--remove" onClick={() => onRemove(track.id)}>✕</button>
            </div>
          </div>

          {track.objectUrl && (
            <div className="track-vol-row">
              <span className="track-vol-label">VOL</span>
              <input
                type="range" min="0" max="1" step="0.01"
                value={track.volume ?? 0.8}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  onUpdate(track.id, { volume: v })
                  if (videoRef.current) videoRef.current.volume = v
                }}
              />
              <span className="track-vol-val">{Math.round((track.volume ?? 0.8) * 100)}%</span>
            </div>
          )}
        </div>

        {/* Right: timeline cell */}
        <TrackTimeline
          position={position}
          duration={duration}
          isRecording={false}
          fillClass="tl-fill--video"
          label={track.objectUrl ? track.name : null}
          onSeek={onSeek}
        >
          {!track.objectUrl && (
            <div
              className="tl-drop"
              onClick={() => document.getElementById(`vf-${track.id}`)?.click()}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]) }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
            >
              ▶ 拖曳影片至此，或點擊上傳
              <input
                id={`vf-${track.id}`} type="file" accept="video/*"
                style={{ display: 'none' }}
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </div>
          )}
        </TrackTimeline>
      </div>

      {/* Video preview */}
      {track.objectUrl && expanded && (
        <div className="track-addon-row track-addon-row--video">
          <div className="track-addon-hd" />
          <div className="track-addon-body track-addon-body--video">
            <video
              ref={videoRef}
              src={track.objectUrl}
              className="track-video-preview"
              onLoadedMetadata={handleVideoLoad}
            />
          </div>
        </div>
      )}
    </div>
  )
})

export default VideoTrack
