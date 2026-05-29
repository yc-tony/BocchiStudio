import { useState, useRef, useCallback, useEffect } from 'react'
import AudioTrack from './tracks/AudioTrack'
import RecordingTrack from './tracks/RecordingTrack'
import VideoTrack from './tracks/VideoTrack'
import ExportModal from './ExportModal'
import TransportBar from './TransportBar'

let _nextId = 1
const genId = () => `t${_nextId++}`

function makeTrack(type) {
  const n = _nextId
  const base = { id: genId(), type, muted: false }
  switch (type) {
    case 'audio':     return { ...base, name: `Audio ${n}`,     blob: null, objectUrl: null, volume: 0.8 }
    case 'recording': return { ...base, name: `Recording ${n}`, recordedBlob: null }
    case 'video':     return { ...base, name: `Video ${n}`,     blob: null, objectUrl: null, volume: 0.8 }
    default:          return base
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export default function DAWPage() {
  const [tracks, setTracks] = useState([makeTrack('audio'), makeTrack('recording')])
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [exportOpen, setExportOpen]   = useState(false)

  // ── Transport state ───────────────────────────────────────────
  const [tState, setTState]       = useState('idle') // idle | countdown | playing | recording
  const [countdown, setCountdown] = useState(null)
  const [position, setPosition]   = useState(0)
  const [trackDurations, setTrackDurations] = useState({}) // id → seconds

  const posRef       = useRef(0)
  const rafRef       = useRef(null)
  const startTimeRef = useRef(0) // Date.now() when play/record began

  // All track refs — keyed by track.id
  const trackRefsMap = useRef({})

  const projectDuration = Math.max(0, ...Object.values(trackDurations).filter(Number.isFinite))

  // ── Position ticker ───────────────────────────────────────────
  const startTicker = useCallback(() => {
    startTimeRef.current = Date.now() - posRef.current * 1000
    const tick = () => {
      const p = (Date.now() - startTimeRef.current) / 1000
      posRef.current = p
      setPosition(p)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  const stopTicker = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
  }, [])

  // ── Transport actions ─────────────────────────────────────────

  const handleStop = useCallback(() => {
    stopTicker()
    Object.values(trackRefsMap.current).forEach((r) => r?.transportStop())
    posRef.current = 0
    setPosition(0)
    setCountdown(null)
    setTState('idle')
  }, [stopTicker])

  const handlePlay = useCallback(() => {
    if (tState !== 'idle') return
    const pos = posRef.current
    Object.values(trackRefsMap.current).forEach((r) => r?.transportPlay(pos))
    startTicker()
    setTState('playing')
  }, [tState, startTicker])

  const handleRecord = useCallback(async () => {
    if (tState !== 'idle') return
    setTState('countdown')
    for (let i = 3; i >= 1; i--) {
      setCountdown(i)
      await sleep(1000)
    }
    setCountdown(null)
    // Start audio/video tracks playing + recording tracks recording simultaneously
    posRef.current = 0
    setPosition(0)
    Object.values(trackRefsMap.current).forEach((r) => {
      const type = r?.getType()
      if (type === 'audio' || type === 'video') r.transportPlay(0)
      if (type === 'recording')                 r.transportStartRecord()
    })
    startTicker()
    setTState('recording')
  }, [tState, startTicker])

  // Seek all tracks to a given time (called when user drags any timeline scrubber)
  const handleSeek = useCallback((time) => {
    const wasPlaying = tState === 'playing'
    if (wasPlaying) stopTicker()
    posRef.current = time
    setPosition(time)
    Object.values(trackRefsMap.current).forEach((r) => r?.transportSeek(time))
    if (wasPlaying) {
      startTicker()
      Object.values(trackRefsMap.current).forEach((r) => {
        if (r?.getType() !== 'recording') r?.transportPlay(time)
      })
    }
  }, [tState, stopTicker, startTicker])

  // Stop ticker when project reaches the end
  useEffect(() => {
    if (tState === 'playing' && projectDuration > 0 && position >= projectDuration) {
      handleStop()
    }
  }, [position, projectDuration, tState, handleStop])

  // ── Track management ──────────────────────────────────────────

  const addTrack = (type) => {
    setTracks((prev) => [...prev, makeTrack(type)])
    setAddMenuOpen(false)
  }

  const removeTrack = useCallback((id) => {
    setTracks((prev) => {
      const t = prev.find((t) => t.id === id)
      if (t?.objectUrl) URL.revokeObjectURL(t.objectUrl)
      return prev.filter((t) => t.id !== id)
    })
    setTrackDurations((prev) => { const n = { ...prev }; delete n[id]; return n })
  }, [])

  const updateTrack = useCallback((id, patch) => {
    setTracks((prev) => prev.map((t) => t.id === id ? { ...t, ...patch } : t))
  }, [])

  const handleDurationChange = useCallback((id, dur) => {
    setTrackDurations((prev) => ({ ...prev, [id]: dur }))
  }, [])

  return (
    <div className="daw">
      {/* ── Header ───────────────────────────────────── */}
      <header className="daw-header">
        <div className="daw-logo">
          <div className="logo-mark" />
          <div className="logo-text">
            <span className="logo-main">Bocchi Studio</span>
            <span className="logo-sub">Virtual Cover DAW</span>
          </div>
        </div>
        <div className="daw-actions">
          <div className="add-track-wrap">
            <button className="btn btn-ghost btn-sm" onClick={() => setAddMenuOpen((o) => !o)}>
              + ADD TRACK
            </button>
            {addMenuOpen && (
              <div className="add-track-menu" onMouseLeave={() => setAddMenuOpen(false)}>
                <button onClick={() => addTrack('audio')}>
                  <span className="menu-icon">🎵</span> Audio Track
                </button>
                <button onClick={() => addTrack('recording')}>
                  <span className="menu-icon">🎙</span> Recording Track
                </button>
                <button onClick={() => addTrack('video')}>
                  <span className="menu-icon">▶</span> Video Track
                </button>
              </div>
            )}
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setExportOpen(true)}>
            ↗ EXPORT
          </button>
        </div>
      </header>

      {/* ── Track list ───────────────────────────────── */}
      <main className="daw-main">
        {tracks.length === 0 ? (
          <div className="tracks-empty">
            <div className="tracks-empty-icon">🎛</div>
            <div>點擊 + ADD TRACK 新增音軌</div>
          </div>
        ) : (
          <div className="track-list">
            {tracks.map((track) => {
              const commonProps = {
                key: track.id,
                ref: (r) => {
                  if (r) trackRefsMap.current[track.id] = r
                  else delete trackRefsMap.current[track.id]
                },
                track,
                onUpdate: updateTrack,
                onRemove: removeTrack,
                onDurationChange: handleDurationChange,
                position,
                tState,
              }
              if (track.type === 'audio')     return <AudioTrack     {...commonProps} />
              if (track.type === 'recording') return <RecordingTrack {...commonProps} onSeek={handleSeek} />
              if (track.type === 'video')     return <VideoTrack     {...commonProps} />
              return null
            })}
          </div>
        )}
      </main>

      {/* ── Transport bar (bottom) ────────────────────── */}
      <TransportBar
        state={tState}
        countdown={countdown}
        position={position}
        duration={projectDuration}
        onPlay={handlePlay}
        onStop={handleStop}
        onRecord={handleRecord}
      />

      {exportOpen && (
        <ExportModal tracks={tracks} onClose={() => setExportOpen(false)} />
      )}
    </div>
  )
}
