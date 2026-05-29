import { useState, useRef, useCallback } from 'react'
import AudioTrack from './tracks/AudioTrack'
import RecordingTrack from './tracks/RecordingTrack'
import VideoTrack from './tracks/VideoTrack'
import ExportModal from './ExportModal'

let _nextId = 1
const genId = () => `t${_nextId++}`

function makeTrack(type) {
  const n = _nextId
  const base = { id: genId(), type }
  switch (type) {
    case 'audio':     return { ...base, name: `Audio ${n}`,     blob: null, objectUrl: null, volume: 0.8 }
    case 'recording': return { ...base, name: `Recording ${n}`, recordedBlob: null }
    case 'video':     return { ...base, name: `Video ${n}`,     blob: null, objectUrl: null, volume: 0.8 }
    default:          return base
  }
}

export default function DAWPage() {
  const [tracks, setTracks] = useState([
    makeTrack('audio'),
    makeTrack('recording'),
  ])
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [exportOpen, setExportOpen]   = useState(false)

  // Refs to AudioTrack imperative handles so the recording countdown can trigger
  // all audio tracks to play simultaneously for in-sync covers.
  const audioRefsMap = useRef({})

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
  }, [])

  const updateTrack = useCallback((id, patch) => {
    setTracks((prev) => prev.map((t) => t.id === id ? { ...t, ...patch } : t))
  }, [])

  // Triggered by RecordingTrack when countdown ends — start all audio tracks in sync
  const handleRecordStart = useCallback(() => {
    Object.values(audioRefsMap.current).forEach((r) => r?.play())
  }, [])

  // Triggered by RecordingTrack on stop — stop all audio tracks
  const handleRecordStop = useCallback(() => {
    Object.values(audioRefsMap.current).forEach((r) => r?.stop())
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
          {/* Add Track dropdown */}
          <div className="add-track-wrap">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setAddMenuOpen((o) => !o)}
            >
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

          <button
            className="btn btn-primary btn-sm"
            onClick={() => setExportOpen(true)}
          >
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
              if (track.type === 'audio') return (
                <AudioTrack
                  key={track.id}
                  ref={(r) => {
                    if (r) audioRefsMap.current[track.id] = r
                    else delete audioRefsMap.current[track.id]
                  }}
                  track={track}
                  onUpdate={updateTrack}
                  onRemove={removeTrack}
                />
              )
              if (track.type === 'recording') return (
                <RecordingTrack
                  key={track.id}
                  track={track}
                  onUpdate={updateTrack}
                  onRemove={removeTrack}
                  onRecordStart={handleRecordStart}
                  onRecordStop={handleRecordStop}
                />
              )
              if (track.type === 'video') return (
                <VideoTrack
                  key={track.id}
                  track={track}
                  onUpdate={updateTrack}
                  onRemove={removeTrack}
                />
              )
              return null
            })}
          </div>
        )}
      </main>

      {/* ── Export modal ─────────────────────────────── */}
      {exportOpen && (
        <ExportModal tracks={tracks} onClose={() => setExportOpen(false)} />
      )}
    </div>
  )
}
