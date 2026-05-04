import React, { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Show, SignInButton, SignUpButton } from '@clerk/react'

import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Overview from './pages/Overview'
import Upload from './pages/Upload'
import { Reports } from './pages/Reports'
import LiveMonitoring from './pages/LiveMonitoring'
import BlockedIPs from './pages/BlockedIPs'
import DatasetComparison from './pages/DatasetComparison'

function SplashScreen({ onComplete }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete()
    }, 2800)
    return () => clearTimeout(timer)
  }, [onComplete])

  return (
    <div className="splash-container">
      <div className="splash-radar"></div>
      <div className="splash-text">AI Threat Engine</div>
      <div className="splash-subtext">Initializing neural networks...</div>
      <div className="splash-progress">
        <div className="splash-progress-bar"></div>
      </div>
    </div>
  )
}

function AuthPage() {
  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-radar"></div>
        </div>
        <h1 className="auth-title">ai-ids</h1>
        <p className="auth-subtitle">Secure access to your threat intelligence platform</p>
        <div className="auth-buttons">
          <SignInButton mode="modal">
            <button className="auth-btn-primary" id="sign-in-btn">Sign In</button>
          </SignInButton>
          <SignUpButton mode="modal">
            <button className="auth-btn-secondary" id="sign-up-btn">Create Account</button>
          </SignUpButton>
        </div>
        <p className="auth-footer">AI-powered network intrusion detection system</p>
      </div>
    </div>
  )
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true)

  if (showSplash) {
    return <SplashScreen onComplete={() => setShowSplash(false)} />
  }

  return (
    <BrowserRouter>
      <Show when="signed-out">
        <AuthPage />
      </Show>
      <Show when="signed-in">
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/overview" element={<Overview />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/monitoring" element={<LiveMonitoring />} />
            <Route path="/blocked" element={<BlockedIPs />} />
            <Route path="/comparison" element={<DatasetComparison />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Show>
    </BrowserRouter>
  )
}

