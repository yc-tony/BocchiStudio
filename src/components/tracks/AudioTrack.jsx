import { useRef, useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import {
  usePluginChain,
  buildAndConnectChain,
  teardownChain,
  updateLiveParam,
} from '../../hooks/usePluginChain'
import VUMeter from '../VUMeter'
import FxChain from '../FxChain'

const AudioTrack = forwardRef(function AudioTrack({ track, onUpdate, onRemove }, ref) {
  const [playing, setPlaying]   = useState(false)
  const [level, setLevel]       = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const [fxOpen, setFxOpen]     = useState(false)

  // Using new Audio() (not a JSX <audio> element) avoids the
  // "createMediaElementSource: already connected to a different MediaElementSourceNode" error
  // that occurs when React reuses the same DOM node across re-renders.
  const audioObjRef  = useRef(null)
  const ctxRef       = useRef(null)
  const srcRef       = useRef(null)
  const analyserRef  = useRef(null)
  const nodeMapRef   = useRef({})
  const rafRef       = useRef(null)

  const fx = usePluginChain()
  const fxRef = useRef([])
  fxRef.current = fx.plugins

  // Expose play/stop so DAWPage can start all audio tracks in sync with recording
  useImperativeHandle(ref, () => ({
    play() {
      if (!audioObjRef.current || !track.objectUrl) return
      audioObjRef.current.currentTime = 0
      ctxRef.current?.resume()
      audioObjRef.current.play().then(() => setPlaying(true)).catch(() => {})
    },
    stop() {
      if (!audioObjRef.current) return
      audioObjRef.current.pause()
      audioObjRef.current.currentTime = 0
      setPlaying(false)
    },
  }), [track.objectUrl])

  // Create a fresh Audio + AudioContext each time the track URL changes
  useEffect(() => {
    if (!track.objectUrl) return

    const audio = new Audio(track.objectUrl)
    audio.volume = track.volume ?? 0.8
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

    const data = new Uint8Array(analyser.frequencyBinCount)
    const tick = () => {
      analyser.getByteFrequencyData(data)
      const rms = Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length) / 128
      setLevel(Math.min(1, rms * 2))
      rafRef.current = requestAnimationFrame(tick)
    }
    tick()
    audio.addEventListener('ended', () => setPlaying(false))

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

  // Rewire FX chain whenever plugins are added/removed/bypassed
  useEffect(() => {
    const ctx = ctxRef.current, src = srcRef.current, analyser = analyserRef.current
    if (!ctx || !src || !analyser) return
    teardownChain(src, nodeMapRef.current)
    nodeMapRef.current = buildAndConnectChain(ctx, src, fx.plugins, analyser)
  }, [fx.plugins, track.objectUrl]) // eslint-disable-line

  // Keep Audio volume in sync with slider
  useEffect(() => {
    if (audioObjRef.current) audioObjRef.current.volume = track.volume ?? 0.8
  }, [track.volume])

  const handleFile = (file) => {
    if (!file?.type.startsWith('audio/')) return
    setPlaying(false)
    onUpdate(track.id, {
      blob: file,
      objectUrl: URL.createObjectURL(file),
      name: file.name.replace(/\.\w+$/, ''),
    })
  }

  const togglePlay = () => {
    const audio = audioObjRef.current
    if (!audio) return
    if (audio.paused) {
      ctxRef.current?.resume()
      audio.play().then(() => setPlaying(true)).catch(() => {})
    } else {
      audio.pause(); audio.currentTime = 0; setPlaying(false)
    }
  }

  // For param knob drags: update live AudioParam directly to avoid chain-rebuild glitches
  const handleParamUpdate = useCallback((id, key, val) => {
    fx.updateParam(id, key, val)
    const plugin = fxRef.current.find((p) => p.id === id)
    if (plugin) updateLiveParam(nodeMapRef.current, plugin, key, val)
  }, [fx.updateParam]) // eslint-disable-line

  return (
    <div className={`track-lane ${dragOver ? 'track-lane--drag' : ''}`}>
      <div className="track-lane-head">

        <div className="track-label">
          <span className="track-type-icon">🎵</span>
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
              <button className="btn btn-sm btn-ghost track-play-btn" onClick={togglePlay}>
                {playing ? '⏸' : '▶'}
              </button>
              <span className="track-filename">{track.name}</span>
              <VUMeter level={level} bars={14} />
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
            className={`btn btn-sm btn-ghost ${fxOpen ? 'btn-ghost--active' : ''}`}
            onClick={() => setFxOpen((o) => !o)}
          >
            FX {fxOpen ? '▲' : '▼'}
          </button>
          <button className="track-remove-btn" onClick={() => onRemove(track.id)} title="Remove Track">✕</button>
        </div>
      </div>

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
