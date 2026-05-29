// SVG-based centered bar waveform.
// Naturally responsive — no canvas sizing headaches.
// Rendered as the bottom layer inside TrackTimeline (via backdrop prop).
export default function WaveformBars({ peaks, color = 'rgba(110,79,58,0.22)' }) {
  if (!peaks || peaks.length === 0) return null
  const N = peaks.length
  return (
    <svg
      viewBox={`0 0 ${N} 1`}
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{
        position: 'absolute', inset: 0,
        width: '100%', height: '100%',
        pointerEvents: 'none', display: 'block',
      }}
    >
      {peaks.map((amp, i) => (
        <rect
          key={i}
          x={i + 0.05}
          y={(1 - amp * 0.88) / 2}
          width={0.9}
          height={amp * 0.88}
          fill={color}
        />
      ))}
    </svg>
  )
}
