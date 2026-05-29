// Bottom transport bar — unified play / record / stop for all tracks
export default function TransportBar({
  state,       // 'idle' | 'countdown' | 'playing' | 'recording'
  countdown,   // number 3|2|1 during countdown, else null
  position,    // current playhead in seconds
  duration,    // total project duration in seconds
  onPlay,
  onStop,
  onRecord,
}) {
  const fmt = (s) => {
    if (!isFinite(s) || s < 0) s = 0
    const m = Math.floor(s / 60).toString().padStart(2, '0')
    const sec = Math.floor(s % 60).toString().padStart(2, '0')
    return `${m}:${sec}`
  }

  const isPlaying   = state === 'playing'
  const isRecording = state === 'recording'
  const isCountdown = state === 'countdown'
  const isBusy      = isPlaying || isRecording || isCountdown

  return (
    <div className="transport-bar">
      {/* Time display */}
      <div className="transport-time">
        <span className="transport-pos">{fmt(position)}</span>
        {duration > 0 && (
          <span className="transport-dur"> / {fmt(duration)}</span>
        )}
      </div>

      {/* Controls */}
      <div className="transport-controls">
        <button
          className={`tbtn tbtn--rec ${isRecording ? 'tbtn--active' : ''}`}
          onClick={onRecord}
          disabled={isPlaying}
          title="Record"
        >
          {isCountdown ? <span className="tbtn-countdown">{countdown}</span> : '⏺'}
        </button>

        <button
          className={`tbtn tbtn--play ${isPlaying ? 'tbtn--active' : ''}`}
          onClick={isPlaying ? onStop : onPlay}
          disabled={isRecording || isCountdown}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>

        <button
          className="tbtn tbtn--stop"
          onClick={onStop}
          disabled={!isBusy}
          title="Stop"
        >
          ⏹
        </button>
      </div>

      {/* Status badge */}
      <div className="transport-status">
        {isRecording && <span className="transport-rec-badge">● REC</span>}
        {isCountdown && <span className="transport-rec-badge">{countdown}</span>}
        {isPlaying   && <span className="transport-play-badge">▶ PLAYING</span>}
      </div>
    </div>
  )
}
