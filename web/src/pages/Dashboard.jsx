import React, { useEffect, useState, useMemo } from 'react'
import { Line, Doughnut, Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS, ArcElement, Tooltip, Legend,
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Title, Filler
} from 'chart.js'
import {
  Activity, ShieldAlert, ShieldCheck, Wifi, RefreshCw,
  BarChart2, Clock, Zap, Server, Search, Key, Bot
} from 'lucide-react'
import { getApiBase, getWsUrl } from '../lib/api'

ChartJS.register(
  ArcElement, Tooltip, Legend, CategoryScale, LinearScale,
  PointElement, LineElement, BarElement, Title, Filler
)

// ── Classify attack from features ──────────────────────────────────────────
function classifyAttack(row) {
  if (!row.malicious) return 'Normal'
  const f = row.features || {}
  const port = f['Destination Port'] ?? 0
  const dur  = f['Flow Duration']    ?? 0
  const fwd  = f['Total Fwd Packets']      ?? 0
  const bwd  = f['Total Backward Packets'] ?? 0
  if (port === 22 && fwd > 100)             return 'Brute Force'
  if (dur > 50000 && fwd > 500 && bwd <= 2) return 'DDoS'
  if (dur === 0   && bwd === 0)             return 'Privilege Escalation'
  return 'Port Scanning'
}

const ATTACK_COLORS = {
  'Brute Force':          '#ef4444',
  'DDoS':                 '#f97316',
  'Privilege Escalation': '#eab308',
  'Port Scanning':        '#8b5cf6',
  'Normal':               '#22c55e',
}

function fmtTime(iso) {
  try { return new Date(iso).toLocaleString('en-GB', { hour12: false }) } catch { return iso }
}

export default function Dashboard() {
  const [modelInfo,    setModelInfo]    = useState(null)
  const [reports,      setReports]      = useState([])
  const [allRows,      setAllRows]      = useState([])
  const [liveAlerts,   setLiveAlerts]   = useState([])
  const [wsStatus,     setWsStatus]     = useState('connecting')
  const [loading,      setLoading]      = useState(true)
  const [lastRefresh,  setLastRefresh]  = useState(new Date())

  const apiBase = getApiBase()

  // ── Load historical data ─────────────────────────────────────────────────
  const loadData = async () => {
    setLoading(true)
    try {
      const [infoRes, listRes] = await Promise.all([
        fetch(`${apiBase}/model/info`),
        fetch(`${apiBase}/reports?limit=100`)
      ])
      if (infoRes.ok) setModelInfo(await infoRes.json())

      if (listRes.ok) {
        const { reports: rList } = await listRes.json()
        setReports(rList || [])

        // Fetch full rows for last 10 reports
        const recent = (rList || []).slice(0, 10)
        const details = await Promise.all(
          recent.map(r => fetch(`${apiBase}/reports/${r.id}`).then(x => x.json()).catch(() => null))
        )
        const flat = []
        details.forEach(d => {
          if (!d?.rows) return
          d.rows.forEach(row => flat.push({ ...row, filename: d.filename, attackType: classifyAttack(row) }))
        })
        flat.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        setAllRows(flat)
      }
    } catch {}
    setLoading(false)
    setLastRefresh(new Date())
  }

  useEffect(() => { loadData() }, [])

  // ── WebSocket for live alerts ────────────────────────────────────────────
  useEffect(() => {
    let ws
    try {
      ws = new WebSocket(getWsUrl())
      ws.onopen  = () => setWsStatus('live')
      ws.onclose = () => setWsStatus('offline')
      ws.onerror = () => setWsStatus('offline')
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data)
          if (msg?.type === 'hello') return
          setLiveAlerts(prev => {
            const next = [{ ...msg, attackType: classifyAttack(msg) }, ...prev]
            return next.slice(0, 50)
          })
        } catch {}
      }
    } catch {}
    return () => { try { ws?.close() } catch {} }
  }, [])

  // ── Computed stats ───────────────────────────────────────────────────────
  const totalRecords = useMemo(() => allRows.length, [allRows])
  const totalThreats = useMemo(() => allRows.filter(r => r.malicious).length, [allRows])
  const totalNormal  = useMemo(() => allRows.filter(r => !r.malicious).length, [allRows])
  const modelAcc     = modelInfo?.metrics?.accuracy ?? 98.12

  const attackDist = useMemo(() => {
    const d = {}
    allRows.forEach(r => { d[r.attackType] = (d[r.attackType] || 0) + 1 })
    return d
  }, [allRows])

  // Recent detections = live alerts first, then from DB
  const recentDetections = useMemo(() => {
    const combined = [...liveAlerts, ...allRows]
    return combined.slice(0, 15)
  }, [liveAlerts, allRows])

  // Line chart — total vs threats per report (last 10)
  const activityChart = useMemo(() => {
    const r = [...reports].reverse().slice(-10)
    return {
      labels: r.map(x => x.filename?.split('/').pop()?.replace('.csv','') || fmtTime(x.uploaded_at)),
      datasets: [
        {
          label: 'Total Traffic',
          data: r.map(x => x.total),
          borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.12)',
          tension: 0.4, fill: true, pointRadius: 4,
        },
        {
          label: 'Threats Detected',
          data: r.map(x => x.malicious),
          borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.10)',
          tension: 0.4, fill: true, pointRadius: 4,
        }
      ]
    }
  }, [reports])

  const lineOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom', labels: { padding: 16, font: { size: 12 } } } },
    scales: {
      y: { beginAtZero: true, grid: { color: '#f1f5f9' } },
      x: { grid: { display: false }, ticks: { maxRotation: 30, font: { size: 11 } } }
    }
  }

  // Donut chart — attack distribution
  const donutData = useMemo(() => {
    const labels = Object.keys(attackDist)
    return {
      labels,
      datasets: [{ data: Object.values(attackDist), backgroundColor: labels.map(l => ATTACK_COLORS[l] || '#94a3b8'), borderWidth: 3, borderColor: '#fff' }]
    }
  }, [attackDist])

  const donutOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom', labels: { padding: 12, font: { size: 11 } } } },
    cutout: '60%'
  }

  // Bar chart — algorithm accuracy comparison (only RF in our project, displayed as single bar)
  const metrics = modelInfo?.metrics || {}
  const algoBar = {
    labels: ['Accuracy', 'Precision', 'F1 Score', 'Recall'],
    datasets: [{
      label: 'Random Forest',
      data: [metrics.accuracy ?? 98.12, metrics.precision ?? 98.17, metrics.f1_score ?? 98.13, metrics.recall ?? 98.12],
      backgroundColor: ['#22c55e','#3b82f6','#f97316','#8b5cf6'],
      borderRadius: 6,
    }]
  }
  const algoBarOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: { min: 90, max: 100, grid: { color: '#f1f5f9' }, ticks: { callback: v => v + '%' } },
      x: { grid: { display: false } }
    }
  }

  const fmt = v => v != null ? Number(v).toFixed(2) + '%' : 'N/A'

  return (
    <div style={{ padding: '0 0 40px', background: '#f8fafc', minHeight: '100vh', fontFamily: 'Inter, sans-serif' }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{ background: 'linear-gradient(135deg, #0f766e 0%, #0d9488 60%, #14b8a6 100%)', padding: '28px 32px', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ color: 'white', fontSize: '1.8rem', fontWeight: 900, margin: 0 }}>Network IDS Panel</h1>
            <p style={{ color: 'rgba(255,255,255,0.8)', margin: '4px 0 0', fontSize: '0.95rem' }}>Real-time intrusion detection and threat analysis</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: wsStatus === 'live' ? '#ef4444' : '#64748b', color: 'white', padding: '8px 16px', borderRadius: 8, fontWeight: 700, fontSize: '0.88rem' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'white', display: 'inline-block', animation: wsStatus === 'live' ? 'pulse 1.5s infinite' : 'none' }} />
              {wsStatus === 'live' ? 'Live' : 'Offline'}
            </div>
            <button
              onClick={loadData}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem' }}
            >
              <RefreshCw size={15} /> Refresh
            </button>
          </div>
        </div>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.78rem', marginTop: 8 }}>
          Last updated: {lastRefresh.toLocaleTimeString()}
        </p>
      </div>

      <div style={{ padding: '0 28px' }}>

        {/* ── 4 Stat Cards ──────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          {[
            { icon: <Activity size={22} />, label: 'TOTAL REQUESTS', value: totalRecords.toLocaleString(), sub: '↑ All scanned records', color: '#0d9488', bg: '#f0fdfa' },
            { icon: <ShieldAlert size={22} />, label: 'THREATS DETECTED', value: totalThreats.toLocaleString(), sub: totalRecords > 0 ? `${((totalThreats/totalRecords)*100).toFixed(1)}% detection rate` : '—', color: '#ef4444', bg: '#fef2f2' },
            { icon: <ShieldCheck size={22} />, label: 'SECURE CONNECTIONS', value: totalNormal.toLocaleString(), sub: totalRecords > 0 ? `${((totalNormal/totalRecords)*100).toFixed(1)}% secure` : '—', color: '#22c55e', bg: '#f0fdf4' },
            { icon: <BarChart2 size={22} />, label: 'TRUST IN AI', value: `${Number(modelAcc).toFixed(1)}%`, sub: 'Machine learning accuracy', color: '#f59e0b', bg: '#fffbeb' },
          ].map((c, i) => (
            <div key={i} style={{ background: 'white', borderRadius: 14, padding: '20px 22px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', borderTop: `4px solid ${c.color}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ background: c.bg, color: c.color, padding: 10, borderRadius: 10, display: 'flex' }}>{c.icon}</div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', letterSpacing: 1, textTransform: 'uppercase' }}>{c.label}</div>
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 900, color: c.color === '#ef4444' ? '#ef4444' : '#0f172a', lineHeight: 1 }}>{loading ? '—' : c.value}</div>
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 6 }}>{c.sub}</div>
            </div>
          ))}
        </div>

        {/* ── ML Model Performance ───────────────────────────────────────── */}
        <div style={{ background: 'white', borderRadius: 14, padding: '22px 24px', marginBottom: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#0d9488' }} />
            <span style={{ fontWeight: 700, fontSize: '1rem', color: '#0f172a' }}>Performance of the Machine Learning Algorithm</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* RF Algorithm Card */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 22px' }}>
              <span style={{ background: '#22c55e', color: 'white', fontSize: '0.75rem', fontWeight: 700, padding: '4px 12px', borderRadius: 20 }}>🏆 Best Performer</span>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: '12px 0 6px' }}>Random Forest</h3>
              <p style={{ color: '#64748b', fontSize: '0.83rem', margin: '0 0 14px', lineHeight: 1.5 }}>
                Ensemble learning method using multiple decision trees with bootstrap aggregation for robust network intrusion classification.
              </p>
              <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#22c55e', marginBottom: 8 }}>
                Accuracy: {fmt(metrics.accuracy)}
              </div>
              <div style={{ height: 6, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden', marginBottom: 10 }}>
                <div style={{ height: '100%', width: `${metrics.accuracy ?? 98}%`, background: '#22c55e', borderRadius: 99 }} />
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: '0.78rem', color: '#64748b' }}>
                <span>F1: <b style={{ color: '#0f172a' }}>{fmt(metrics.f1_score)}</b></span>
                <span>Precision: <b style={{ color: '#0f172a' }}>{fmt(metrics.precision)}</b></span>
                <span>Recall: <b style={{ color: '#0f172a' }}>{fmt(metrics.recall)}</b></span>
              </div>
            </div>

            {/* Algorithm metrics bar chart */}
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: 10 }}>Comparison of Algorithm Metrics</div>
              <div style={{ height: 170 }}>
                <Bar data={algoBar} options={algoBarOptions} />
              </div>
            </div>
          </div>
        </div>

        {/* ── Activity Chart + Donut ─────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 20, marginBottom: 24 }}>
          <div style={{ background: 'white', borderRadius: 14, padding: '20px 22px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: '#0f172a' }}>
                <Activity size={16} color="#0d9488" /> Overview of Network Activity
              </div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, background: '#f1f5f9', color: '#475569', padding: '4px 10px', borderRadius: 6 }}>
                Last {reports.length} scans
              </span>
            </div>
            {reports.length === 0 ? (
              <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.9rem' }}>
                Upload CSV files to see activity
              </div>
            ) : (
              <div style={{ height: 200 }}>
                <Line data={activityChart} options={lineOptions} />
              </div>
            )}
          </div>

          <div style={{ background: 'white', borderRadius: 14, padding: '20px 22px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: '#0f172a', marginBottom: 16 }}>
              <BarChart2 size={16} color="#0d9488" /> Distribution of Attack Types
            </div>
            {Object.keys(attackDist).length === 0 ? (
              <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.9rem' }}>
                No data yet
              </div>
            ) : (
              <div style={{ height: 200 }}>
                <Doughnut data={donutData} options={donutOptions} />
              </div>
            )}
          </div>
        </div>

        {/* ── Recent Detections + System Health ─────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 20 }}>
          {/* Recent Detections */}
          <div style={{ background: 'white', borderRadius: 14, padding: '20px 22px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: '#0f172a' }}>
                <Zap size={16} color="#0d9488" /> Recent Detections
              </div>
              {totalThreats > 0 && (
                <span style={{ background: '#ef4444', color: 'white', fontSize: '0.75rem', fontWeight: 700, padding: '4px 10px', borderRadius: 20 }}>
                  {totalThreats} threats
                </span>
              )}
            </div>
            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              {recentDetections.length === 0 ? (
                <div style={{ padding: '40px 0', textAlign: 'center', color: '#94a3b8' }}>
                  <ShieldCheck size={36} style={{ margin: '0 auto 8px' }} />
                  <p style={{ fontSize: '0.9rem' }}>No detections yet — upload a CSV to start</p>
                </div>
              ) : recentDetections.map((row, i) => {
                const color = ATTACK_COLORS[row.attackType] || '#94a3b8'
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < recentDetections.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: row.malicious ? '#ef4444' : '#22c55e', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: '0.82rem', fontWeight: 700, color: '#0d9488' }}>
                          Port: {row.features?.['Destination Port'] ?? '—'}
                        </span>
                        <span style={{ background: color + '20', color, border: `1px solid ${color}55`, fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                          {row.attackType}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3, color: '#94a3b8', fontSize: '0.75rem' }}>
                        <Clock size={11} /> {fmtTime(row.timestamp)}
                        {row.filename && <span>· {row.filename.split('/').pop()}</span>}
                      </div>
                    </div>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: row.malicious ? '#ef4444' : '#22c55e', flexShrink: 0 }}>
                      {row.malicious ? 'Threat' : 'Secure'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* System Health + Quick Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Quick Actions */}
            <div style={{ background: 'white', borderRadius: 14, padding: '20px 22px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: '#0f172a', marginBottom: 14 }}>
                <Zap size={16} color="#0d9488" /> Quick Actions
              </div>
              <a href="/upload" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', background: 'linear-gradient(135deg, #0d9488, #0f766e)', color: 'white', border: 'none', padding: '12px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem', marginBottom: 10, textDecoration: 'none' }}>
                <Activity size={16} /> Analyze Traffic Data
              </a>
              <a href="/reports" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', background: 'white', color: '#0f172a', border: '1.5px solid #e2e8f0', padding: '12px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem', textDecoration: 'none' }}>
                <BarChart2 size={16} /> View All Reports
              </a>
            </div>

            {/* System Health */}
            <div style={{ background: 'white', borderRadius: 14, padding: '20px 22px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: '#0f172a', marginBottom: 16 }}>
                <ShieldCheck size={16} color="#0d9488" /> System Health
              </div>
              {[
                { label: 'Random Forest Engine', value: metrics.accuracy ?? 98.12, color: '#22c55e', note: 'Primary model — active' },
                { label: 'F1 Score Quality',     value: metrics.f1_score  ?? 98.13, color: '#3b82f6', note: 'Balance of precision/recall' },
                { label: 'Precision Score',      value: metrics.precision ?? 98.17, color: '#f97316', note: 'Low false positive rate' },
                { label: 'Recall Coverage',      value: metrics.recall    ?? 98.12, color: '#8b5cf6', note: 'Threat detection coverage' },
              ].map((item, i) => (
                <div key={i} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151' }}>{item.label}</span>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, background: item.color + '22', color: item.color, padding: '2px 8px', borderRadius: 20 }}>
                      {Number(item.value).toFixed(1)}%
                    </span>
                  </div>
                  <div style={{ height: 7, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${item.value}%`, background: item.color, borderRadius: 99 }} />
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 2 }}>{item.note}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; } 50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}
