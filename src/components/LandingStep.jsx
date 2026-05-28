import { useState, useRef } from 'react'
import { useCobalt } from '../hooks/useCobalt'

const YT_RE = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/

export default function LandingStep({ onTrackLoaded }) {
  const [url, setUrl] = useState('')
  const fileInputRef = useRef(null)
  const { status, error, loadTrack, loadFromFile } = useCobalt()

  const isLoading = status === 'loading'

  const handleLoad = async () => {
    if (!url.trim()) return
    if (!YT_RE.test(url.trim())) {
      // Let the API try anyway — it may support other platforms
    }
    try {
      const info = await loadTrack(url.trim())
      onTrackLoaded(info)
    } catch {
      // error state handled by hook
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleLoad()
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const info = loadFromFile(file)
    onTrackLoaded(info)
  }

  return (
    <div className="landing-wrap">
      <div className="landing-hero">
        <h1 className="hero-title">
          Paste a link.<br />
          Hit record.<br />
          <span className="highlight">Go viral.</span>
        </h1>
        <p className="hero-sub">
          線上虛擬錄音室，為 Reels / Shorts / TikTok Cover 打造
        </p>
      </div>

      <div className="landing-panel panel">
        <div className="panel-header">
          <span className="panel-title">TRACK INPUT</span>
          <span className="badge badge-gray">
            <span className="badge-dot" />
            STANDBY
          </span>
        </div>
        <div className="panel-body">
          <div className="url-input-wrap">
            <div className="url-prefix">YT URL</div>
            <input
              className="input-field"
              type="url"
              placeholder="https://youtube.com/watch?v=..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              autoFocus
            />
            <button
              className="btn btn-primary"
              onClick={handleLoad}
              disabled={isLoading || !url.trim()}
            >
              {isLoading ? (
                <>
                  <div className="spinner" />
                  LOADING…
                </>
              ) : (
                'LOAD ▶'
              )}
            </button>
          </div>

          <div className={`url-status ${error ? 'error' : isLoading ? 'loading' : ''}`}>
            {isLoading && <><div className="spinner" /><span>解析音訊中，請稍候…</span></>}
            {error && <span>⚠ {error}</span>}
          </div>

          <div className="upload-fallback">
            <span>或直接上傳音樂檔：</span>
            <label>
              選擇檔案 (MP3 / WAV / OGG…)
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                onChange={handleFileChange}
              />
            </label>
          </div>
        </div>
      </div>

      <div className="how-it-works">
        {[
          { icon: '🔗', desc: '貼上 YouTube 連結，自動抓取音訊' },
          { icon: '🎧', desc: '戴上耳機，一邊聽音樂一邊錄影' },
          { icon: '🎛️', desc: '瀏覽器本地合成，零上傳' },
          { icon: '📤', desc: '微調對嘴後直接下載發布' },
        ].map(({ icon, desc }, i) => (
          <div className="how-step" key={i}>
            <div className="step-num">{icon}</div>
            <div className="step-desc">{desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
