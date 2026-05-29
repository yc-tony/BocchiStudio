import { useState, useCallback, useRef } from 'react'

// ── Plugin catalogue ──────────────────────────────────────────────────────────

// Built-in browser effects — free, implemented via Web Audio API, no auth required.
export const BUILTIN_EFFECTS = [
  { type: 'gain',       label: 'GAIN',   icon: '▲' },
  { type: 'compressor', label: 'COMP',   icon: '◈' },
  { type: 'eq3',        label: 'EQ 3B',  icon: '≡' },
  { type: 'reverb',     label: 'REVERB', icon: '〜' },
]

// Bocchi Store plugins — DRM-locked. A store plugin slot always passes audio through
// unchanged until the user owns a license. The `locked` flag is the extension point:
// replace the static `true` with a real license-check call (e.g. checkLicense(id, userId))
// when the payment system is wired up.
export const STORE_PLUGINS = [
  { type: 'store', id: 'bocchi_vintage_verb',  name: 'Vintage Reverb',  category: 'Ambience',   locked: true },
  { type: 'store', id: 'bocchi_tube_preamp',   name: 'Tube Preamp',     category: 'Saturation', locked: true },
  { type: 'store', id: 'bocchi_vox_enhancer',  name: 'Vocal Enhancer',  category: 'Dynamics',   locked: true },
  { type: 'store', id: 'bocchi_stereo_width',  name: 'Stereo Width',    category: 'Imaging',    locked: true },
]

// ── Default parameters ────────────────────────────────────────────────────────

function defaultParams(type) {
  switch (type) {
    case 'gain':       return { gain: 1.0 }
    case 'compressor': return { threshold: -24, ratio: 4 }
    case 'eq3':        return { low: 0, mid: 0, high: 0 }
    case 'reverb':     return { wet: 0.25 }
    default:           return {}
  }
}

// ── Web Audio node factory ────────────────────────────────────────────────────

// Creates a Web Audio subgraph for one plugin slot.
// Returns { input, output, rawNodes } where rawNodes lists all created nodes
// so they can be individually disconnected on teardown or updated for live params.
export function buildPluginNode(ctx, plugin) {
  // Bypassed or locked store plugin → silent passthrough
  if (!plugin.enabled || plugin.type === 'store') {
    const n = ctx.createGain()
    return { input: n, output: n, rawNodes: [n] }
  }

  switch (plugin.type) {
    case 'gain': {
      const n = ctx.createGain()
      n.gain.value = plugin.params.gain ?? 1.0
      return { input: n, output: n, rawNodes: [n] }
    }

    case 'compressor': {
      const n = ctx.createDynamicsCompressor()
      n.threshold.value = plugin.params.threshold ?? -24
      n.ratio.value     = plugin.params.ratio ?? 4
      n.attack.value    = 0.003
      n.release.value   = 0.25
      return { input: n, output: n, rawNodes: [n] }
    }

    case 'eq3': {
      const lo  = ctx.createBiquadFilter()
      lo.type = 'lowshelf'; lo.frequency.value = 200; lo.gain.value = plugin.params.low ?? 0
      const mid = ctx.createBiquadFilter()
      mid.type = 'peaking'; mid.frequency.value = 1000; mid.gain.value = plugin.params.mid ?? 0
      const hi  = ctx.createBiquadFilter()
      hi.type = 'highshelf'; hi.frequency.value = 4000; hi.gain.value = plugin.params.high ?? 0
      lo.connect(mid); mid.connect(hi)
      return { input: lo, output: hi, rawNodes: [lo, mid, hi] }
    }

    case 'reverb': {
      const wet = plugin.params.wet ?? 0.25
      const inp  = ctx.createGain()
      const dry  = ctx.createGain(); dry.gain.value  = 1 - wet
      const wetG = ctx.createGain(); wetG.gain.value = wet
      const conv = ctx.createConvolver()
      const out  = ctx.createGain()
      // Synthetic impulse response: exponentially-decaying white noise (2 s)
      const len = ctx.sampleRate * 2
      const buf = ctx.createBuffer(2, len, ctx.sampleRate)
      for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c)
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3)
      }
      conv.buffer = buf
      inp.connect(dry); dry.connect(out)
      inp.connect(conv); conv.connect(wetG); wetG.connect(out)
      return { input: inp, output: out, rawNodes: [inp, dry, wetG, conv, out] }
    }

    default: {
      const n = ctx.createGain()
      return { input: n, output: n, rawNodes: [n] }
    }
  }
}

// ── Chain wiring helpers ──────────────────────────────────────────────────────

// Connects source → plugin chain → dest.
// Returns nodeMap: { [pluginId]: { input, output, rawNodes } } for live param updates.
export function buildAndConnectChain(ctx, source, plugins, dest) {
  const nodeMap = {}

  if (!plugins.length) {
    source.connect(dest)
    return nodeMap
  }

  const built = plugins.map((p) => {
    const node = buildPluginNode(ctx, p)
    nodeMap[p.id] = node
    return node
  })

  source.connect(built[0].input)
  for (let i = 0; i < built.length - 1; i++) built[i].output.connect(built[i + 1].input)
  built[built.length - 1].output.connect(dest)

  return nodeMap
}

// Disconnects source and all plugin nodes so buildAndConnectChain can start fresh.
export function teardownChain(source, nodeMap) {
  try { source.disconnect() } catch {}
  for (const { rawNodes } of Object.values(nodeMap)) {
    for (const n of rawNodes) { try { n.disconnect() } catch {} }
  }
}

// Updates a single AudioParam directly on a live node — avoids a full chain rebuild
// (and the brief audio glitch that comes with it) for knob-dragging scenarios.
// Returns false if the param can't be updated live (caller should rebuild instead).
export function updateLiveParam(nodeMap, plugin, key, value) {
  const entry = nodeMap[plugin.id]
  if (!entry) return false

  switch (plugin.type) {
    case 'gain':
      entry.rawNodes[0].gain.value = value
      return true
    case 'compressor': {
      const comp = entry.rawNodes[0]
      if (key === 'threshold') { comp.threshold.value = value; return true }
      if (key === 'ratio')     { comp.ratio.value     = value; return true }
      return false
    }
    case 'eq3': {
      const [lo, mid, hi] = entry.rawNodes
      if (key === 'low')  { lo.gain.value  = value; return true }
      if (key === 'mid')  { mid.gain.value = value; return true }
      if (key === 'high') { hi.gain.value  = value; return true }
      return false
    }
    // Reverb wet-mix change requires new convolver routing — fall back to rebuild
    default: return false
  }
}

// ── State hook ────────────────────────────────────────────────────────────────

// Manages plugin list state for one DAW track.
// Audio graph wiring is handled separately in StudioStep to keep hooks pure.
export function usePluginChain() {
  const [plugins, setPlugins] = useState([])
  const idRef = useRef(1)

  const addPlugin = useCallback((type, extraProps = {}) =>
    setPlugins((prev) => [...prev, {
      id: idRef.current++,
      type,
      label: BUILTIN_EFFECTS.find((e) => e.type === type)?.label ?? (extraProps.name ?? type.toUpperCase()),
      params: defaultParams(type),
      enabled: true,
      ...extraProps,
    }]), [])

  const removePlugin = useCallback((id) =>
    setPlugins((prev) => prev.filter((p) => p.id !== id)), [])

  const togglePlugin = useCallback((id) =>
    setPlugins((prev) => prev.map((p) => p.id === id ? { ...p, enabled: !p.enabled } : p)), [])

  const updateParam = useCallback((id, key, val) =>
    setPlugins((prev) => prev.map((p) => p.id === id ? { ...p, params: { ...p.params, [key]: val } } : p)), [])

  return { plugins, addPlugin, removePlugin, togglePlugin, updateParam }
}
