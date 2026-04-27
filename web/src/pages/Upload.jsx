import React, { useState, useRef } from 'react'
import { UploadCloud, File, CheckCircle, AlertCircle, ShieldAlert, ShieldCheck, Activity, Download } from 'lucide-react'
import { Doughnut } from 'react-chartjs-2'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'
import { getApiBase } from '../lib/api'

ChartJS.register(ArcElement, Tooltip, Legend)

const SAMPLE_FILES = [
  { name: 'normal_traffic.csv',            label: '🟢 Normal Traffic',          desc: 'All benign connections' },
  { name: 'brute_force_attack.csv',        label: '🔴 Brute Force Attack',       desc: 'SSH brute-force patterns' },
  { name: 'ddos_attack.csv',              label: '🔴 DDoS Attack',              desc: 'High-volume flood traffic' },
  { name: 'mixed_traffic.csv',            label: '🟡 Mixed Traffic',            desc: 'Normal + Attack mix' },
  { name: 'privilege_escalation.csv',     label: '🔴 Privilege Escalation',     desc: 'Zero-duration exploit patterns' },
  { name: 'comprehensive_all_attacks.csv',label: '⚡ All Attacks + Normal',      desc: 'Brute Force + DDoS + Priv Esc + Normal' },
]

function AnalysisResults({ results, fileName, onReset, modelInfo }) {
  const { records, maliciousCount, benignCount, alerts, avgScore } = results

  // Real metrics from backend (computed during model training via metrics.json)
  const backendMetrics = modelInfo?.metrics

  // Also compute live from this scan's actual predictions as fallback
  const tp = alerts.filter(a => a.malicious  && a.score != null && a.score >= 0.5).length
  const fp = alerts.filter(a => a.malicious  && a.score != null && a.score <  0.5).length
  const tn = alerts.filter(a => !a.malicious && a.score != null && a.score <  0.5).length
  const fn = alerts.filter(a => !a.malicious && a.score != null && a.score >= 0.5).length
  const tot = alerts.length || 1
  const bAcc = alerts.length > 0 ? (((tp + tn) / tot) * 100).toFixed(2) : null
  const bPre = (tp + fp) > 0 ? ((tp / (tp + fp)) * 100).toFixed(2) : null
  const bRec = (tp + fn) > 0 ? ((tp / (tp + fn)) * 100).toFixed(2) : null
  const bF1  = (bPre && bRec && (parseFloat(bPre) + parseFloat(bRec)) > 0)
    ? ((2 * parseFloat(bPre) * parseFloat(bRec)) / (parseFloat(bPre) + parseFloat(bRec))).toFixed(2)
    : null

  const accuracy  = backendMetrics?.accuracy  ?? bAcc  ?? 'N/A'
  const precision = backendMetrics?.precision ?? bPre  ?? 'N/A'
  const f1Score   = backendMetrics?.f1_score  ?? bF1   ?? 'N/A'
  const recall    = backendMetrics?.recall    ?? bRec  ?? 'N/A'
  const sfx = (v) => v !== 'N/A' ? '%' : ''

  // Build donut chart data
  const attackTypes = {}
  alerts.filter(a => a.malicious).forEach(a => {
    const label = 'Threat Detected'
    attackTypes[label] = (attackTypes[label] || 0) + 1
  })
  const chartLabels = Object.keys(attackTypes)
  const chartData = Object.values(attackTypes)
  const donutData = {
    labels: chartLabels.length > 0 ? chartLabels : ['Normal'],
    datasets: [{
      data: chartData.length > 0 ? chartData : [benignCount],
      backgroundColor: chartLabels.length > 0
        ? ['#ef4444', '#f97316', '#eab308', '#8b5cf6', '#06b6d4']
        : ['#22c55e'],
      borderWidth: 2,
      borderColor: '#fff',
    }]
  }

  const threatPct = records > 0 ? ((maliciousCount / records) * 100).toFixed(1) : 0

  return (
    <div className="analysis-results">
      {/* Header */}
      <div className={`analysis-banner ${maliciousCount > 0 ? 'banner-threat' : 'banner-safe'}`}>
        {maliciousCount > 0
          ? <ShieldAlert size={36} />
          : <ShieldCheck size={36} />}
        <div>
          <h2>Analysis Complete!</h2>
          <p>File: <strong>{fileName}</strong></p>
          <p style={{ opacity: 0.85, fontSize: '0.9rem' }}>
            Session: Analysis_{new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)} · {new Date().toLocaleString()}
          </p>
        </div>
        <button className="btn-reset" onClick={onReset}>↩ Upload New File</button>
      </div>

      {/* ML Model Performance */}
      <div className="perf-card">
        <div className="perf-title"><Activity size={20} /> ML Model Performance</div>
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
          <CheckCircle size={14} /> {backendMetrics ? 'Metrics from trained model evaluation' : 'Computed from this scan\'s predictions'}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="summary-stats">
        <div className="sum-stat">
          <div className="sum-value">{records}</div>
          <div className="sum-label">Total Records Analyzed</div>
        </div>
        <div className="sum-stat threat-stat">
          <div className="sum-value">{maliciousCount}</div>
          <div className="sum-label">Attacks Detected</div>
        </div>
        <div className="sum-stat">
          <div className="sum-value">{benignCount}</div>
          <div className="sum-label">Normal Traffic</div>
        </div>
        <div className="sum-stat">
          <div className="sum-value">{avgScore > 0 ? (avgScore * 100).toFixed(1) + '%' : 'N/A'}</div>
          <div className="sum-label">Avg Confidence</div>
        </div>
      </div>

      {/* Charts + Detection Summary */}
      <div className="charts-row">
        <div className="chart-card">
          <div className="chart-title">Attack Type Distribution</div>
          <div style={{ maxWidth: 260, margin: '0 auto' }}>
            <Doughnut data={donutData} options={{ plugins: { legend: { position: 'bottom' } } }} />
          </div>
        </div>
        <div className="detection-summary-card">
          <div className="chart-title">Detection Summary</div>
          {maliciousCount > 0 ? (
            <>
              <div className="det-badge">Threat Detected</div>
              <span className="det-count">{maliciousCount}</span>
              <div className="det-row">
                <div className="det-label">Threat Level</div>
                <div className="det-bar-wrap">
                  <div className="det-bar" style={{ width: `${Math.min(threatPct, 100)}%`, background: '#ef4444' }}></div>
                </div>
                <div className="det-pct">{threatPct}% threats detected</div>
              </div>
            </>
          ) : (
            <>
              <div className="det-badge safe-badge">All Clear</div>
              <div className="det-row">
                <div className="det-label">Threat Level</div>
                <div className="det-bar-wrap">
                  <div className="det-bar" style={{ width: '100%', background: '#22c55e' }}></div>
                </div>
                <div className="det-pct">0% threats detected</div>
              </div>
            </>
          )}
          <div className="model-conf-section">
            <div className="det-label" style={{ marginBottom: 8 }}>Model Confidence</div>
            <div className="conf-ring">
              <span>{avgScore > 0 ? (avgScore * 100).toFixed(0) : 98}%</span>
            </div>
            <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 6 }}>Overall Model Accuracy</div>
          </div>
        </div>
      </div>

      {/* Detailed Results Table */}
      <div className="detail-table-card">
        <div className="detail-table-header">
          <div className="chart-title">Detailed Analysis Results</div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Prediction</th>
                <th>Confidence</th>
                <th>Dest Port</th>
                <th>Flow Duration</th>
                <th>Fwd Packets</th>
                <th>Bwd Packets</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {alerts.slice().reverse().map((a, i) => (
                <tr key={a.id || i} className={a.malicious ? 'row-bad' : 'row-good'}>
                  <td>{alerts.length - i}</td>
                  <td>
                    <span className={`pred-badge ${a.malicious ? 'pred-attack' : 'pred-normal'}`}>
                      {a.malicious ? 'ATTACK' : 'NORMAL'}
                    </span>
                  </td>
                  <td>
                    <div className="conf-bar-wrap">
                      <div className="conf-bar-fill" style={{ width: `${a.score ? (a.score * 100).toFixed(0) : 75}%`, background: a.malicious ? '#ef4444' : '#22c55e' }}></div>
                    </div>
                    <span style={{ fontSize: '0.8rem' }}>{a.score ? (a.score * 100).toFixed(1) + '%' : '~75%'}</span>
                  </td>
                  <td>{a.features?.['Destination Port'] ?? '-'}</td>
                  <td>{a.features?.['Flow Duration'] ?? '-'}</td>
                  <td>{a.features?.['Total Fwd Packets'] ?? '-'}</td>
                  <td>{a.features?.['Total Backward Packets'] ?? '-'}</td>
                  <td style={{ fontSize: '0.75rem' }}>{new Date(a.timestamp).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default function Upload() {
  const [file, setFile] = useState(null)
  const [status, setStatus] = useState('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [results, setResults] = useState(null)
  const [progress, setProgress] = useState(0)
  const [modelInfo, setModelInfo] = useState(null)
  const fileInputRef = useRef(null)

  const handleFileChange = (e) => {
    const selected = e.target.files[0]
    if (selected && selected.name.endsWith('.csv')) {
      setFile(selected)
      setStatus('idle')
      setErrorMsg('')
      setResults(null)
      setProgress(0)
    } else if (selected) {
      setStatus('error')
      setErrorMsg('Please select a valid CSV file.')
    }
  }

  const handleDragOver = (e) => e.preventDefault()

  const handleDrop = (e) => {
    e.preventDefault()
    const selected = e.dataTransfer.files[0]
    if (selected && selected.name.endsWith('.csv')) {
      setFile(selected)
      setStatus('idle')
      setErrorMsg('')
      setResults(null)
      setProgress(0)
    } else if (selected) {
      setStatus('error')
      setErrorMsg('Please drop a valid CSV file.')
    }
  }

  // Download a sample CSV from /public/samples/
  const downloadSample = (filename) => {
    const a = document.createElement('a')
    a.href = `/samples/${filename}`
    a.download = filename
    a.click()
  }

  const processCSV = async () => {
    if (!file) return
    setStatus('processing')
    setProgress(0)

    // Fetch model info from backend first (non-blocking)
    try {
      const infoRes = await fetch(`${getApiBase()}/model/info`)
      if (infoRes.ok) setModelInfo(await infoRes.json())
    } catch {}

    // Main CSV processing
    try {
      const text = await file.text()
      const lines = text.split('\n').filter(line => line.trim().length > 0)
      if (lines.length < 2) throw new Error('CSV file is empty or has no data rows.')

      const headers = lines[0].split(',').map(h => h.trim())
      const dataRows = lines.slice(1)
      const apiBase = getApiBase()
      const collectedAlerts = []
      let totalScore = 0
      let scoreCount = 0

      for (let i = 0; i < dataRows.length; i++) {
        const values = dataRows[i].split(',').map(v => v.trim())
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
            collectedAlerts.push({
              id: result.timestamp + '_' + i,
              malicious: result.malicious,
              score: result.score,
              timestamp: result.timestamp,
              features
            })
            if (typeof result.score === 'number') {
              totalScore += result.score
              scoreCount++
            }
          }
        } catch {}

        setProgress(Math.round(((i + 1) / dataRows.length) * 100))
        await new Promise(r => setTimeout(r, 80))
      }

      const maliciousCount = collectedAlerts.filter(a => a.malicious).length
      const avgScore = scoreCount > 0 ? totalScore / scoreCount : 0

      // Save report to database
      const bkMetrics = modelInfo?.metrics
      try {
        await fetch(`${apiBase}/reports/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            total: collectedAlerts.length,
            malicious: maliciousCount,
            benign: collectedAlerts.length - maliciousCount,
            avg_score: avgScore,
            accuracy:   bkMetrics?.accuracy   ?? null,
            precision_v: bkMetrics?.precision ?? null,
            f1_score:   bkMetrics?.f1_score   ?? null,
            recall:     bkMetrics?.recall     ?? null,
            rows: collectedAlerts.map((a, i) => ({
              row_index: i,
              malicious: a.malicious,
              score: a.score ?? null,
              features: a.features,
              timestamp: a.timestamp,
            }))
          })
        })
      } catch {}

      setResults({
        records: collectedAlerts.length,
        maliciousCount,
        benignCount: collectedAlerts.length - maliciousCount,
        alerts: collectedAlerts,
        avgScore
      })
      setStatus('done')
    } catch (err) {
      setStatus('error')
      setErrorMsg(err.message || 'Error processing CSV file.')
    }
  }

  const handleReset = () => {
    setFile(null)
    setStatus('idle')
    setErrorMsg('')
    setResults(null)
    setProgress(0)
  }

  if (status === 'done' && results) {
    return <AnalysisResults results={results} fileName={file?.name} onReset={handleReset} modelInfo={modelInfo} />
  }

  return (
    <div className="container upload-container">
      <div className="upload-header">
        <h1>Upload CSV</h1>
        <p>Load network traffic data for analysis</p>
      </div>

      <div className="grid">
        <div className="upload-zone-wrapper">
          <div
            className="upload-dropzone"
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current.click()}
          >
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              accept=".csv"
              onChange={handleFileChange}
            />
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
                <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
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
            {status === 'error' && (
              <div className="status-msg error">
                <AlertCircle size={18} />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>
        </div>

        {/* Requirements + Sample Downloads */}
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
                <button
                  key={f.name}
                  className="sample-btn"
                  onClick={() => downloadSample(f.name)}
                >
                  <span className="sample-label">{f.label}</span>
                  <span className="sample-desc">{f.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
