import React, { useState, useRef, useMemo } from 'react'
import {
  UploadCloud, File, CheckCircle, AlertCircle,
  ShieldAlert, ShieldCheck, Activity, Download, BarChart2, RefreshCw
} from 'lucide-react'
import { Bar, Doughnut } from 'react-chartjs-2'
import {
  Chart as ChartJS, ArcElement, Tooltip, Legend,
  CategoryScale, LinearScale, BarElement, Title
} from 'chart.js'
import { getApiBase } from '../lib/api'

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title)

// ─── Classify attack from features (same as Reports page) ───────────────────
function classifyAttack(alert) {
  if (!alert.malicious) return 'Normal'
  const f = alert.features || {}
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

const SAMPLE_FILES = [
  { name: 'normal_traffic.csv',             label: '🟢 Normal Traffic',       desc: 'All benign connections' },
  { name: 'brute_force_attack.csv',         label: '🔴 Brute Force Attack',    desc: 'SSH brute-force patterns' },
  { name: 'ddos_attack.csv',               label: '🔴 DDoS Attack',           desc: 'High-volume flood traffic' },
  { name: 'mixed_traffic.csv',             label: '🟡 Mixed Traffic',         desc: 'Normal + Attack mix' },
  { name: 'privilege_escalation.csv',      label: '🔴 Privilege Escalation',  desc: 'Zero-duration exploit patterns' },
  { name: 'comprehensive_all_attacks.csv', label: '⚡ All Attacks + Normal',   desc: 'Brute Force + DDoS + Priv Esc + Normal' },
]

// ─── Analysis Results (shown inline below the upload box) ───────────────────
function AnalysisResults({ results, fileName, modelInfo, onReset }) {
  const { alerts, maliciousCount, benignCount, avgScore } = results
  const records = alerts.length

  // Metrics
  const bm = modelInfo?.metrics
  const tp  = alerts.filter(a =>  a.malicious && (a.score ?? 0) >= 0.5).length
  const fp  = alerts.filter(a =>  a.malicious && (a.score ?? 1) <  0.5).length
  const tn  = alerts.filter(a => !a.malicious && (a.score ?? 1) <  0.5).length
  const fn  = alerts.filter(a => !a.malicious && (a.score ?? 0) >= 0.5).length
  const tot = alerts.length || 1
  const lAcc = alerts.length > 0 ? (((tp + tn) / tot) * 100).toFixed(2) : null
  const lPre = (tp + fp) > 0     ? ((tp / (tp + fp)) * 100).toFixed(2)  : null
  const lRec = (tp + fn) > 0     ? ((tp / (tp + fn)) * 100).toFixed(2)  : null
  const lF1  = lPre && lRec && (parseFloat(lPre) + parseFloat(lRec)) > 0
    ? ((2 * parseFloat(lPre) * parseFloat(lRec)) / (parseFloat(lPre) + parseFloat(lRec))).toFixed(2)
    : null
  const accuracy  = bm?.accuracy  ?? lAcc  ?? 'N/A'
  const precision = bm?.precision ?? lPre  ?? 'N/A'
  const f1Score   = bm?.f1_score  ?? lF1   ?? 'N/A'
  const recall    = bm?.recall    ?? lRec  ?? 'N/A'
  const sfx = v => v !== 'N/A' ? '%' : ''
  const threatPct = records > 0 ? ((maliciousCount / records) * 100).toFixed(1) : 0

  // Classify each alert
  const enriched = useMemo(() => alerts.map(a => ({ ...a, attackType: classifyAttack(a) })), [alerts])

  // Bar chart — attack type distribution
  const attackDist = useMemo(() => {
    const d = {}
    enriched.forEach(a => { d[a.attackType] = (d[a.attackType] || 0) + 1 })
    return d
  }, [enriched])

  const barData = {
    labels: Object.keys(attackDist),
    datasets: [{
      label: 'Count',
      data: Object.values(attackDist),
      backgroundColor: Object.keys(attackDist).map(k => ATTACK_COLORS[k] || '#94a3b8'),
      borderRadius: 6,
    }]
  }
  const barOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: { beginAtZero: true, grid: { color: '#f1f5f9' } },
      x: { grid: { display: false } }
    }
  }

  // Donut chart — attack vs normal
  const donutData = {
    labels: ['Attack', 'Normal'],
    datasets: [{
      data: [maliciousCount, benignCount],
      backgroundColor: ['#ef4444', '#22c55e'],
      borderWidth: 3, borderColor: '#fff',
    }]
  }
  const donutOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom', labels: { padding: 14 } } },
    cutout: '65%',
  }

  return (
    <div className="analysis-results">
      {/* Banner */}
      <div className={`analysis-banner ${maliciousCount > 0 ? 'banner-threat' : 'banner-safe'}`}>
        {maliciousCount > 0 ? <ShieldAlert size={36} /> : <ShieldCheck size={36} />}
        <div style={{ flex: 1 }}>
          <h2>Analysis Complete!</h2>
          <p>File: <strong>{fileName}</strong></p>
          <p style={{ opacity: 0.85, fontSize: '0.9rem' }}>
            {new Date().toLocaleString()} · {records} records scanned
          </p>
        </div>
        <button className="btn-reset" onClick={onReset}>↩ Upload New File</button>
      </div>

      {/* ML Metrics */}
      <div className="perf-card">
        <div className="perf-title"><Activity size={18} /> ML Model Performance</div>
        <div className="perf-metrics">
          <div className="perf-metric accent-orange">
            <div className="perf-value">{accuracy}{sfx(accuracy)}</div>
            <div className="perf-label">ACCURACY</div>
          </div>
          <div className="perf-metric accent-green">
            <div className="perf-value">{precision}{sfx(precision)}</div>
            <div className="perf-label">PRECISION</div>
          </div>
          <div className="perf-metric accent-green">
            <div className="perf-value">{f1Score}{sfx(f1Score)}</div>
            <div className="perf-label">F1 SCORE</div>
          </div>
          <div className="perf-metric accent-green">
            <div className="perf-value">{recall}{sfx(recall)}</div>
            <div className="perf-label">RECALL</div>
          </div>
        </div>
        <div className="perf-badge">
          <CheckCircle size={13} /> {bm ? 'Metrics from trained model' : 'Computed from this scan'}
        </div>
      </div>

      {/* Summary stat cards */}
      <div className="rp-stats">
        <div className="rp-stat-card rp-blue">
          <div className="rp-stat-icon">📊</div>
          <div className="rp-stat-val">{records.toLocaleString()}</div>
          <div className="rp-stat-lbl">Total Records</div>
        </div>
        <div className="rp-stat-card rp-red">
          <div className="rp-stat-icon">⚠️</div>
          <div className="rp-stat-val">{maliciousCount.toLocaleString()}</div>
          <div className="rp-stat-lbl">Threats Detected</div>
        </div>
        <div className="rp-stat-card rp-green">
          <div className="rp-stat-icon">✅</div>
          <div className="rp-stat-val">{benignCount.toLocaleString()}</div>
          <div className="rp-stat-lbl">Normal Traffic</div>
        </div>
        <div className="rp-stat-card rp-yellow">
          <div className="rp-stat-icon">%</div>
          <div className="rp-stat-val">{threatPct}%</div>
          <div className="rp-stat-lbl">Threat Ratio</div>
        </div>
      </div>

      {/* Charts — Bar + Donut side by side (same as Reports page) */}
      <div className="rp-charts-row">
        <div className="rp-chart-card">
          <div className="rp-chart-title">📈 Attack Types Distribution</div>
          <div style={{ height: 240, width: '100%' }}>
            <Bar data={barData} options={barOptions} />
          </div>
        </div>
        <div className="rp-chart-card rp-donut-card">
          <div className="rp-chart-title">🔵 Prediction Results</div>
          <div style={{ height: 240, width: '100%', maxWidth: 240, margin: '0 auto' }}>
            <Doughnut data={donutData} options={donutOptions} />
          </div>
        </div>
      </div>

      {/* Detailed table — same style as Reports page */}
      <div className="rp-table-card">
        <div className="rp-table-header">
          <span>📋 Detailed Detection Results ({records} rows)</span>
        </div>
        <div style={{ overflowX: 'hidden' }}>
          <table className="rp-table" style={{ width: '100%', tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th style={{ width: 45 }}>#</th>
                <th style={{ width: 130 }}>Timestamp</th>
                <th style={{ width: 80 }}>Dest Port</th>
                <th style={{ width: 90 }}>Prediction</th>
                <th>Attack Type</th>
                <th style={{ width: 90 }}>Confidence</th>
                <th style={{ width: 80 }}>Fwd Pkts</th>
                <th style={{ width: 80 }}>Bwd Pkts</th>
              </tr>
            </thead>
            <tbody>
              {enriched.slice().reverse().map((a, i) => {
                const atColor = ATTACK_COLORS[a.attackType] || '#94a3b8'
                return (
                  <tr key={a.id || i} className="rp-tr">
                    <td className="rp-id">#{enriched.length - i}</td>
                    <td className="rp-ts">{new Date(a.timestamp).toLocaleString('en-GB', { hour12: false })}</td>
                    <td className="rp-port">{a.features?.['Destination Port'] ?? '—'}</td>
                    <td>
                      <span className={`rp-pred-badge ${a.malicious ? 'rp-attack' : 'rp-normal'}`}>
                        {a.malicious ? 'Attack' : 'Normal'}
                      </span>
                    </td>
                    <td>
                      <span className="rp-type-badge" style={{ background: atColor + '22', color: atColor, border: `1px solid ${atColor}55` }}>
                        {a.attackType}
                      </span>
                    </td>
                    <td>
                      <span className="rp-conf-badge">
                        {a.score != null ? (a.score * 100).toFixed(1) + '%' : '—'}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.82rem', color: '#374151' }}>{a.features?.['Total Fwd Packets'] ?? '—'}</td>
                    <td style={{ fontSize: '0.82rem', color: '#374151' }}>{a.features?.['Total Backward Packets'] ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Main Upload Page ────────────────────────────────────────────────────────
export default function Upload() {
  const [file, setFile]         = useState(null)
  const [status, setStatus]     = useState('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [results, setResults]   = useState(null)
  const [progress, setProgress] = useState(0)
  const [modelInfo, setModelInfo] = useState(null)
  const fileInputRef = useRef(null)
  const resultsRef   = useRef(null)

  const handleFileChange = (e) => {
    const selected = e.target.files[0]
    if (selected?.name.endsWith('.csv')) {
      setFile(selected); setStatus('idle'); setErrorMsg(''); setResults(null); setProgress(0)
    } else if (selected) {
      setStatus('error'); setErrorMsg('Please select a valid CSV file.')
    }
  }

  const handleDragOver = (e) => e.preventDefault()
  const handleDrop = (e) => {
    e.preventDefault()
    const selected = e.dataTransfer.files[0]
    if (selected?.name.endsWith('.csv')) {
      setFile(selected); setStatus('idle'); setErrorMsg(''); setResults(null); setProgress(0)
    } else if (selected) {
      setStatus('error'); setErrorMsg('Please drop a valid CSV file.')
    }
  }

  const downloadSample = (filename) => {
    const a = document.createElement('a'); a.href = `/samples/${filename}`; a.download = filename; a.click()
  }

  const processCSV = async () => {
    if (!file) return
    setStatus('processing'); setProgress(0); setResults(null)

    try {
      const infoRes = await fetch(`${getApiBase()}/model/info`)
      if (infoRes.ok) setModelInfo(await infoRes.json())
    } catch {}

    try {
      const text  = await file.text()
      const lines = text.split('\n').filter(l => l.trim().length > 0)
      if (lines.length < 2) throw new Error('CSV file is empty or has no data rows.')

      const headers  = lines[0].split(',').map(h => h.trim())
      const dataRows = lines.slice(1)
      const apiBase  = getApiBase()
      const collected = []
      let totalScore = 0, scoreCount = 0

      for (let i = 0; i < dataRows.length; i++) {
        const values   = dataRows[i].split(',').map(v => v.trim())
        const features = {}
        headers.forEach((h, idx) => {
          features[h] = isNaN(Number(values[idx])) ? values[idx] : Number(values[idx])
        })
        try {
          const res = await fetch(`${apiBase}/ingest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ features })
          })
          if (res.ok) {
            const result = await res.json()
            collected.push({
              id: result.timestamp + '_' + i,
              malicious: result.malicious, score: result.score,
              timestamp: result.timestamp, features
            })
            if (typeof result.score === 'number') { totalScore += result.score; scoreCount++ }
          }
        } catch {}
        setProgress(Math.round(((i + 1) / dataRows.length) * 100))
        await new Promise(r => setTimeout(r, 80))
      }

      const maliciousCount = collected.filter(a => a.malicious).length
      const avgScore = scoreCount > 0 ? totalScore / scoreCount : 0
      const bkM = modelInfo?.metrics

      // Save to DB
      try {
        await fetch(`${apiBase}/reports/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: file.name, total: collected.length,
            malicious: maliciousCount, benign: collected.length - maliciousCount,
            avg_score: avgScore,
            accuracy: bkM?.accuracy ?? null, precision_v: bkM?.precision ?? null,
            f1_score: bkM?.f1_score ?? null, recall: bkM?.recall ?? null,
            rows: collected.map((a, idx) => ({
              row_index: idx, malicious: a.malicious,
              score: a.score ?? null, features: a.features, timestamp: a.timestamp,
            }))
          })
        })
      } catch {}

      setResults({ alerts: collected, maliciousCount, benignCount: collected.length - maliciousCount, avgScore })
      setStatus('done')

      // Scroll to results after a tick
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)

    } catch (err) {
      setStatus('error'); setErrorMsg(err.message || 'Error processing CSV file.')
    }
  }

  const handleReset = () => {
    setFile(null); setStatus('idle'); setErrorMsg(''); setResults(null); setProgress(0)
  }

  return (
    <div className="container upload-container">
      <div className="upload-header">
        <h1>Upload CSV</h1>
        <p>Load network traffic data for analysis</p>
      </div>

      <div className="grid">
        {/* Left — dropzone */}
        <div className="upload-zone-wrapper">
          <div
            className="upload-dropzone"
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current.click()}
          >
            <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".csv" onChange={handleFileChange} />
            {file ? (
              <div className="upload-selected">
                <File size={48} className="file-icon" />
                <p className="file-name">{file.name}</p>
                <p className="file-size">{(file.size / 1024).toFixed(2)} KB</p>
              </div>
            ) : (
              <div className="upload-prompt">
                <UploadCloud size={64} className="upload-icon" />
                <h3>Drop your CSV file here</h3>
                <p>or click to browse</p>
                <div className="upload-badges">
                  <span className="badge">CSV</span>
                  <span className="badge">Max 30 MB</span>
                  <span className="badge">4 features</span>
                </div>
              </div>
            )}
          </div>

          {status === 'processing' && (
            <div className="upload-progress">
              <div className="progress-bar-wrap">
                <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
              </div>
              <p className="progress-label">Processing... {progress}%</p>
            </div>
          )}

          <div className="upload-actions">
            <button
              className="btn btn-primary"
              disabled={!file || status === 'processing'}
              onClick={processCSV}
            >
              {status === 'processing' ? 'Processing...' : '▶ Upload & Run Scan'}
            </button>
            {file && status === 'idle' && (
              <button className="btn btn-secondary" onClick={handleReset}>Clear</button>
            )}
            {results && status === 'done' && (
              <button className="btn btn-secondary" onClick={handleReset}>
                <RefreshCw size={15} style={{ marginRight: 6 }} />
                New Upload
              </button>
            )}
            {status === 'error' && (
              <div className="status-msg error">
                <AlertCircle size={18} />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right — requirements + samples */}
        <div>
          <div className="upload-requirements card" style={{ marginBottom: '16px' }}>
            <div className="card-title">File Requirements</div>
            <ul className="req-list">
              <li><strong>File Format:</strong> Only CSV (.csv) extensions allowed.</li>
              <li><strong>File Size:</strong> Maximum 30 MB per upload.</li>
              <li><strong>Data Structure:</strong> 4 numerical features required.</li>
              <li><strong>Columns:</strong> Destination Port, Flow Duration, Total Fwd Packets, Total Backward Packets</li>
            </ul>
          </div>
          <div className="card sample-downloads-card">
            <div className="card-title"><Download size={16} style={{ display: 'inline', marginRight: 6 }} />Sample CSV Files</div>
            <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '12px' }}>
              Download these pre-built sample files to test the system:
            </p>
            <div className="sample-list">
              {SAMPLE_FILES.map(f => (
                <button key={f.name} className="sample-btn" onClick={() => downloadSample(f.name)}>
                  <span className="sample-label">{f.label}</span>
                  <span className="sample-desc">{f.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Analysis Results below the upload box ─── */}
      {status === 'done' && results && (
        <div ref={resultsRef} style={{ marginTop: 32 }}>
          <AnalysisResults
            results={results}
            fileName={file?.name}
            modelInfo={modelInfo}
            onReset={handleReset}
          />
        </div>
      )}
    </div>
  )
}
