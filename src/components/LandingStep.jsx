import { useRef } from 'react'
import { useAudioFile } from '../hooks/useAudioFile'

export default function LandingStep({ onTrackLoaded }) {
  const fileInputRef = useRef(null)
  const { loadFromFile } = useAudioFile()

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    onTrackLoaded(loadFromFile(file))
  }

  const handleDrop = (e) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file && file.type.startsWith('audio/')) onTrackLoaded(loadFromFile(file))
  }

  return (
    <div className="landing-wrap">
      <div className="landing-hero">
        <h1 className="hero-title">
          Upload your track.<br />
          Hit record.<br />
          <span className="highlight">Go viral.</span>
        </h1>
        <p className="hero-sub">
          瀏覽器內輕量化 DAW，為 Reels / Shorts / TikTok Cover 打造
        </p>
      </div>

      <div className="landing-panel panel">
        <div className="panel-header">
          <span className="panel-title">LOAD BACKING TRACK</span>
          <span className="badge badge-gray">
            <span className="badge-dot" />
            STANDBY
          </span>
        </div>
        <div className="panel-body">
          {/* Drag-and-drop or click to pick */}
          <div
            className="upload-zone"
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
          >
            <div className="upload-icon">🎵</div>
            <div className="upload-main">點擊或拖曳音樂檔案至此</div>
            <div className="upload-hint">MP3 · WAV · OGG · FLAC — 所有處理在本地端完成，零上傳</div>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
          </div>
        </div>
      </div>

      <div className="how-it-works">
        {[
          { icon: '🎵', desc: '上傳伴奏音樂檔案' },
          { icon: '🎛', desc: '掛載 FX 插件或前往商城購買' },
          { icon: '📷', desc: '戴耳機，錄音錄影同步' },
          { icon: '📤', desc: '本地合成後下載發布' },
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
