import { useState, useCallback } from 'react'
import LandingStep from './components/LandingStep'
import StudioStep from './components/StudioStep'
import ExportStep from './components/ExportStep'

const STEPS = ['LOAD', 'REC', 'EXPORT']

export default function App() {
  const [step, setStep] = useState(0) // 0=landing, 1=studio, 2=export
  const [trackInfo, setTrackInfo] = useState(null) // { blob, title, objectUrl }
  const [recordedBlob, setRecordedBlob] = useState(null)

  const handleTrackLoaded = useCallback((info) => {
    setTrackInfo(info)
    setStep(1)
  }, [])

  const handleRecordingComplete = useCallback((blob) => {
    setRecordedBlob(blob)
    setStep(2)
  }, [])

  const handleReset = useCallback(() => {
    if (trackInfo?.objectUrl) URL.revokeObjectURL(trackInfo.objectUrl)
    if (recordedBlob) URL.revokeObjectURL(recordedBlob)
    setTrackInfo(null)
    setRecordedBlob(null)
    setStep(0)
  }, [trackInfo, recordedBlob])

  const handleBackToStudio = useCallback(() => {
    setRecordedBlob(null)
    setStep(1)
  }, [])

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <div className="logo-screws">
            <span className="screw" />
            <span className="screw" />
          </div>
          <div className="logo-text">
            <span className="logo-main">BOCCHI STUDIO</span>
            <span className="logo-sub">Virtual Cover Studio · v1.0</span>
          </div>
        </div>

        <div className="step-indicator">
          {STEPS.map((label, i) => (
            <div key={label} className={`step-node ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}>
              <div className="step-dot">{i < step ? '✓' : i + 1}</div>
              <div className="step-label">{label}</div>
              {i < STEPS.length - 1 && <div className="step-line" />}
            </div>
          ))}
        </div>

        <div className="header-right">
          <div className="power-led active" title="System Online" />
          <span className="header-status">ONLINE</span>
        </div>
      </header>

      <main className="app-main">
        {step === 0 && <LandingStep onTrackLoaded={handleTrackLoaded} />}
        {step === 1 && (
          <StudioStep
            trackInfo={trackInfo}
            onRecordingComplete={handleRecordingComplete}
            onReset={handleReset}
          />
        )}
        {step === 2 && (
          <ExportStep
            trackInfo={trackInfo}
            recordedBlob={recordedBlob}
            onBack={handleBackToStudio}
            onReset={handleReset}
          />
        )}
      </main>

      <footer className="app-footer">
        <span>© 2025 Bocchi Studio</span>
        <span className="footer-divider">|</span>
        <span>All processing is done locally on your device. No uploads. No storage costs.</span>
      </footer>
    </div>
  )
}
