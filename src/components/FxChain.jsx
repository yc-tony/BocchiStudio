import { useState } from 'react'
import { BUILTIN_EFFECTS, STORE_PLUGINS } from '../hooks/usePluginChain'

// ── Single plugin slot ────────────────────────────────────────────────────────

function ParamRow({ label, min, max, step, value, display, onChange }) {
  return (
    <div className="fx-param-row">
      <span className="fx-param-label">{label}</span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="fx-param-val">{display}</span>
    </div>
  )
}

function fmtDb(v) {
  return `${v > 0 ? '+' : ''}${Number(v).toFixed(1)}dB`
}

function PluginSlot({ plugin, onRemove, onToggle, onUpdateParam }) {
  const [open, setOpen] = useState(false)

  // Locked store plugin — shows DRM badge and purchase CTA
  if (plugin.type === 'store') {
    return (
      <div className="fx-slot fx-slot--store">
        <div className="fx-slot-head">
          <span className="fx-slot-lock">🔒</span>
          <span className="fx-slot-name">{plugin.name ?? plugin.label}</span>
          <button
            className="fx-slot-remove"
            onClick={() => onRemove(plugin.id)}
            title="Remove"
          >✕</button>
        </div>
        <div className="fx-slot-locked-cta">購買解鎖 · Bocchi Store</div>
      </div>
    )
  }

  return (
    <div className={`fx-slot ${plugin.enabled ? 'fx-slot--on' : 'fx-slot--bypassed'}`}>
      <div className="fx-slot-head" onClick={() => setOpen((o) => !o)}>
        <button
          className={`fx-bypass-btn ${plugin.enabled ? 'on' : ''}`}
          onClick={(e) => { e.stopPropagation(); onToggle(plugin.id) }}
          title={plugin.enabled ? 'Bypass' : 'Enable'}
        >
          {plugin.enabled ? '●' : '○'}
        </button>
        <span className="fx-slot-name">{plugin.label}</span>
        <span className="fx-slot-chevron">{open ? '▲' : '▼'}</span>
        <button
          className="fx-slot-remove"
          onClick={(e) => { e.stopPropagation(); onRemove(plugin.id) }}
          title="Remove"
        >✕</button>
      </div>

      {open && (
        <div className="fx-slot-params">
          {plugin.type === 'gain' && (
            <ParamRow
              label="GAIN" min={0} max={2} step={0.01}
              value={plugin.params.gain}
              display={`${Math.round(plugin.params.gain * 100)}%`}
              onChange={(v) => onUpdateParam(plugin.id, 'gain', v)}
            />
          )}

          {plugin.type === 'compressor' && <>
            <ParamRow
              label="THR" min={-60} max={0} step={1}
              value={plugin.params.threshold}
              display={`${plugin.params.threshold}dB`}
              onChange={(v) => onUpdateParam(plugin.id, 'threshold', v)}
            />
            <ParamRow
              label="RATIO" min={1} max={20} step={0.5}
              value={plugin.params.ratio}
              display={`${plugin.params.ratio}:1`}
              onChange={(v) => onUpdateParam(plugin.id, 'ratio', v)}
            />
          </>}

          {plugin.type === 'eq3' && <>
            <ParamRow
              label="LO" min={-12} max={12} step={0.5}
              value={plugin.params.low}
              display={fmtDb(plugin.params.low)}
              onChange={(v) => onUpdateParam(plugin.id, 'low', v)}
            />
            <ParamRow
              label="MID" min={-12} max={12} step={0.5}
              value={plugin.params.mid}
              display={fmtDb(plugin.params.mid)}
              onChange={(v) => onUpdateParam(plugin.id, 'mid', v)}
            />
            <ParamRow
              label="HI" min={-12} max={12} step={0.5}
              value={plugin.params.high}
              display={fmtDb(plugin.params.high)}
              onChange={(v) => onUpdateParam(plugin.id, 'high', v)}
            />
          </>}

          {plugin.type === 'reverb' && (
            <ParamRow
              label="WET" min={0} max={1} step={0.01}
              value={plugin.params.wet}
              display={`${Math.round(plugin.params.wet * 100)}%`}
              onChange={(v) => onUpdateParam(plugin.id, 'wet', v)}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ── FX Chain container ────────────────────────────────────────────────────────

// Renders the full FX chain for one DAW track:
//   • Plugin slots (built-in or store/locked)
//   • "ADD FX" dropdown — Web FX (free), Local VST2 (desktop bridge, coming soon),
//     Bocchi Store (locked until purchased)
export default function FxChain({ plugins, onAdd, onRemove, onToggle, onUpdateParam }) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="fx-chain">
      <div className="fx-chain-header">
        <span className="fx-chain-label">FX CHAIN</span>
        <div className="fx-add-wrap">
          <button
            className="btn btn-sm btn-ghost fx-add-btn"
            onClick={() => setMenuOpen((o) => !o)}
          >
            + ADD FX
          </button>

          {menuOpen && (
            // Close menu when pointer leaves to avoid orphaned dropdowns
            <div className="fx-add-menu" onMouseLeave={() => setMenuOpen(false)}>
              <div className="fx-menu-group">WEB FX · FREE</div>
              {BUILTIN_EFFECTS.map((e) => (
                <button
                  key={e.type}
                  className="fx-menu-item"
                  onClick={() => { onAdd(e.type); setMenuOpen(false) }}
                >
                  <span className="fx-menu-icon">{e.icon}</span> {e.label}
                </button>
              ))}

              {/* VST2: local binary plugins cannot run in a browser — requires the
                  Bocchi Desktop Bridge app (planned), which will expose a WebSocket
                  server that proxies VST2 I/O into the Web Audio graph. */}
              <div className="fx-menu-group">LOCAL VST2</div>
              <button className="fx-menu-item fx-menu-item--disabled" disabled>
                📁 Load VST2 File… <span className="fx-menu-badge">Desktop App Only</span>
              </button>

              <div className="fx-menu-group">BOCCHI STORE 🔒</div>
              {STORE_PLUGINS.map((p) => (
                <button
                  key={p.id}
                  className="fx-menu-item fx-menu-item--store"
                  onClick={() => { onAdd('store', { id: p.id, name: p.name, locked: true }); setMenuOpen(false) }}
                >
                  🔒 {p.name}
                  <span className="fx-store-cat">{p.category}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="fx-chain-slots">
        {plugins.length === 0 && (
          <span className="fx-empty-hint">No FX — click + ADD FX to insert</span>
        )}
        {plugins.map((p) => (
          <PluginSlot
            key={p.id}
            plugin={p}
            onRemove={onRemove}
            onToggle={onToggle}
            onUpdateParam={onUpdateParam}
          />
        ))}
      </div>
    </div>
  )
}
