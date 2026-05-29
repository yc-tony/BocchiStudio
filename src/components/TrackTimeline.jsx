import { useRef } from 'react'

function fmt(s) {
  if (!isFinite(s) || s < 0) s = 0
  const m   = Math.floor(s / 60).toString().padStart(2, '0')
  const sec = Math.floor(s % 60).toString().padStart(2, '0')
  return `${m}:${sec}`
}

// Per-track scrubber bar. All tracks share the same global position from DAWPage.
// Dragging calls onSeek(time) which DAWPage uses to seek all tracks together.
export default function TrackTimeline({ position, duration, isRecording, onSeek }) {
  const barRef = useRef(null)

  const pct = (duration > 0)
    ? Math.min(100, (position / duration) * 100)
    : isRecording ? Math.min(100, (position / Math.max(position, 1)) * 0) : 0

  const recPct = isRecording ? 100 : 0 // recording fill grows behind playhead

  const getTimeFromEvent = (clientX) => {
    const rect = barRef.current?.getBoundingClientRect()
    if (!rect || !duration) return null
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width))
    return (x / rect.width) * duration
  }

  const handleMouseDown = (e) => {
    e.preventDefault()
    const t = getTimeFromEvent(e.clientX)
    if (t !== null) onSeek(t)

    const onMove = (me) => {
      const t2 = getTimeFromEvent(me.clientX)
      if (t2 !== null) onSeek(t2)
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const handleTouchStart = (e) => {
    const t = getTimeFromEvent(e.touches[0].clientX)
    if (t !== null) onSeek(t)

    const onMove = (te) => {
      const t2 = getTimeFromEvent(te.touches[0].clientX)
      if (t2 !== null) onSeek(t2)
    }
    const onEnd = () => {
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
    }
    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd)
  }

  return (
    <div
      ref={barRef}
      className={`track-timeline ${!duration && !isRecording ? 'track-timeline--empty' : ''}`}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
    >
      {/* Recording fill (red, grows as recording progresses) */}
      {isRecording && (
        <div className="track-timeline-rec" style={{ width: `${Math.min(100, (position / Math.max(position + 1, 1)) * 100)}%` }} />
      )}

      {/* Playback fill */}
      {duration > 0 && (
        <div className="track-timeline-fill" style={{ width: `${pct}%` }} />
      )}

      {/* Playhead dot */}
      {(duration > 0 || isRecording) && (
        <div
          className="track-timeline-head"
          style={{ left: `calc(${pct}% - 5px)` }}
        />
      )}

      {/* Duration label */}
      {duration > 0 && (
        <span className="track-timeline-dur">{fmt(duration)}</span>
      )}
      {isRecording && !duration && (
        <span className="track-timeline-dur">{fmt(position)}</span>
      )}
    </div>
  )
}
