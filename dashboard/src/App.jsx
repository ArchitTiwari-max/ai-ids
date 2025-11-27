import React, { useEffect, useMemo, useRef, useState } from 'react'
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
import { getWsUrl } from './lib/api'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend)

function useWebSocketAlerts() {
  const [alerts, setAlerts] = useState([])
  const [status, setStatus] = useState('disconnected')
  const wsRef = useRef(null)

  useEffect(() => {
    const url = getWsUrl()

    const ws = new WebSocket(url)
    wsRef.current = ws
    setStatus('connecting')

    ws.onopen = () => setStatus('connected')
    ws.onclose = () => setStatus('disconnected')
    ws.onerror = () => setStatus('error')

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data)
        if (msg?.type === 'hello') return
        // Expecting: { id, malicious, score, timestamp, features }
        setAlerts((prev) => {
          const next = [...prev, msg]
          // Keep last 200
          return next.length > 200 ? next.slice(next.length - 200) : next
        })
      } catch {}
    }

    return () => {
      try { ws.close() } catch {}
    }
  }, [])

  return { alerts, status }
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
  const { alerts, status } = useWebSocketAlerts()
  const total = alerts.length
  const malicious = alerts.filter((a) => a.malicious).length
  const benign = total - malicious
  const lastScore = alerts.length && typeof alerts[alerts.length - 1].score === 'number'
    ? alerts[alerts.length - 1].score.toFixed(3)
    : '-'

  const { data, options } = useChartData(alerts)

  // Scan button state and handler
  const [scanning, setScanning] = useState(false)
  const host = import.meta.env.VITE_BACKEND_HOST || 'localhost:8000'
  const runScan = async () => {
    if (scanning) return
    setScanning(true)
    try {
      for (let i = 0; i < 25; i++) {
        const useHit = Math.random() < 0.5
        const f1 = useHit ? 0 : Math.floor(Math.random() * 3)
        const f2 = useHit ? 7 : Math.floor(Math.random() * 3)
        await fetch(`http://${host}/ingest`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ features: { f1, f2 } })
        }).catch(() => {})
        await new Promise((r) => setTimeout(r, 100))
      }
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="container">
      <header>
        <h1>AI IDS Dashboard</h1>
        <div className={`status status-${status}`}>WS: {status}</div>
        <div style={{ marginLeft: 'auto' }}>
          <button onClick={runScan} disabled={scanning} className="btn">
            {scanning ? 'Scanning…' : 'Scan'}
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
          Backend expected at ws://localhost:8000/ws/alerts. Override with VITE_BACKEND_HOST, e.g. VITE_BACKEND_HOST=localhost:8000
        </small>
      </footer>
    </div>
  )
}
