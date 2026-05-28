// Animated VU meter — level is 0..1
export default function VUMeter({ level = 0, bars = 16, vertical = true }) {
  const filled = Math.round(level * bars)

  return (
    <div className="vu-meter" style={vertical ? {} : { transform: 'rotate(-90deg)' }}>
      {Array.from({ length: bars }).map((_, i) => {
        const active = i < filled
        const pct = ((i + 1) / bars) * 100
        const colorClass = pct > 90 ? 'red' : pct > 70 ? 'amber' : 'green'
        return (
          <div key={i} className="vu-bar">
            <div
              className={`vu-fill ${active ? colorClass : ''}`}
              style={{ height: active ? '100%' : '0%' }}
            />
          </div>
        )
      })}
    </div>
  )
}
