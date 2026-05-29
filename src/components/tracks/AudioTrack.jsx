import { useRef, useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import {
  usePluginChain,
  buildAndConnectChain,
  teardownChain,
  updateLiveParam,
} from '../../hooks/usePluginChain'
import VUMeter from '../VUMeter'
import FxChain from '../FxChain'
import TrackTimeline from '../TrackTimeline'

const AudioTrack = forwardRef(function AudioTrack(
  { track, onUpdate, onRemove, onDurationChange, position, tState },
  ref,
) {
  const [level, setLevel]       = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const [fxOpen, setFxOpen]     = useState(false)
  const [muted, setMuted]       = useState(false)
  const mutedRef = useRef(false)

  const audioObjRef  = useRef(null)
  const ctxRef       = useRef(null)
  const srcRef       = useRef(null)
  const analyserRef  = useRef(null)
  const nodeMapRef   = useRef({})
  const rafRef       = useRef(null)

  const fx    = usePluginChain()
  const fxRef = useRef([])
  fxRef.current = fx.plugins

  // ── Transport interface ───────────────────────────────────────
  useImperativeHandle(ref, () => ({
    getType:     () => 'audio',
    transportPlay(fromTime) {
      if (mutedRef.current || !audioObjRef.current || !track.objectUrl) return
      audioObjRef.current.currentTime = fromTime
      ctxRef.current?.resume()
      audioObjRef.current.play().catch(() => {})
    },
    transportStop() {
      if (!audioObjRef.current) return
      audioObjRef.current.pause()
      audioObjRef.current.currentTime = 0
    },
    transportSeek(time) {
      if (!audioObjRef.current) return
      audioObjRef.current.currentTime = time
    },
    transportStartRecord() { /* audio tracks don't record */ },
    transportStopRecord()  { /* audio tracks don't record */ },
    getDuration() { return audioObjRef.current?.duration || 0 },
  }), [track.objectUrl])

  // ── AudioContext setup — fresh Audio() per file URL ───────────
  // Uses `new Audio()` instead of a JSX <audio> to avoid
  // "createMediaElementSource already connected" errors from React DOM reuse.
  useEffect(() => {
    if (!track.objectUrl) return

    const audio = new Audio(track.objectUrl)
    audio.volume = track.volume ?? 0.8
    audio.muted  = mutedRef.current
    audioObjRef.current = audio

    const ctx = new AudioContext()
    ctxRef.current = ctx
    const src = ctx.createMediaElementSource(audio)
    srcRef.current = src
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    analyserRef.current = analyser
    analyser.connect(ctx.destination)

    nodeMapRef.current = buildAndConnectChain(ctx, src, fxRef.current, analyser)

    audio.addEventListener('loadedmetadata', () => {
      onDurationChange(track.id, audio.duration)
    })

    const data = new Uint8Array(analyser.frequencyBinCount)
    const tick = () => {
      analyser.getByteFrequencyData(data)
      const rms = Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length) / 128
      setLevel(Math.min(1, rms * 2))
      rafRef.current = requestAnimationFrame(tick)
    }
    tick()

    return () => {
      cancelAnimationFrame(rafRef.current)
      audio.pause()
      ctx.close()
      audioObjRef.current = null
      ctxRef.current      = null
      srcRef.current      = null
      analyserRef.current = null
      nodeMapRef.current  = {}
    }
  }, [track.objectUrl]) // eslint-disable-line

  useEffect(() => {
    const ctx = ctxRef.current, src = srcRef.current, analyser = analyserRef.current
    if (!ctx || !src || !analyser) return
    teardownChain(src, nodeMapRef.current)
    nodeMapRef.current = buildAndConnectChain(ctx, src, fx.plugins, analyser)
  }, [fx.plugins, track.objectUrl]) // eslint-disable-line

  useEffect(() => {
    if (audioObjRef.current) audioObjRef.current.volume = track.volume ?? 0.8
  }, [track.volume])

  const handleFile = (file) => {
    if (!file?.type.startsWith('audio/')) return
    onUpdate(track.id, {
      blob: file,
      objectUrl: URL.createObjectURL(file),
      name: file.name.replace(/\.\w+$/, ''),
    })
  }

  const handleParamUpdate = useCallback((id, key, val) => {
    fx.updateParam(id, key, val)
    const plugin = fxRef.current.find((p) => p.id === id)
    if (plugin) updateLiveParam(nodeMapRef.current, plugin, key, val)
  }, [fx.updateParam]) // eslint-disable-line

  const toggleMute = () => {
    const next = !mutedRef.current
    mutedRef.current = next
    setMuted(next)
    if (audioObjRef.current) audioObjRef.current.muted = next
  }

  const duration = audioObjRef.current?.duration || 0

  return (
    <div className={`track-lane ${dragOver ? 'track-lane--drag' : ''} ${muted ? 'track-lane--muted' : ''}`}>
      <div className="track-lane-head">
        <div className="track-label">
          <span className="track-type-dot track-type-dot--audio" />
          <span className="track-name">{track.name}</span>
        </div>

        <div className="track-content">
          {!track.objectUrl ? (
            <div
              className="track-dropzone"
              onClick={() => document.getElementById(`af-${track.id}`)?.click()}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]) }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
            >
              拖曳音訊至此，或點擊上傳
              <input
                id={`af-${track.id}`} type="file" accept="audio/*"
                style={{ display: 'none' }}
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </div>
          ) : (
            <>
              <VUMeter level={muted ? 0 : level} bars={14} />
              <span className="track-filename">{track.name}</span>
              <div className="track-vol-row">
                <span className="track-vol-label">VOL</span>
                <input
                  type="range" min="0" max="1" step="0.01"
                  value={track.volume ?? 0.8}
                  onChange={(e) => onUpdate(track.id, { volume: Number(e.target.value) })}
                />
                <span className="track-vol-val">{Math.round((track.volume ?? 0.8) * 100)}%</span>
              </div>
            </>
          )}
        </div>

        <div className="track-end-btns">
          <button
            className={`btn btn-sm btn-ghost mute-btn ${muted ? 'mute-btn--on' : ''}`}
            onClick={toggleMute}
            title={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? '🔇' : 'M'}
          </button>
          <button
            className={`btn btn-sm btn-ghost ${fxOpen ? 'btn-ghost--active' : ''}`}
            onClick={() => setFxOpen((o) => !o)}
          >
            FX
          </button>
          <button className="track-remove-btn" onClick={() => onRemove(track.id)}>✕</button>
        </div>
      </div>

      {/* Timeline / scrubber */}
      {track.objectUrl && (
        <TrackTimeline
          position={position}
          duration={duration}
          isRecording={false}
          onSeek={(t) => {
            if (audioObjRef.current) audioObjRef.current.currentTime = t
          }}
        />
      )}

      {fxOpen && (
        <div className="track-fx-panel">
          <FxChain
            plugins={fx.plugins}
            onAdd={fx.addPlugin}
            onRemove={fx.removePlugin}
            onToggle={fx.togglePlugin}
            onUpdateParam={handleParamUpdate}
          />
        </div>
      )}
    </div>
  )
})

export default AudioTrack
