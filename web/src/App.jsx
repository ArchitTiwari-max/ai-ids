import React, { useEffect, useMemo, useState } from 'react'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend
} from 'chart.js'
import { getWsUrl, getApiBase } from './lib/api'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend)

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

  // Try WebSocket — works locally, gracefully degrades on Vercel
  useEffect(() => {
    let ws
    try {
      const url = getWsUrl()
      ws = new WebSocket(url)
      ws.onopen = () => setStatus('live')
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

  return { alerts, status, addAlerts }
}

function useChartData(alerts) {
  const labels = useMemo(() => alerts.map((a) => new Date(a.timestamp).toLocaleTimeString()), [alerts])
  const maliciousSeries = useMemo(() => alerts.map((a) => (a.malicious ? 1 : 0)), [alerts])
  const scoreSeries = useMemo(() => alerts.map((a) => (typeof a.score === 'number' ? a.score : null)), [alerts])

  const data = useMemo(() => ({
    labels,
    datasets: [
      {
        label: 'Malicious (1/0)',
        data: maliciousSeries,
        borderColor: 'rgba(220, 38, 38, 1)',
        backgroundColor: 'rgba(220, 38, 38, 0.3)',
        tension: 0.2,
        yAxisID: 'y'
      },
      {
        label: 'Score (if available)',
        data: scoreSeries,
        borderColor: 'rgba(29, 78, 216, 1)',
        backgroundColor: 'rgba(29, 78, 216, 0.3)',
        tension: 0.2,
        yAxisID: 'y1'
      }
    ]
  }), [labels, maliciousSeries, scoreSeries])

  const options = useMemo(() => ({
    responsive: true,
    interaction: { mode: 'index', intersect: false },
    stacked: false,
    plugins: { legend: { position: 'top' } },
    scales: {
      y: { type: 'linear', position: 'left', min: 0, max: 1 },
      y1: { type: 'linear', position: 'right', min: 0, max: 1, grid: { drawOnChartArea: false } }
    }
  }), [])

  return { data, options }
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  )
}

function AlertsTable({ alerts }) {
  return (
    <div className="card">
      <div className="card-title">Recent Alerts</div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Malicious</th>
              <th>Score</th>
              <th>Preview</th>
            </tr>
          </thead>
          <tbody>
            {alerts.slice().reverse().map((a) => (
              <tr key={a.id} className={a.malicious ? 'row-bad' : 'row-good'}>
                <td>{new Date(a.timestamp).toLocaleTimeString()}</td>
                <td>{a.malicious ? 'Yes' : 'No'}</td>
                <td>{typeof a.score === 'number' ? a.score.toFixed(3) : '-'}</td>
                <td>
                  {Object.entries(a.features || {}).slice(0, 3).map(([k, v]) => (
                    <span key={k} className="kv">
                      <b>{k}:</b> {String(v)}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function App() {
  const { alerts, status, addAlerts } = useAlerts()
  const total = alerts.length
  const malicious = alerts.filter((a) => a.malicious).length
  const benign = total - malicious
  const lastScore = alerts.length && typeof alerts[alerts.length - 1].score === 'number'
    ? alerts[alerts.length - 1].score.toFixed(3)
    : '-'

  const { data, options } = useChartData(alerts)

  // Real traffic samples from ml/data/sample.csv
  const CSV_SAMPLES = [
    { 'Destination Port': 80,  'Flow Duration': 1000, 'Total Fwd Packets': 10,  'Total Backward Packets': 5  },  // BENIGN
    { 'Destination Port': 443, 'Flow Duration': 1500, 'Total Fwd Packets': 12,  'Total Backward Packets': 8  },  // BENIGN
    { 'Destination Port': 22,  'Flow Duration': 2000, 'Total Fwd Packets': 15,  'Total Backward Packets': 10 },  // BENIGN
    { 'Destination Port': 80,  'Flow Duration': 100,  'Total Fwd Packets': 2,   'Total Backward Packets': 1  },  // BENIGN
    { 'Destination Port': 443, 'Flow Duration': 500,  'Total Fwd Packets': 8,   'Total Backward Packets': 4  },  // BENIGN
    { 'Destination Port': 80,  'Flow Duration': 5000, 'Total Fwd Packets': 50,  'Total Backward Packets': 40 },  // MALICIOUS
    { 'Destination Port': 22,  'Flow Duration': 100,  'Total Fwd Packets': 500, 'Total Backward Packets': 1  },  // MALICIOUS
    { 'Destination Port': 80,  'Flow Duration': 2000, 'Total Fwd Packets': 100, 'Total Backward Packets': 10 },  // MALICIOUS
    { 'Destination Port': 80,  'Flow Duration': 3000, 'Total Fwd Packets': 80,  'Total Backward Packets': 20 },  // MALICIOUS
    { 'Destination Port': 443, 'Flow Duration': 4000, 'Total Fwd Packets': 120, 'Total Backward Packets': 30 },  // MALICIOUS
  ]

  // Scan button — sends real CSV rows to backend one by one
  const [scanning, setScanning] = useState(false)
  const runScan = async () => {
    if (scanning) return
    setScanning(true)
    const apiBase = getApiBase()
    try {
      // Send all CSV rows (shuffle for variety)
      const shuffled = [...CSV_SAMPLES].sort(() => Math.random() - 0.5)
      for (let i = 0; i < shuffled.length; i++) {
        const features = shuffled[i]
        try {
          const res = await fetch(`${apiBase}/ingest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ features })
          })
          if (res.ok) {
            const result = await res.json()
            addAlerts([{
              id: result.timestamp + '_' + i,
              malicious: result.malicious,
              score: result.score,
              timestamp: result.timestamp,
              features
            }])
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 200))
      }
    } finally {
      setScanning(false)
    }
  }

  const statusLabel = status === 'live' ? '🟢 Live (WebSocket)' : '🟡 Polling mode'

  return (
    <div className="container">
      <header>
        <h1>AI IDS Dashboard</h1>
        <div className={`status status-${status}`}>{statusLabel}</div>
        <div style={{ marginLeft: 'auto' }}>
          <button onClick={runScan} disabled={scanning} className="btn">
            {scanning ? 'Scanning…' : 'Run Scan'}
          </button>
        </div>
      </header>

      <section className="stats">
        <Stat label="Total events" value={total} />
        <Stat label="Malicious" value={malicious} />
        <Stat label="Benign" value={benign} />
        <Stat label="Last score" value={lastScore} />
      </section>

      <div className="card">
        <div className="card-title">Alerts Over Time</div>
        <Line data={data} options={options} />
      </div>

      <AlertsTable alerts={alerts} />

      <footer>
        <small>
          Backend: {getApiBase()} · Click &quot;Run Scan&quot; to simulate traffic and see results.
        </small>
      </footer>
    </div>
  )
}
