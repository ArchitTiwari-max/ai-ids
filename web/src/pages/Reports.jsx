import React, { useEffect, useState, useMemo } from 'react'
import { Bar, Doughnut } from 'react-chartjs-2'
import {
  Chart as ChartJS, ArcElement, Tooltip, Legend,
  CategoryScale, LinearScale, BarElement, Title
} from 'chart.js'
import { BarChart2, ShieldAlert, Download, Eye, Filter, X } from 'lucide-react'
import { getApiBase } from '../lib/api'

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title)

// ─── Classify attack type from features ─────────────────────────────────────
function classifyAttack(row) {
  if (!row.malicious) return 'Normal'
  const f = row.features || {}
  const port = f['Destination Port'] ?? 0
  const dur  = f['Flow Duration']    ?? 0
  const fwd  = f['Total Fwd Packets']        ?? 0
  const bwd  = f['Total Backward Packets']   ?? 0

  if (port === 22 && fwd > 100)              return 'Brute Force Attacks'
  if (dur > 50000 && fwd > 500 && bwd <= 2)  return 'DDoS Attack'
  if (dur === 0   && bwd === 0)              return 'Privilege Escalation'
  return 'Port Scanning / Reconnaissance'
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmt(v) { return v != null ? Number(v).toFixed(1) + '%' : 'N/A' }
function fmtDate(iso) {
  try { return new Date(iso).toLocaleString('en-GB', { hour12: false }) } catch { return iso }
}

const ATTACK_COLORS = {
  'Brute Force Attacks':            '#ef4444',
  'DDoS Attack':                    '#f97316',
  'Privilege Escalation':           '#eab308',
  'Port Scanning / Reconnaissance': '#8b5cf6',
  'Normal':                         '#22c55e',
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function Reports() {
  const [allRows, setAllRows] = useState([])      // flat list of all rows across reports
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)
  const [search, setSearch] = useState('')
  const [filterAttack, setFilterAttack] = useState('All Types')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [activeFilters, setActiveFilters] = useState({})
  const [selectedRow, setSelectedRow] = useState(null)

  const apiBase = getApiBase()

  // Fetch all reports and flatten into rows
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const listRes = await fetch(`${apiBase}/reports?limit=200`)
        if (!listRes.ok) return
        const { reports } = await listRes.json()

        // Fetch full rows for each report (parallel)
        const details = await Promise.all(
          reports.map(r => fetch(`${apiBase}/reports/${r.id}`).then(x => x.json()).catch(() => null))
        )

        const flat = []
        details.forEach(detail => {
          if (!detail?.rows) return
          detail.rows.forEach(row => {
            flat.push({
              ...row,
              filename: detail.filename,
              reportId: detail.id,
              attackType: classifyAttack(row),
            })
          })
        })
        // Sort by timestamp desc
        flat.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        setAllRows(flat)
      } catch {}
      setLoading(false)
    }
    load()
  }, [])

  // Apply filters
  const applyFilters = () => {
    setActiveFilters({ attack: filterAttack, from: filterFrom, to: filterTo })
    setPage(1)
  }
  const clearFilters = () => {
    setFilterAttack('All Types')
    setFilterFrom('')
    setFilterTo('')
    setActiveFilters({})
    setSearch('')
    setPage(1)
  }

  const filtered = useMemo(() => {
    return allRows.filter(row => {
      if (activeFilters.attack && activeFilters.attack !== 'All Types') {
        if (row.attackType !== activeFilters.attack) return false
      }
      if (activeFilters.from) {
        if (new Date(row.timestamp) < new Date(activeFilters.from)) return false
      }
      if (activeFilters.to) {
        if (new Date(row.timestamp) > new Date(activeFilters.to + 'T23:59:59')) return false
      }
      if (search) {
        const s = search.toLowerCase()
        if (!row.attackType.toLowerCase().includes(s) &&
            !row.filename?.toLowerCase().includes(s)) return false
      }
      return true
    })
  }, [allRows, activeFilters, search])

  // Stats
  const totalRecords  = filtered.length
  const totalThreats  = filtered.filter(r => r.malicious).length
  const totalNormal   = filtered.filter(r => !r.malicious).length
  const avgConf       = filtered.length > 0
    ? filtered.reduce((s, r) => s + (r.score ?? 0.75), 0) / filtered.length * 100
    : 0

  // Bar chart — attack type distribution
  const attackDist = useMemo(() => {
    const dist = {}
    filtered.forEach(r => {
      dist[r.attackType] = (dist[r.attackType] || 0) + 1
    })
    return dist
  }, [filtered])

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
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: { beginAtZero: true, grid: { color: '#f1f5f9' } },
      x: { grid: { display: false } }
    }
  }

  // Donut chart
  const donutData = {
    labels: ['Attack', 'Normal'],
    datasets: [{
      data: [totalThreats, totalNormal],
      backgroundColor: ['#ef4444', '#22c55e'],
      borderWidth: 3,
      borderColor: '#fff',
    }]
  }
  const donutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { padding: 16 } }
    },
    cutout: '65%',
  }

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const pageRows = filtered.slice((page - 1) * perPage, page * perPage)

  // Export
  const exportCSV = () => {
    const headers = ['ID','Timestamp','Prediction','Attack Type','Confidence','Source','Dest Port','Flow Duration','Fwd Packets','Bwd Packets']
    const rows = filtered.map((r, i) => [
      `#${10000 + i}`,
      fmtDate(r.timestamp),
      r.malicious ? 'Attack' : 'Normal',
      r.attackType,
      r.score != null ? (r.score * 100).toFixed(1) + '%' : '—',
      'live_ml',
      r.features?.['Destination Port'] ?? '',
      r.features?.['Flow Duration'] ?? '',
      r.features?.['Total Fwd Packets'] ?? '',
      r.features?.['Total Backward Packets'] ?? '',
    ])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const a = document.createElement('a')
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    a.download = `ids_report_${Date.now()}.csv`
    a.click()
  }

  return (
    <div className="rp-page">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="rp-topbar">
        <h1 className="rp-title"><BarChart2 size={26} /> Reports and Analysis</h1>
        <button className="rp-export-btn" onClick={exportCSV}>
          <Download size={16} /> Export Full CSV
        </button>
      </div>

      {/* ── Filter Box ─────────────────────────────────────────────────────── */}
      <div className="rp-filter-card">
        <div className="rp-filter-header"><Filter size={16} /> Filter and Search</div>
        <div className="rp-filter-body">
          <div className="rp-filter-field">
            <label>Attack Type</label>
            <select value={filterAttack} onChange={e => setFilterAttack(e.target.value)}>
              <option>All Types</option>
              <option>Brute Force Attacks</option>
              <option>DDoS Attack</option>
              <option>Privilege Escalation</option>
              <option>Port Scanning / Reconnaissance</option>
              <option>Normal</option>
            </select>
          </div>
          <div className="rp-filter-field">
            <label>From Date</label>
            <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} />
          </div>
          <div className="rp-filter-field">
            <label>To Date</label>
            <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} />
          </div>
          <div className="rp-filter-field">
            <label>Search</label>
            <input
              type="text" placeholder="Filename or attack type..."
              value={search} onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="rp-filter-actions">
          <button className="rp-apply-btn" onClick={applyFilters}>
            🔍 Apply Filters
          </button>
          <button className="rp-clear-btn" onClick={clearFilters}>
            <X size={14} /> Clear Filters
          </button>
        </div>
      </div>

      {/* ── Stat Cards ─────────────────────────────────────────────────────── */}
      <div className="rp-stats">
        <div className="rp-stat-card rp-blue">
          <div className="rp-stat-icon">📊</div>
          <div className="rp-stat-val">{totalRecords.toLocaleString()}</div>
          <div className="rp-stat-lbl">Total Records</div>
        </div>
        <div className="rp-stat-card rp-red">
          <div className="rp-stat-icon">⚠️</div>
          <div className="rp-stat-val">{totalThreats.toLocaleString()}</div>
          <div className="rp-stat-lbl">Threats Detected</div>
        </div>
        <div className="rp-stat-card rp-green">
          <div className="rp-stat-icon">✅</div>
          <div className="rp-stat-val">{totalNormal.toLocaleString()}</div>
          <div className="rp-stat-lbl">Normal Traffic</div>
        </div>
        <div className="rp-stat-card rp-yellow">
          <div className="rp-stat-icon">%</div>
          <div className="rp-stat-val">{avgConf.toFixed(1)}%</div>
          <div className="rp-stat-lbl">Average Confidence</div>
        </div>
      </div>

      {/* ── Charts ─────────────────────────────────────────────────────────── */}
      {!loading && allRows.length > 0 && (
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
      )}

      {/* ── Detailed Table ─────────────────────────────────────────────────── */}
      <div className="rp-table-card">
        <div className="rp-table-header">
          <span>📋 Detailed Detection Reports (Last {filtered.length})</span>
          <div className="rp-table-controls">
            <select
              value={perPage}
              onChange={e => { setPerPage(Number(e.target.value)); setPage(1) }}
            >
              <option value={10}>10 per page</option>
              <option value={25}>25 per page</option>
              <option value={50}>50 per page</option>
              <option value={100}>100 per page</option>
            </select>
            <input
              className="rp-table-search"
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="rp-loading">Loading reports...</div>
        ) : filtered.length === 0 ? (
          <div className="rp-empty">
            No records found. Upload a CSV to start analysis.
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'hidden' }}>
            <table className="rp-table" style={{ width: '100%', tableLayout: 'fixed' }}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Timestamp</th>
                    <th>Dest Port</th>
                    <th>Prediction</th>
                    <th>Attack Type</th>
                    <th>Confidence</th>
                    <th>File</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row, i) => {
                    const globalIdx = (page - 1) * perPage + i
                    const rowNum = filtered.length - globalIdx
                    const atColor = ATTACK_COLORS[row.attackType] || '#94a3b8'
                    return (
                      <tr key={globalIdx} className="rp-tr">
                        <td className="rp-id">#{(page - 1) * perPage + i + 1}</td>
                        <td className="rp-ts">{fmtDate(row.timestamp)}</td>
                        <td className="rp-port">{row.features?.['Destination Port'] ?? '—'}</td>
                        <td>
                          <span className={`rp-pred-badge ${row.malicious ? 'rp-attack' : 'rp-normal'}`}>
                            {row.malicious ? 'Attack' : 'Normal'}
                          </span>
                        </td>
                        <td>
                          <span className="rp-type-badge" style={{ background: atColor + '22', color: atColor, border: `1px solid ${atColor}55` }}>
                            {row.attackType}
                          </span>
                        </td>
                        <td>
                          <span className="rp-conf-badge">
                            {row.score != null ? (row.score * 100).toFixed(1) + '%' : '—'}
                          </span>
                        </td>
                        <td className="rp-file-cell" title={row.filename}>{row.filename?.split('/').pop()}</td>
                        <td>
                          <button className="rp-eye-btn" onClick={() => setSelectedRow(row)} title="View details">
                            <Eye size={15} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="rp-pagination">
              <span className="rp-page-info">
                Showing {Math.min((page-1)*perPage+1, filtered.length)}–{Math.min(page*perPage, filtered.length)} of {filtered.length}
              </span>
              <div className="rp-page-btns">
                <button onClick={() => setPage(1)} disabled={page === 1}>«</button>
                <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}>‹</button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const p = Math.max(1, Math.min(page - 2 + i, totalPages - 4 + i))
                  return (
                    <button key={p} onClick={() => setPage(p)} className={page === p ? 'rp-active-page' : ''}>
                      {p}
                    </button>
                  )
                })}
                <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages}>›</button>
                <button onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Row Detail Modal ────────────────────────────────────────────────── */}
      {selectedRow && (
        <div className="modal-overlay" onClick={() => setSelectedRow(null)}>
          <div className="rp-detail-modal" onClick={e => e.stopPropagation()}>
            <div className="rp-detail-header">
              <span>Row Details</span>
              <button className="modal-close" onClick={() => setSelectedRow(null)}><X size={18} /></button>
            </div>
            <div className="rp-detail-body">
              <div className="rp-detail-grid">
                <div><b>Prediction:</b>
                  <span className={`rp-pred-badge ${selectedRow.malicious ? 'rp-attack' : 'rp-normal'}`} style={{ marginLeft: 8 }}>
                    {selectedRow.malicious ? 'Attack' : 'Normal'}
                  </span>
                </div>
                <div><b>Attack Type:</b> {selectedRow.attackType}</div>
                <div><b>Confidence:</b> {selectedRow.score != null ? (selectedRow.score * 100).toFixed(2) + '%' : 'N/A'}</div>
                <div><b>Timestamp:</b> {fmtDate(selectedRow.timestamp)}</div>
                <div><b>Source File:</b> {selectedRow.filename}</div>
                <div><b>Source:</b> live_ml</div>
              </div>
              <div className="rp-detail-features">
                <b>Network Features:</b>
                <div className="rp-feat-grid">
                  {Object.entries(selectedRow.features || {}).map(([k, v]) => (
                    <div key={k} className="rp-feat-item">
                      <span className="rp-feat-key">{k}</span>
                      <span className="rp-feat-val">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
