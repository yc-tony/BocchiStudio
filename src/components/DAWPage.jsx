import { useState, useRef, useCallback, useEffect } from 'react'
import AudioTrack from './tracks/AudioTrack'
import RecordingTrack from './tracks/RecordingTrack'
import CameraTrack from './tracks/CameraTrack'
import VideoTrack from './tracks/VideoTrack'
import ExportModal from './ExportModal'
import TransportBar from './TransportBar'
import TimelineRuler from './TimelineRuler'

let _nextId = 1
const genId = () => `t${_nextId++}`

function makeTrack(type) {
  const n = _nextId
  const base = { id: genId(), type, muted: false }
  switch (type) {
    case 'audio':     return { ...base, name: `Audio ${n}`,     blob: null, objectUrl: null, volume: 0.8 }
    case 'recording': return { ...base, name: `Recording ${n}`, recordedBlob: null }
    case 'camera':    return { ...base, name: `Camera ${n}`,    recordedBlob: null }
    case 'video':     return { ...base, name: `Video ${n}`,     blob: null, objectUrl: null, volume: 0.8 }
    default:          return base
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export default function DAWPage() {
  const [tracks, setTracks]         = useState([makeTrack('audio'), makeTrack('recording')])
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [exportOpen, setExportOpen]   = useState(false)

  // ── Transport ─────────────────────────────────────────────────
  const [tState, setTState]       = useState('idle')
  const [countdown, setCountdown] = useState(null)
  const [position, setPosition]   = useState(0)
  const [trackDurations, setTrackDurations] = useState({})

  const posRef       = useRef(0)
  const rafRef       = useRef(null)
  const startTimeRef = useRef(0)
  const trackRefsMap = useRef({})

  const projectDuration = Math.max(0, ...Object.values(trackDurations).filter(Number.isFinite))

  const startTicker = useCallback(() => {
    startTimeRef.current = Date.now() - posRef.current * 1000
    const tick = () => {
      posRef.current = (Date.now() - startTimeRef.current) / 1000
      setPosition(posRef.current)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  const stopTicker = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
  }, [])

  // ── handleSeek: always works, regardless of play state ───────
  // Bug fix: previously only local audio was seeked; now all tracks seek together.
  const handleSeek = useCallback((time) => {
    const clamped = Math.max(0, isFinite(time) ? time : 0)
    const wasPlaying = tState === 'playing'
    if (wasPlaying) stopTicker()
    posRef.current = clamped
    setPosition(clamped)
    Object.values(trackRefsMap.current).forEach((r) => r?.transportSeek(clamped))
    if (wasPlaying) {
      Object.values(trackRefsMap.current).forEach((r) => {
        if (r?.getType() !== 'recording') r?.transportPlay(clamped)
      })
      startTicker()
    }
  }, [tState, stopTicker, startTicker])

  const handleStop = useCallback(() => {
    stopTicker()
    Object.values(trackRefsMap.current).forEach((r) => r?.transportStop())
    posRef.current = 0; setPosition(0); setCountdown(null); setTState('idle')
  }, [stopTicker])

  // Pause keeps current position — does NOT reset to zero
  const handlePause = useCallback(() => {
    stopTicker()
    Object.values(trackRefsMap.current).forEach((r) => r?.transportPause())
    setTState('idle')
  }, [stopTicker])

  const handlePlay = useCallback(() => {
    if (tState !== 'idle') return
    const pos = posRef.current
    Object.values(trackRefsMap.current).forEach((r) => {
      if (r?.getType() !== 'recording') r?.transportPlay(pos)
    })
    startTicker()
    setTState('playing')
  }, [tState, startTicker])

  const handleRecord = useCallback(async () => {
    if (tState !== 'idle') return
    setTState('countdown')
    for (let i = 3; i >= 1; i--) { setCountdown(i); await sleep(1000) }
    setCountdown(null)
    posRef.current = 0; setPosition(0)
    Object.values(trackRefsMap.current).forEach((r) => {
      const type = r?.getType()
      if (type === 'audio' || type === 'video')               r.transportPlay(0)
      if (type === 'recording' || type === 'camera')          r.transportStartRecord()
    })
    startTicker()
    setTState('recording')
  }, [tState, startTicker])

  // Auto-stop at end of project
  useEffect(() => {
    if (tState === 'playing' && projectDuration > 0 && position >= projectDuration) handleStop()
  }, [position, projectDuration, tState, handleStop])

  // ── Track management ──────────────────────────────────────────
  const addTrack = (type) => { setTracks((p) => [...p, makeTrack(type)]); setAddMenuOpen(false) }

  const removeTrack = useCallback((id) => {
    setTracks((p) => {
      const t = p.find((t) => t.id === id)
      if (t?.objectUrl) URL.revokeObjectURL(t.objectUrl)
      return p.filter((t) => t.id !== id)
    })
    setTrackDurations((p) => { const n = { ...p }; delete n[id]; return n })
  }, [])

  const updateTrack = useCallback((id, patch) => {
    setTracks((p) => p.map((t) => t.id === id ? { ...t, ...patch } : t))
  }, [])

  const handleDurationChange = useCallback((id, dur) => {
    setTrackDurations((p) => ({ ...p, [id]: dur }))
  }, [])

  const commonProps = (track) => ({
    key: track.id,
    ref: (r) => { if (r) trackRefsMap.current[track.id] = r; else delete trackRefsMap.current[track.id] },
    track,
    onUpdate: updateTrack,
    onRemove: removeTrack,
    onDurationChange: handleDurationChange,
    onSeek: handleSeek,   // global seek — fixes the seek-when-idle bug
    position,
    tState,
  })

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
                <button onClick={() => addTrack('camera')}>
                  <span className="menu-icon">📷</span> Camera Track
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

      {/* ── Two-column DAW area ───────────────────────── */}
      <div className="daw-tracks-area">
        {/* Sticky ruler row */}
        <div className="daw-ruler-row">
          <div className="daw-ruler-spacer" />
          <TimelineRuler duration={projectDuration} />
        </div>

        {/* Scrollable track list */}
        <div className="daw-tracks-scroll">
          {tracks.length === 0 ? (
            <div className="tracks-empty">
              <div className="tracks-empty-icon">🎛</div>
              <div>點擊 + ADD TRACK 新增音軌</div>
            </div>
          ) : (
            <>
              {tracks.map((track) => {
                if (track.type === 'audio')     return <AudioTrack     {...commonProps(track)} />
                if (track.type === 'recording') return <RecordingTrack {...commonProps(track)} />
                if (track.type === 'camera')    return <CameraTrack    {...commonProps(track)} />
                if (track.type === 'video')     return <VideoTrack     {...commonProps(track)} />
                return null
              })}
            </>
          )}
        </div>
      </div>

      {/* ── Transport bar (bottom) ────────────────────── */}
      <TransportBar
        state={tState}
        countdown={countdown}
        position={position}
        duration={projectDuration}
        onPlay={handlePlay}
        onPause={handlePause}
        onStop={handleStop}
        onRecord={handleRecord}
      />

      {exportOpen && (
        <ExportModal tracks={tracks} onClose={() => setExportOpen(false)} />
      )}
    </div>
  )
}
