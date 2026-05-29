import { useRef } from 'react'

// Wraps the right-side timeline cell of a track.
// All tracks share the same scale (projectDuration) so the playhead stays
// aligned regardless of individual track lengths.
export default function TrackTimeline({
  position,
  duration,         // this track's content length in seconds
  projectDuration,  // longest track in the project — sets the common scale
  isRecording,
  recElapsed,       // elapsed seconds during active recording
  onSeek,
  fillClass,
  label,
  children,
  backdrop,         // bottom layer: waveform bars or video filmstrip
}) {
  const ref = useRef(null)

  // Common scale: use project duration when available, fall back to own duration
  const scale = (projectDuration > 0 ? projectDuration : duration) || 0

  // Where the playhead sits — synchronized across all tracks
  const playheadPct = scale > 0 ? Math.min(100, (position / scale) * 100) : 0

  // Progress fill — advances with playback but stops at this track's own end
  const fillPct = (duration > 0 && scale > 0)
    ? Math.min(100, (Math.min(position, duration) / scale) * 100)
    : 0

  // Fraction of the timeline occupied by this track's content
  const contentPct = (duration > 0 && scale > 0)
    ? Math.min(100, (duration / scale) * 100)
    : 100

  const showPlayhead = scale > 0

  const handleMouseDown = (e) => {
    if (!scale) return
    e.preventDefault()
    const rect = ref.current.getBoundingClientRect()
    const calc = (x) => Math.max(0, Math.min((x - rect.left) / rect.width, 1)) * scale
    onSeek(calc(e.clientX))
    const move = (me) => onSeek(calc(me.clientX))
    const up = () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }

  const handleTouchStart = (e) => {
    if (!scale) return
    const rect = ref.current.getBoundingClientRect()
    const calc = (x) => Math.max(0, Math.min((x - rect.left) / rect.width, 1)) * scale
    onSeek(calc(e.touches[0].clientX))
    const move = (te) => onSeek(calc(te.touches[0].clientX))
    const end = () => {
      document.removeEventListener('touchmove', move)
      document.removeEventListener('touchend', end)
    }
    document.addEventListener('touchmove', move, { passive: false })
    document.addEventListener('touchend', end)
  }

  return (
    <div
      ref={ref}
      className="track-tl"
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
    >
      {/* Waveform / filmstrip — confined to this track's content width */}
      {backdrop && duration > 0 && (
        <div style={{
          position: 'absolute', top: 0, bottom: 0, left: 0,
          width: `${contentPct}%`, overflow: 'hidden', pointerEvents: 'none',
        }}>
          {backdrop}
        </div>
      )}

      {/* Subtle hatched area beyond this track's content */}
      {duration > 0 && contentPct < 99.5 && (
        <div className="tl-after-content" style={{ left: `${contentPct}%` }} />
      )}

      {/* Content end marker — vertical tick where this track ends */}
      {duration > 0 && contentPct < 99.5 && (
        <div className="tl-content-end" style={{ left: `${contentPct}%` }} />
      )}

      {/* Recording grow fill — full width, indicates recording is active */}
      {isRecording && (
        <div className="tl-fill tl-fill--rec-grow" />
      )}

      {/* Playback progress fill — stops at this track's content end */}
      {duration > 0 && (
        <div className={`tl-fill ${fillClass}`} style={{ width: `${fillPct}%` }} />
      )}

      {/* File / track label */}
      {label && <span className="tl-label">{label}</span>}

      {children}

      {/* Duration */}
      {duration > 0 && (
        <span className="tl-dur">{fmtTime(duration)}</span>
      )}
      {isRecording && (
        <span className="tl-dur tl-dur--rec">{fmtTime(recElapsed ?? 0)}</span>
      )}

      {/* Playhead — same position % on every track */}
      {showPlayhead && (
        <div className="tl-playhead" style={{ left: `${playheadPct}%` }} />
      )}
    </div>
  )
}

function fmtTime(s) {
  if (!isFinite(s) || s < 0) s = 0
  const m   = Math.floor(s / 60).toString().padStart(2, '0')
  const sec = Math.floor(s % 60).toString().padStart(2, '0')
  return `${m}:${sec}`
}
