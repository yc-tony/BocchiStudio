import { useRef } from 'react'

// Wraps the right-side timeline cell of a track.
// Handles click + drag seeking and renders progress fill + playhead.
// onSeek must be DAWPage's global handleSeek so all tracks move together.
export default function TrackTimeline({
  position,
  duration,
  isRecording,
  recElapsed,   // seconds elapsed during active recording (grows live)
  onSeek,
  fillClass,    // CSS class for the fill color (per track type)
  label,        // filename/track label overlay
  children,     // extra content (e.g. drop zone override)
}) {
  const ref = useRef(null)

  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0
  const recPct = isRecording && recElapsed > 0
    ? Math.min(100, (recElapsed / Math.max(recElapsed + 0.01, 1)) * 100)
    : 0
  const showPlayhead = duration > 0 || isRecording

  const handleMouseDown = (e) => {
    if (!duration && !isRecording) return
    e.preventDefault()
    const rect = ref.current.getBoundingClientRect()
    const calc = (x) =>
      duration > 0 ? Math.max(0, Math.min((x - rect.left) / rect.width, 1)) * duration : 0
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
    if (!duration && !isRecording) return
    const rect = ref.current.getBoundingClientRect()
    const calc = (x) =>
      duration > 0 ? Math.max(0, Math.min((x - rect.left) / rect.width, 1)) * duration : 0
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
      {/* Recording grow fill (red, expands right as recording proceeds) */}
      {isRecording && (
        <div className="tl-fill tl-fill--rec-grow" />
      )}

      {/* Playback progress fill */}
      {duration > 0 && (
        <div className={`tl-fill ${fillClass}`} style={{ width: `${pct}%` }} />
      )}

      {/* File / track label */}
      {label && <span className="tl-label">{label}</span>}

      {/* Any child content (e.g. drop zone) */}
      {children}

      {/* Duration marker */}
      {duration > 0 && (
        <span className="tl-dur">{fmtTime(duration)}</span>
      )}
      {isRecording && (
        <span className="tl-dur tl-dur--rec">{fmtTime(recElapsed ?? 0)}</span>
      )}

      {/* Playhead vertical line */}
      {showPlayhead && (
        <div className="tl-playhead" style={{ left: `${pct}%` }} />
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
