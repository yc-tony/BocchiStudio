import { useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react'
import TrackTimeline from '../TrackTimeline'

const VideoTrack = forwardRef(function VideoTrack(
  { track, onUpdate, onRemove, onDurationChange, position, tState },
  ref,
) {
  const videoRef             = useRef(null)
  const [dragOver, setDragOver] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [muted, setMuted]       = useState(false)
  const mutedRef = useRef(false)

  // ── Transport interface ───────────────────────────────────────
  useImperativeHandle(ref, () => ({
    getType: () => 'video',
    transportPlay(fromTime) {
      if (mutedRef.current || !videoRef.current || !track.objectUrl) return
      videoRef.current.currentTime = fromTime
      videoRef.current.play().catch(() => {})
    },
    transportStop() {
      if (!videoRef.current) return
      videoRef.current.pause()
      videoRef.current.currentTime = 0
    },
    transportSeek(time) {
      if (!videoRef.current) return
      videoRef.current.currentTime = time
    },
    transportStartRecord() { /* video tracks don't record */ },
    transportStopRecord()  { /* video tracks don't record */ },
    getDuration() { return videoRef.current?.duration || 0 },
  }), [track.objectUrl])

  const handleFile = (file) => {
    if (!file?.type.startsWith('video/')) return
    if (track.objectUrl) URL.revokeObjectURL(track.objectUrl)
    onUpdate(track.id, {
      blob: file,
      objectUrl: URL.createObjectURL(file),
      name: file.name.replace(/\.\w+$/, ''),
    })
  }

  const handleVideoLoad = useCallback(() => {
    const dur = videoRef.current?.duration
    if (dur && isFinite(dur)) onDurationChange(track.id, dur)
  }, [track.id, onDurationChange])

  const toggleMute = () => {
    const next = !mutedRef.current
    mutedRef.current = next
    setMuted(next)
    if (videoRef.current) videoRef.current.muted = next
  }

  const duration = videoRef.current?.duration || 0

  return (
    <div className={`track-lane ${dragOver ? 'track-lane--drag' : ''} ${muted ? 'track-lane--muted' : ''}`}>
      <div className="track-lane-head">
        <div className="track-label">
          <span className="track-type-dot track-type-dot--video" />
          <span className="track-name">{track.name}</span>
        </div>

        <div className="track-content">
          {!track.objectUrl ? (
            <div
              className="track-dropzone"
              onClick={() => document.getElementById(`vf-${track.id}`)?.click()}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]) }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
            >
              拖曳影片至此，或點擊上傳
              <input
                id={`vf-${track.id}`} type="file" accept="video/*"
                style={{ display: 'none' }}
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </div>
          ) : (
            <>
              <span className="track-filename">{track.name}</span>
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
            </>
          )}
        </div>

        <div className="track-end-btns">
          <button
            className={`btn btn-sm btn-ghost mute-btn ${muted ? 'mute-btn--on' : ''}`}
            onClick={toggleMute}
            title={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? '🔇' : 'M'}
          </button>
          {track.objectUrl && (
            <button
              className={`btn btn-sm btn-ghost ${expanded ? 'btn-ghost--active' : ''}`}
              onClick={() => setExpanded((o) => !o)}
            >
              🎞
            </button>
          )}
          <button className="track-remove-btn" onClick={() => onRemove(track.id)}>✕</button>
        </div>
      </div>

      {/* Timeline */}
      {track.objectUrl && (
        <TrackTimeline
          position={position}
          duration={duration}
          isRecording={false}
          onSeek={(t) => {
            if (videoRef.current) videoRef.current.currentTime = t
          }}
        />
      )}

      {/* Video preview */}
      {track.objectUrl && expanded && (
        <div className="track-video-wrap">
          <video
            ref={videoRef}
            src={track.objectUrl}
            className="track-video-preview"
            onLoadedMetadata={handleVideoLoad}
          />
        </div>
      )}
    </div>
  )
})

export default VideoTrack
