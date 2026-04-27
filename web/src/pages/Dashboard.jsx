import React, { useEffect, useState } from 'react'
import { getWsUrl, getApiBase } from '../lib/api'
import { ShieldAlert, ShieldCheck, Activity, Wifi } from 'lucide-react'

function useAlerts() {
  const [alerts, setAlerts] = useState([])
  const [status, setStatus] = useState('polling')

  const addAlerts = (newAlerts) => {
    setAlerts((prev) => {
      const existingIds = new Set(prev.map((a) => a.id))
      const filtered = newAlerts.filter((a) => !existingIds.has(a.id))
      const next = [...prev, ...filtered]
      return next.length > 200 ? next.slice(next.length - 200) : next
    })
  }

  useEffect(() => {
    let ws
    try {
      ws = new WebSocket(getWsUrl())
      ws.onopen  = () => setStatus('live')
      ws.onclose = () => setStatus('polling')
      ws.onerror = () => setStatus('polling')
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data)
          if (msg?.type === 'hello') return
          addAlerts([msg])
        } catch {}
      }
    } catch {}
    return () => { try { ws?.close() } catch {} }
  }, [])

  return { alerts, status }
}

export default function Dashboard() {
  const { alerts, status } = useAlerts()
  const total     = alerts.length
  const malicious = alerts.filter(a => a.malicious).length
  const benign    = total - malicious
  const avgScore  = alerts.length > 0
    ? (alerts.reduce((s, a) => s + (a.score ?? 0), 0) / alerts.length * 100).toFixed(1)
    : '—'

  const threatPct = total > 0 ? ((malicious / total) * 100).toFixed(1) : 0

  return (
    <div className="container dashboard-container">
      <div className="dashboard-header">
        <h1>Overview Dashboard</h1>
        <div className={`status status-${status}`}>
          <Wifi size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
          {status === 'live' ? 'Live (WebSocket)' : 'Polling mode'}
        </div>
      </div>

      {/* Live stat cards */}
      <section className="stats">
        <div className="stat">
          <div className="stat-label">Total Events</div>
          <div className="stat-value">{total}</div>
        </div>
        <div className="stat" style={{ borderTop: '3px solid #ef4444' }}>
          <div className="stat-label">Threats</div>
          <div className="stat-value" style={{ color: '#ef4444' }}>{malicious}</div>
        </div>
        <div className="stat" style={{ borderTop: '3px solid #22c55e' }}>
          <div className="stat-label">Normal</div>
          <div className="stat-value" style={{ color: '#22c55e' }}>{benign}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Avg Confidence</div>
          <div className="stat-value">{avgScore}{avgScore !== '—' ? '%' : ''}</div>
        </div>
      </section>

      {/* Threat level bar */}
      {total > 0 && (
        <div className="card" style={{ padding: '20px 24px' }}>
          <div className="card-title">
            <Activity size={18} style={{ verticalAlign: 'middle', marginRight: 8 }} />
            Live Threat Level
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12 }}>
            <div style={{ flex: 1, height: 14, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${Math.min(threatPct, 100)}%`,
                background: malicious > 0 ? '#ef4444' : '#22c55e',
                borderRadius: 99,
                transition: 'width 0.4s ease'
              }} />
            </div>
            <span style={{ fontWeight: 700, fontSize: '1rem', color: malicious > 0 ? '#ef4444' : '#22c55e', minWidth: 50 }}>
              {threatPct}%
            </span>
          </div>
          <p style={{ color: '#64748b', fontSize: '0.82rem', marginTop: 8 }}>
            {malicious > 0
              ? `${malicious} malicious event${malicious > 1 ? 's' : ''} detected in this session`
              : 'All clear — no threats in current session'}
          </p>
        </div>
      )}

      {/* Empty state */}
      {total === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '60px 24px' }}>
          <ShieldCheck size={56} style={{ color: '#22c55e', margin: '0 auto 16px' }} />
          <h3 style={{ color: '#0f172a', marginBottom: 8 }}>No live events yet</h3>
          <p style={{ color: '#64748b', fontSize: '0.9rem' }}>
            Go to the <strong>Upload</strong> page, drop a CSV file and run a scan —<br />
            the results will appear here in real-time via WebSocket.
          </p>
        </div>
      )}

      <footer style={{ marginTop: 20 }}>
        <small style={{ color: '#94a3b8' }}>
          Backend: {getApiBase()} · Events refresh live via WebSocket.
        </small>
      </footer>
    </div>
  )
}
