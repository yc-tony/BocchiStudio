import { useState, useEffect } from 'react'
import { useFFmpegMerge, EXPORT_FORMATS } from '../hooks/useFFmpegMerge'

export default function ExportModal({ tracks, onClose }) {
  const [format, setFormat]       = useState('mp4')
  const [offset, setOffset]       = useState(0)
  const [outputUrl, setOutputUrl] = useState(null)
  const [outputExt, setOutputExt] = useState('mp4')

  const { merging, progress, log, error, merge, ensureLoaded, loading: ffLoading } = useFFmpegMerge()

  // Locate available source blobs across all tracks
  const cameraTrack = tracks.find((t) => t.type === 'camera'    && t.recordedBlob)
  const recTrack    = tracks.find((t) => t.type === 'recording' && t.recordedBlob)
  const audioTrack  = tracks.find((t) => t.type === 'audio'     && t.blob)

  const hasCamera = !!cameraTrack
  const hasMic    = !!recTrack
  const hasBgm    = !!audioTrack

  // Can export as long as something was recorded
  const canExport = hasCamera || hasMic

  const selectedFmt = EXPORT_FORMATS.find((f) => f.id === format) ?? EXPORT_FORMATS[0]

  // Pre-warm FFmpeg in background
  useEffect(() => { ensureLoaded().catch(() => {}) }, []) // eslint-disable-line

  const handleExport = async () => {
    if (!canExport || selectedFmt.locked) return
    try {
      const blob = await merge({
        videoBlob:    cameraTrack?.recordedBlob ?? null,
        micBlob:      recTrack?.recordedBlob    ?? null,
        audioBlob:    audioTrack?.blob          ?? null,
        syncOffsetMs: offset,
        format,
      })
      if (outputUrl) URL.revokeObjectURL(outputUrl)
      setOutputUrl(URL.createObjectURL(blob))
      setOutputExt(selectedFmt.ext)
    } catch {
      // error displayed via hook state
    }
  }

  const handleDownload = () => {
    if (!outputUrl) return
    const a = document.createElement('a')
    a.href = outputUrl
    a.download = `bocchi-cover-${Date.now()}.${outputExt}`
    a.click()
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">EXPORT</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {/* Source status */}
          {!canExport ? (
            <div className="export-warn">
              <div>⚠ 尚未錄製任何內容（先在 Recording Track 或 Camera Track 錄製）</div>
            </div>
          ) : (
            <div className="export-warn" style={{ background: 'rgba(74,122,90,0.07)', borderColor: 'rgba(74,122,90,0.25)', color: 'var(--green)' }}>
              {hasCamera && <div>✓ 攝影機畫面（Camera Track）</div>}
              {hasMic    && <div>✓ 麥克風錄音（Recording Track）</div>}
              {hasBgm    && <div>✓ 背景音樂（Audio Track）</div>}
              {!hasBgm   && <div style={{ color: 'var(--text-label)', fontSize: '0.65rem' }}>— 未上傳背景音樂（可在 Audio Track 添加）</div>}
            </div>
          )}

          {/* Format selector */}
          <div className="export-section">
            <div className="export-section-label">OUTPUT FORMAT</div>
            <div className="format-grid">
              {EXPORT_FORMATS.map((f) => (
                <button
                  key={f.id}
                  className={`format-btn ${format === f.id ? 'format-btn--active' : ''} ${f.locked ? 'format-btn--locked' : ''}`}
                  onClick={() => !f.locked && setFormat(f.id)}
                  title={f.locked ? '需要訂閱才能解鎖' : f.desc}
                >
                  {f.locked && <span className="format-lock">🔒</span>}
                  <span className="format-label">{f.label}</span>
                  <span className="format-desc">{f.desc}</span>
                </button>
              ))}
            </div>
            {selectedFmt.locked && (
              <div className="format-locked-msg">
                🔒 {selectedFmt.label} 需要付費訂閱才能解鎖 —— <strong>升級方案</strong>
              </div>
            )}
            {!hasCamera && !selectedFmt.videoOnly && (
              <div className="format-locked-msg" style={{ background: 'rgba(64,94,128,0.05)', borderColor: 'rgba(64,94,128,0.2)', color: 'var(--text-label)' }}>
                ℹ 無攝影機畫面，{selectedFmt.label} 將輸出為純音訊。
              </div>
            )}
          </div>

          {/* Sync offset (only relevant when backing music is present) */}
          {!outputUrl && hasBgm && (
            <div className="export-section">
              <div className="export-section-label">SYNC OFFSET（背景音樂）</div>
              <div className="sync-row">
                <input
                  type="range" min="-3000" max="3000" step="50"
                  value={offset}
                  onChange={(e) => setOffset(Number(e.target.value))}
                />
                <span className="sync-val">
                  {offset === 0 ? '0 ms' : `${offset > 0 ? '+' : ''}${offset} ms`}
                </span>
              </div>
              <div className="sync-hint">負值 = 音樂提早；正值 = 音樂延後</div>
            </div>
          )}

          {/* Progress */}
          {(merging || ffLoading) && (
            <div className="export-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: 4 }}>
                <span>{ffLoading ? '載入 FFmpeg.wasm…' : 'Processing…'}</span>
                <span>{progress}%</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {log && (
            <div className="ffmpeg-log">{log.trim().split('\n').slice(-3).join('\n')}</div>
          )}

          {error && (
            <div className="export-error">⚠ {error}</div>
          )}

          {/* Actions */}
          <div className="export-actions">
            {!outputUrl ? (
              <button
                className="btn btn-primary btn-lg"
                onClick={handleExport}
                disabled={!canExport || merging || ffLoading || selectedFmt.locked}
              >
                {merging ? <><div className="spinner" /> PROCESSING…</> : `⚡ EXPORT ${selectedFmt.label}`}
              </button>
            ) : (
              <button className="btn btn-primary btn-lg" onClick={handleDownload}>
                ⬇ DOWNLOAD (.{outputExt})
              </button>
            )}
            <button className="btn btn-ghost" onClick={onClose}>取消</button>
          </div>

          {/* AI upsell */}
          <div className="ai-upsell">
            <div className="ai-upsell-left">
              <div className="ai-upsell-title">✨ AI 樂器分離（即將推出）</div>
              <div className="ai-upsell-desc">
                想消除原曲中的吉他聲，只留人聲和鼓聲？<br />
                使用 AI Demucs 拆成獨立軌道，自由搭配伴奏。<br />
                <strong>NT$30/首 或 NT$150/月（20 首）</strong>
              </div>
            </div>
            <button className="btn btn-purple" disabled>🔒 解鎖 AI 功能</button>
          </div>
        </div>
      </div>
    </div>
  )
}
