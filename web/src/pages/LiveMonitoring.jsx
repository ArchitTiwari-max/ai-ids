import React, { useEffect, useRef, useState, useCallback } from 'react'
import { getWsUrl, getApiBase } from '../lib/api'

// ── Attack classifier (same logic as other pages) ──────────────────────────
function classifyAttack(features = {}) {
  const port = features['Destination Port'] ?? 0
  const dur  = features['Flow Duration']    ?? 0
  const fwd  = features['Total Fwd Packets']      ?? 0
  const bwd  = features['Total Backward Packets'] ?? 0
  if (port === 22 && fwd > 100)             return 'Brute Force'
  if (dur > 50000 && fwd > 500 && bwd <= 2) return 'DDoS'
  if (dur === 0   && bwd === 0)             return 'Privilege Escalation'
  return 'Port Scanning'
}

function fmtUptime(secs) {
  const h = String(Math.floor(secs / 3600)).padStart(2, '0')
  const m = String(Math.floor((secs % 3600) / 60)).padStart(2, '0')
  const s = String(secs % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
}

function fmtTs(iso) {
  try { return new Date(iso).toLocaleTimeString('en-GB') } catch { return '--' }
}

const ATTACK_COLORS = {
  'Brute Force':          '#ef4444',
  'DDoS':                 '#f97316',
  'Privilege Escalation': '#eab308',
  'Port Scanning':        '#8b5cf6',
}

export default function LiveMonitoring() {
  const [monitoring,   setMonitoring]   = useState(false)
  const [wsStatus,     setWsStatus]     = useState('idle')   // idle | connecting | live | offline
  const [logs,         setLogs]         = useState([])
  const [packets,      setPackets]      = useState(0)
  const [threats,      setThreats]      = useState(0)
  const [uptime,       setUptime]       = useState(0)
  const [lastEvent,    setLastEvent]    = useState('—')
  const [notifications, setNotifications] = useState([])

  const wsRef      = useRef(null)
  const uptimeRef  = useRef(null)
  const termRef    = useRef(null)

  // ── Auto-scroll terminal ─────────────────────────────────────────────────
  useEffect(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight
  }, [logs])

  // ── Uptime timer ─────────────────────────────────────────────────────────
  const startUptime = () => {
    uptimeRef.current = setInterval(() => setUptime(u => u + 1), 1000)
  }
  const stopUptime = () => {
    clearInterval(uptimeRef.current)
    setUptime(0)
  }

  // ── Add log line ─────────────────────────────────────────────────────────
  const addLog = useCallback((line, type = 'info') => {
    setLogs(prev => {
      const next = [...prev, { text: line, type, ts: new Date().toLocaleTimeString('en-GB') }]
      return next.length > 200 ? next.slice(next.length - 200) : next
    })
  }, [])

  // ── Start monitoring ─────────────────────────────────────────────────────
  const startMonitoring = () => {
    if (monitoring) return
    setMonitoring(true)
    setLogs([])
    setPackets(0)
    setThreats(0)
    setNotifications([])
    startUptime()

    addLog('🔌 Initializing monitoring engine...', 'system')
    addLog('🤖 Loading ML model — XGBoost classifier (99%+ accuracy)', 'system')
    addLog('📡 Connecting to WebSocket alert stream...', 'system')

    setWsStatus('connecting')

    try {
      const ws = new WebSocket(getWsUrl())
      wsRef.current = ws

      ws.onopen = () => {
        setWsStatus('live')
        addLog('✅ WebSocket connected — Live packet stream active', 'success')
        addLog('🛡️  AI Detection Engine ready', 'success')
        addLog('⚡ Real-time threat classification enabled', 'success')
        addLog('━'.repeat(60), 'divider')
        addLog('📊 Starting enhanced monitoring... waiting for events', 'system')
        addLog('🔍 ML predictions will activate when packets are detected', 'system')
        addLog('━'.repeat(60), 'divider')
      }

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data)
          if (msg?.type === 'hello') {
            addLog(`[SYS] Backend handshake OK — ${msg.message || 'ready'}`, 'system')
            return
          }

          const ts = fmtTs(msg.timestamp)
          const port = msg.features?.['Destination Port'] ?? '?'
          const fwd  = msg.features?.['Total Fwd Packets'] ?? '?'
          const bwd  = msg.features?.['Total Backward Packets'] ?? '?'
          const dur  = msg.features?.['Flow Duration'] ?? '?'
          const conf = msg.score != null ? (msg.score * 100).toFixed(1) + '%' : 'N/A'

          setPackets(p => p + 1)
          setLastEvent(ts)

          if (msg.malicious) {
            const attackType = classifyAttack(msg.features || {})
            setThreats(t => t + 1)
            addLog(``, 'blank')
            addLog(`⚠️  [${ts}] THREAT DETECTED — ${attackType}`, 'threat')
            addLog(`   Port: ${port}  |  Fwd Pkts: ${fwd}  |  Bwd Pkts: ${bwd}  |  Duration: ${dur}`, 'threat-detail')
            addLog(`   Confidence: ${conf}  |  ML Score: ${msg.score?.toFixed(4) ?? 'N/A'}`, 'threat-detail')

            // Push notification
            setNotifications(prev => [{
              id: Date.now(),
              type: attackType,
              port,
              ts,
              color: ATTACK_COLORS[attackType] || '#ef4444'
            }, ...prev].slice(0, 8))
          } else {
            addLog(`[${ts}] NORMAL — Port: ${port}  Fwd: ${fwd}  Bwd: ${bwd}  Conf: ${conf}`, 'normal')
          }
        } catch {}
      }

      ws.onclose = () => {
        setWsStatus('offline')
        addLog('━'.repeat(60), 'divider')
        addLog('🔴 WebSocket connection closed', 'warn')
      }

      ws.onerror = () => {
        setWsStatus('offline')
        addLog('❌ WebSocket error — backend may be offline', 'error')
      }
    } catch (err) {
      addLog(`❌ Failed to connect: ${err.message}`, 'error')
      setWsStatus('offline')
    }
  }

  // ── Stop monitoring ──────────────────────────────────────────────────────
  const stopMonitoring = () => {
    if (wsRef.current) { try { wsRef.current.close() } catch {} wsRef.current = null }
    stopUptime()
    setMonitoring(false)
    setWsStatus('idle')
    addLog('━'.repeat(60), 'divider')
    addLog('⏹  Monitoring stopped by user', 'warn')
    addLog(`📊 Session summary: ${packets} packets, ${threats} threats detected`, 'system')
  }

  // Cleanup on unmount
  useEffect(() => () => {
    if (wsRef.current) wsRef.current.close()
    clearInterval(uptimeRef.current)
  }, [])

  // ── Terminal line colors ─────────────────────────────────────────────────
  const lineColor = (type) => {
    switch (type) {
      case 'system':       return '#60a5fa'
      case 'success':      return '#4ade80'
      case 'threat':       return '#f87171'
      case 'threat-detail':return '#fca5a5'
      case 'normal':       return '#86efac'
      case 'warn':         return '#fbbf24'
      case 'error':        return '#f87171'
      case 'divider':      return '#374151'
      case 'blank':        return 'transparent'
      default:             return '#94a3b8'
    }
  }

  const statusDot = wsStatus === 'live' ? '#4ade80' : wsStatus === 'connecting' ? '#fbbf24' : '#ef4444'
  const statusLabel = wsStatus === 'live' ? 'Live' : wsStatus === 'connecting' ? 'Connecting...' : wsStatus === 'offline' ? 'Offline' : 'Idle'

  return (
    <div style={{ padding: '28px 28px 48px', background: '#f8fafc', minHeight: '100vh', fontFamily: 'Inter, sans-serif' }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <span style={{ fontSize: '1.5rem' }}>〜</span>
          <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 900, color: '#0f172a' }}>Live Network Monitoring</h1>
        </div>
        <p style={{ color: '#64748b', margin: '0 0 14px', fontSize: '0.95rem' }}>
          Intrusion detection and real-time threat analysis powered by advanced machine learning algorithms
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { icon: '🤖', label: 'Powered by Machine Learning', bg: '#eff6ff', color: '#2563eb' },
            { icon: '⚡', label: 'Real-time', bg: '#f0fdf4', color: '#16a34a' },
            { icon: '🔋', label: 'Zero Latency', bg: '#faf5ff', color: '#7c3aed' },
          ].map((b, i) => (
            <span key={i} style={{ background: b.bg, color: b.color, padding: '5px 14px', borderRadius: 20, fontSize: '0.82rem', fontWeight: 700 }}>
              {b.icon} {b.label}
            </span>
          ))}
        </div>
      </div>

      {/* ── Stat Cards ──────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
        {[
          { label: 'PACKETS ANALYZED', value: packets.toLocaleString(), color: '#3b82f6', icon: '📦' },
          { label: 'THREAT ALERTS',    value: threats.toLocaleString(), color: '#ef4444', icon: '🚨' },
          { label: 'SYSTEM UPTIME',    value: fmtUptime(uptime),        color: '#22c55e', icon: '⏱️',  mono: true },
        ].map((c, i) => (
          <div key={i} style={{ background: 'white', borderRadius: 12, padding: '24px 20px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '1.8rem', marginBottom: 4 }}>{c.icon}</div>
            <div style={{ fontSize: c.mono ? '1.6rem' : '2rem', fontWeight: 900, color: c.color, fontFamily: c.mono ? 'monospace' : 'inherit' }}>
              {c.value}
            </div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', letterSpacing: 1.5, marginTop: 4, textTransform: 'uppercase' }}>
              {c.label}
            </div>
          </div>
        ))}
      </div>

      {/* ── Main: Terminal + Right Panel ────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 1.1fr', gap: 20 }}>

        {/* Terminal panel */}
        <div style={{ background: 'white', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0' }}>
          {/* Control bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusDot, display: 'inline-block', boxShadow: monitoring ? `0 0 6px ${statusDot}` : 'none', transition: 'all 0.3s' }} />
              <span style={{ fontSize: '0.82rem', color: '#475569', fontWeight: 600 }}>
                Live packet analysis engine and real-time threat detection
              </span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={startMonitoring}
                disabled={monitoring}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: monitoring ? '#94a3b8' : '#3b82f6', color: 'white', border: 'none', padding: '9px 20px', borderRadius: 8, cursor: monitoring ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.9rem' }}
              >
                ▶ Start Monitoring
              </button>
              <button
                onClick={stopMonitoring}
                disabled={!monitoring}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: !monitoring ? '#e2e8f0' : '#ef4444', color: !monitoring ? '#94a3b8' : 'white', border: 'none', padding: '9px 20px', borderRadius: 8, cursor: !monitoring ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.9rem' }}
              >
                ⏹ Stop
              </button>
            </div>
          </div>

          {/* Terminal console */}
          <div
            ref={termRef}
            style={{
              background: '#0f172a', minHeight: 380, maxHeight: 480,
              overflowY: 'auto', padding: '20px 22px',
              fontFamily: '"Courier New", Courier, monospace', fontSize: '0.82rem',
              lineHeight: 1.7,
            }}
          >
            {logs.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 300, color: '#475569', textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', marginBottom: 16, color: '#334155', fontFamily: 'monospace' }}>{'>&nbsp;_'.replace('&nbsp;', ' ')}&gt;_</div>
                <div style={{ color: '#60a5fa', fontSize: '1rem', fontWeight: 600, marginBottom: 8 }}>Advanced Monitoring Console Ready</div>
                <div style={{ color: '#475569', fontSize: '0.85rem' }}>Click "Start Monitoring" to begin real-time network analysis</div>
              </div>
            ) : (
              logs.map((log, i) => (
                <div key={i} style={{ color: lineColor(log.type), whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {log.text}
                </div>
              ))
            )}
          </div>

          {/* Terminal footer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 18px', background: '#f8fafc', borderTop: '1px solid #f1f5f9', fontSize: '0.75rem', color: '#64748b' }}>
            <span>ℹ Live logs via WebSocket <code style={{ background: '#f1f5f9', padding: '1px 6px', borderRadius: 4 }}>/ws/alerts</code> with zero performance impact</span>
            <span>⏱ Last event: {lastEvent}</span>
          </div>
        </div>

        {/* Right Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Compact security notifications */}
          <div style={{ background: 'white', borderRadius: 14, padding: '18px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0f172a', marginBottom: 12 }}>
              Compact security notifications
              {threats > 0 && <span style={{ marginLeft: 8, background: '#ef4444', color: 'white', fontSize: '0.72rem', padding: '2px 8px', borderRadius: 20 }}>{threats}</span>}
            </div>
            <div style={{ maxHeight: 220, overflowY: 'auto' }}>
              {notifications.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 0', color: '#94a3b8', fontSize: '0.82rem' }}>
                  🛡️ No threats yet
                </div>
              ) : notifications.map(n => (
                <div key={n.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 0', borderBottom: '1px solid #f8fafc' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: n.color, marginTop: 5, flexShrink: 0 }} />
                  <div>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: n.color }}>{n.type}</span>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Port {n.port} · {n.ts}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Monitoring system overview */}
          <div style={{ background: 'white', borderRadius: 14, padding: '18px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#64748b', marginBottom: 16 }}>Monitoring system overview</div>
            {[
              {
                dot: '#3b82f6', title: 'AI Detection Engine',
                desc: 'Advanced machine learning models analyze network patterns for threat detection.',
              },
              {
                dot: '#f59e0b', title: 'Real-time Alerts',
                desc: 'Security events with CATEGORY are automatically classified and displayed.',
                tag: 'CATEGORY',
              },
              {
                dot: '#22c55e', title: 'Zero Impact Mode',
                desc: 'Web monitoring operates independently without affecting main IDS performance.',
              },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: item.dot, flexShrink: 0, marginTop: 5 }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f172a', marginBottom: 3 }}>{item.title}</div>
                  <div style={{ fontSize: '0.78rem', color: '#64748b', lineHeight: 1.5 }}>
                    {item.tag ? (
                      <>Security events with <span style={{ background: '#f1f5f9', color: '#3b82f6', padding: '1px 6px', borderRadius: 4, fontSize: '0.72rem', fontWeight: 700 }}>{item.tag}</span> are automatically classified and displayed.</>
                    ) : item.desc}
                  </div>
                </div>
              </div>
            ))}

            {/* Live status indicator */}
            <div style={{ marginTop: 12, padding: '10px 14px', background: wsStatus === 'live' ? '#f0fdf4' : '#fafafa', borderRadius: 8, border: `1px solid ${wsStatus === 'live' ? '#bbf7d0' : '#e2e8f0'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusDot, animation: monitoring ? 'pulse 1.5s infinite' : 'none' }} />
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: wsStatus === 'live' ? '#16a34a' : '#64748b' }}>
                  WebSocket: {statusLabel}
                </span>
              </div>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 3 }}>
                {monitoring ? `${packets} packets · ${threats} threats · ${fmtUptime(uptime)}` : 'Click Start to connect'}
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        ::-webkit-scrollbar { width: 4px; } 
        ::-webkit-scrollbar-track { background: #1e293b; }
        ::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
      `}</style>
    </div>
  )
}
