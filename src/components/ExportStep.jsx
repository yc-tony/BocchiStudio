import { useState, useRef, useEffect } from 'react'
import { useFFmpegMerge } from '../hooks/useFFmpegMerge'

export default function ExportStep({ trackInfo, recordedBlob, onBack, onReset }) {
  const [syncOffset, setSyncOffset] = useState(0) // ms, -3000..3000
  const [outputBlob, setOutputBlob] = useState(null)
  const [outputUrl, setOutputUrl] = useState(null)
  const previewRef = useRef(null)

  const { merging, progress, log, error, merge, ensureLoaded, loading: ffLoading } = useFFmpegMerge()

  // Pre-warm FFmpeg in background
  useEffect(() => {
    ensureLoaded().catch(() => {})
  }, []) // eslint-disable-line

  // Show recorded video in preview
  const recordedUrl = useRef(null)
  useEffect(() => {
    if (recordedBlob) {
      recordedUrl.current = URL.createObjectURL(recordedBlob)
      if (previewRef.current) {
        previewRef.current.src = recordedUrl.current
      }
    }
    return () => {
      if (recordedUrl.current) URL.revokeObjectURL(recordedUrl.current)
    }
  }, [recordedBlob])

  // Show merged video once ready
  useEffect(() => {
    if (outputBlob) {
      if (outputUrl) URL.revokeObjectURL(outputUrl)
      const url = URL.createObjectURL(outputBlob)
      setOutputUrl(url)
      if (previewRef.current) {
        previewRef.current.src = url
        previewRef.current.play().catch(() => {})
      }
    }
  }, [outputBlob]) // eslint-disable-line

  const handleExport = async () => {
    if (!recordedBlob || !trackInfo?.blob) return
    try {
      const result = await merge({
        videoBlob: recordedBlob,
        audioBlob: trackInfo.blob,
        syncOffsetMs: syncOffset,
      })
      setOutputBlob(result)
    } catch {
      // error shown in UI from hook
    }
  }

  const handleDownload = () => {
    if (!outputUrl) return
    const a = document.createElement('a')
    a.href = outputUrl
    a.download = `bocchi-cover-${Date.now()}.webm`
    a.click()
  }

  const offsetLabel = syncOffset === 0 ? '0 ms' : `${syncOffset > 0 ? '+' : ''}${syncOffset} ms`

  return (
    <div className="export-wrap">
      {/* Preview */}
      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">VIDEO PREVIEW</span>
          {outputBlob && (
            <span className="badge badge-green">
              <span className="badge-dot" />
              MERGED
            </span>
          )}
        </div>
        <div className="panel-body" style={{ padding: 12 }}>
          <div className="preview-wrap">
            <video
              ref={previewRef}
              className="preview-video"
              controls
              playsInline
              src={recordedUrl.current || ''}
            />
          </div>
        </div>
      </div>

      {/* Sync slider */}
      {!outputBlob && (
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">SYNC ADJUST</span>
            <span className="badge badge-amber">
              <span className="badge-dot" />
              FINE TUNE
            </span>
          </div>
          <div className="panel-body">
            <div className="sync-label">對嘴延遲調整</div>
            <div className="sync-row">
              <div style={{ flex: 1 }}>
                <input
                  type="range"
                  min="-3000"
                  max="3000"
                  step="50"
                  value={syncOffset}
                  onChange={(e) => setSyncOffset(Number(e.target.value))}
                />
                <div className="sync-hint">
                  負值 = 音樂提早；正值 = 音樂延後。預設 0 = 完全同步。
                </div>
              </div>
              <div className="sync-value">{offsetLabel}</div>
            </div>
          </div>
        </div>
      )}

      {/* Export controls */}
      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">EXPORT</span>
        </div>
        <div className="panel-body">
          {merging && (
            <div className="ffmpeg-progress">
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: 4 }}>
                <span>Processing…</span>
                <span>{progress}%</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
              <div className="ffmpeg-log">{log}</div>
            </div>
          )}

          {!merging && log && (
            <div className="ffmpeg-log" style={{ marginBottom: 12 }}>{log}</div>
          )}

          {error && (
            <div style={{ color: 'var(--red)', fontSize: '0.8rem', marginBottom: 12 }}>
              ⚠ {error}
            </div>
          )}

          {ffLoading && !merging && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: '0.75rem', color: 'var(--text-dim)' }}>
              <div className="spinner" />
              <span>載入 FFmpeg.wasm 中…</span>
            </div>
          )}

          <div className="export-actions">
            {!outputBlob ? (
              <button
                className="btn btn-primary btn-lg"
                onClick={handleExport}
                disabled={merging || ffLoading}
              >
                {merging ? (
                  <><div className="spinner" /> PROCESSING…</>
                ) : (
                  '⚡ EXPORT VIDEO'
                )}
              </button>
            ) : (
              <button className="btn btn-primary btn-lg" onClick={handleDownload}>
                ⬇ DOWNLOAD (.webm)
              </button>
            )}

            <button className="btn btn-ghost" onClick={onBack} disabled={merging}>
              ← 重錄
            </button>

            <button className="btn btn-ghost" onClick={onReset} disabled={merging}>
              ⟳ 全部重來
            </button>
          </div>
        </div>
      </div>

      {/* AI upsell */}
      <div className="ai-upsell">
        <div className="ai-upsell-left">
          <div className="ai-upsell-title">✨ AI 樂器分離（即將推出）</div>
          <div className="ai-upsell-desc">
            想消除原曲中的吉他聲，只留人聲和鼓聲？<br />
            使用 AI Demucs 將歌曲拆成獨立軌道，自由搭配伴奏。<br />
            <strong style={{ color: 'var(--text)' }}>單次 NT$30 / 月費方案 NT$150（20 首）</strong>
          </div>
        </div>
        <button className="btn btn-purple" disabled title="Coming soon">
          🔒 解鎖 AI 功能
        </button>
      </div>
    </div>
  )
}
