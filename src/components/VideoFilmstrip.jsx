import { useState, useEffect } from 'react'

// Extracts evenly-spaced frame thumbnails from a video blob URL
// and renders them as a filmstrip inside the timeline cell.
export default function VideoFilmstrip({ objectUrl, duration }) {
  const [frames, setFrames] = useState([])

  useEffect(() => {
    if (!objectUrl || !(duration > 0)) { setFrames([]); return }

    const video = document.createElement('video')
    video.src = objectUrl
    video.muted = true
    video.preload = 'metadata'

    const NUM = 14
    const W = 64, H = 46
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx2d = canvas.getContext('2d')

    const captured = []
    let i = 0

    const seekNext = () => {
      video.currentTime = i === 0 ? 0.05 : (i / NUM) * duration
    }

    video.addEventListener('loadedmetadata', seekNext)
    video.addEventListener('seeked', () => {
      try { ctx2d.drawImage(video, 0, 0, W, H) } catch {}
      captured.push(canvas.toDataURL('image/jpeg', 0.55))
      i++
      if (i < NUM) seekNext()
      else { setFrames([...captured]); video.src = '' }
    })

    return () => { video.src = ''; setFrames([]) }
  }, [objectUrl, duration])

  if (frames.length === 0) return null

  return (
    <div className="tl-filmstrip" aria-hidden="true">
      {frames.map((src, idx) => (
        <img key={idx} src={src} className="tl-filmstrip-frame" alt="" />
      ))}
    </div>
  )
}
