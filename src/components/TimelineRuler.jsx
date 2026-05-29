// Sticky ruler row showing time tick marks aligned with all track timelines below
export default function TimelineRuler({ duration }) {
  if (!duration || !isFinite(duration) || duration <= 0) {
    return <div className="daw-ruler"><span className="ruler-no-content">— 匯入音訊或影片以顯示時間軸 —</span></div>
  }

  // Adaptive tick interval
  const interval = duration <= 10 ? 1 : duration <= 60 ? 5 : duration <= 300 ? 10 : 30
  const ticks = []
  for (let t = 0; t <= duration + interval * 0.5; t += interval) {
    if (t > duration) break
    ticks.push(t)
  }

  return (
    <div className="daw-ruler">
      {ticks.map((t) => (
        <div
          key={t}
          className="ruler-tick"
          style={{ left: `${(t / duration) * 100}%` }}
        >
          <span className="ruler-label">{fmtTime(t)}</span>
        </div>
      ))}
    </div>
  )
}

function fmtTime(s) {
  const m   = Math.floor(s / 60).toString().padStart(2, '0')
  const sec = Math.floor(s % 60).toString().padStart(2, '0')
  return `${m}:${sec}`
}
