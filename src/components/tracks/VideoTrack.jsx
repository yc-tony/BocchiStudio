import { useRef, useState } from 'react'

export default function VideoTrack({ track, onUpdate, onRemove }) {
  const videoRef             = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [expanded, setExpanded] = useState(true)

  const handleFile = (file) => {
    if (!file?.type.startsWith('video/')) return
    setPlaying(false)
    if (track.objectUrl) URL.revokeObjectURL(track.objectUrl)
    onUpdate(track.id, {
      blob: file,
      objectUrl: URL.createObjectURL(file),
      name: file.name.replace(/\.\w+$/, ''),
    })
  }

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) { v.play().then(() => setPlaying(true)).catch(() => {}) }
    else { v.pause(); v.currentTime = 0; setPlaying(false) }
  }

  return (
    <div className={`track-lane ${dragOver ? 'track-lane--drag' : ''}`}>
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
              <button className="btn btn-sm btn-ghost track-play-btn" onClick={togglePlay}>
                {playing ? '⏸' : '▶'}
              </button>
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
          {track.objectUrl && (
            <button
              className={`btn btn-sm btn-ghost ${expanded ? 'btn-ghost--active' : ''}`}
              onClick={() => setExpanded((o) => !o)}
              title="Toggle preview"
            >
              🎞
            </button>
          )}
          <button className="track-remove-btn" onClick={() => onRemove(track.id)} title="Remove Track">✕</button>
        </div>
      </div>

      {/* Video preview — collapsible */}
      {track.objectUrl && expanded && (
        <div className="track-video-wrap">
          <video
            ref={videoRef}
            src={track.objectUrl}
            className="track-video-preview"
            controls
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
          />
        </div>
      )}
    </div>
  )
}
