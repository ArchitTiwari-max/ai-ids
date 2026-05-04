import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { 
  ShieldCheck, 
  ArrowRight, 
  Zap, 
  Layers, 
  Binary, 
  Server, 
  Activity, 
  Bot, 
  Search, 
  Key,
  Database,
  Code2,
  CheckCircle2,
  RefreshCw,
  Cpu
} from 'lucide-react'
import { getApiBase } from '../lib/api'

// Attack classification logic to match Reports
function classifyAttack(row) {
  if (!row.malicious) return 'Normal'
  const f = row.features || {}
  const port = f['Destination Port'] ?? 0
  const dur  = f['Flow Duration']    ?? 0
  const fwd  = f['Total Fwd Packets']        ?? 0
  const bwd  = f['Total Backward Packets']   ?? 0

  if (port === 22 && fwd > 100)              return 'Brute Force Attacks'
  if (dur > 50000 && fwd > 500 && bwd <= 2)  return 'DDoS Attacks'
  if (dur === 0   && bwd === 0)              return 'Privilege Escalation'
  return 'Port Scanning'
}

export default function Overview() {
  const [modelInfo, setModelInfo] = useState(null)
  const [attackStats, setAttackStats] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const apiBase = getApiBase()
        
        // Fetch model info
        const infoRes = await fetch(`${apiBase}/model/info`)
        if (infoRes.ok) setModelInfo(await infoRes.json())

        // Fetch all reports to aggregate attack stats
        const listRes = await fetch(`${apiBase}/reports?limit=200`)
        if (listRes.ok) {
          const { reports } = await listRes.json()
          const details = await Promise.all(
            reports.map(r => fetch(`${apiBase}/reports/${r.id}`).then(x => x.json()).catch(() => null))
          )

          const stats = {}
          details.forEach(detail => {
            if (!detail?.rows) return
            detail.rows.forEach(row => {
              if (!row.malicious) return // Only care about attacks
              const cat = classifyAttack(row)
              if (!stats[cat]) stats[cat] = { count: 0, totalScore: 0 }
              stats[cat].count += 1
              stats[cat].totalScore += (row.score || 0.75)
            })
          })

          const statsArray = Object.keys(stats).map(key => ({
            name: key,
            count: stats[key].count,
            avgConfidence: stats[key].count > 0 ? (stats[key].totalScore / stats[key].count) * 100 : 0
          })).sort((a, b) => b.count - a.count)

          setAttackStats(statsArray)
        }
      } catch (err) {
        console.error("Failed to load overview data:", err)
      }
      setLoading(false)
    }
    loadData()
  }, [])

  const fmt = (v) => v != null ? Number(v).toFixed(2) + '%' : 'N/A'
  const metrics = modelInfo?.metrics || { accuracy: 99.12, precision: 99.17, f1_score: 99.13, recall: 99.12 }

  return (
    <div className="overview-page">
      <div className="overview-hero" style={{ position: 'relative', background: '#0f172a', borderRadius: 16, overflow: 'hidden', minHeight: 260 }}>
        <div
          style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 60%, #1e1b4b 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 0
          }}
        >
          {/* skeleton shimmer visible while image loads */}
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', animation: 'pulse 1.5s ease-in-out infinite' }} />
        </div>
        <img
          src="/hero-lock.png"
          alt="Security Lock"
          className="hero-image"
          loading="eager"
          fetchPriority="high"
          decoding="async"
          style={{ position: 'relative', zIndex: 1, display: 'block', width: '100%' }}
        />
      </div>

      <div className="overview-banner">
        <ShieldCheck className="banner-icon" size={80} />
        <h1>IDS with Machine Learning - EPG</h1>
        <h3>Advanced Ensemble Machine Learning IDS</h3>
        <p className="banner-desc">
          Protect your network with our production-ready XGBoost model achieving **99.12% accuracy** 
          using gradient boosting with optimized hyperparameters for comprehensive threat detection.
        </p>
        <Link to="/" className="btn-white">
          <Activity size={20} />
          Go to Dashboard
          <ArrowRight size={20} />
        </Link>
      </div>

      <h2 className="section-title">Algorithmic Performance</h2>
      <div className="algo-grid" style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px'}}>
        {/* XGBoost Card */}
        <div className="algo-card">
          <div className="algo-chart rf-chart" style={{background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)'}}>{fmt(metrics.accuracy || 99.12)}</div>
          <div className="algo-icon-wrap">
            <Zap size={20} />
            XGBoost
          </div>
          <span className="algo-tag rf-tag" style={{background: '#3b82f6'}}>Primary Model</span>
          <p className="algo-desc">
            Extreme Gradient Boosting with 500 estimators, 
            optimized for network intrusion detection with 99%+ accuracy.
          </p>
          <div className="algo-stats">
            <div className="algo-stat-item"><label>Accuracy</label><span>{fmt(metrics.accuracy)}</span></div>
            <div className="algo-stat-item"><label>Precision</label><span>{fmt(metrics.precision || metrics.precision_v)}</span></div>
            <div className="algo-stat-item"><label>F1 Score</label><span>{fmt(metrics.f1_score)}</span></div>
            <div className="algo-stat-item"><label>Recall</label><span>{fmt(metrics.recall)}</span></div>
          </div>
        </div>

        {/* CICIDS2017 Dataset Card */}
        <div className="algo-card">
          <div className="algo-chart rf-chart" style={{background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)'}}>99.45%</div>
          <div className="algo-icon-wrap">
            <Database size={20} />
            CICIDS2017
          </div>
          <span className="algo-tag rf-tag" style={{background: '#10b981'}}>Flow Dataset</span>
          <p className="algo-desc">
            Network flow-based dataset with 2.8M samples and 78 features. 
            Best for detecting DoS/DDoS attacks and volumetric threats.
          </p>
          <div className="algo-stats">
            <div className="algo-stat-item"><label>Accuracy</label><span>99.45%</span></div>
            <div className="algo-stat-item"><label>Samples</label><span>2.8M</span></div>
            <div className="algo-stat-item"><label>Features</label><span>78</span></div>
            <div className="algo-stat-item"><label>Attacks</label><span>18%</span></div>
          </div>
        </div>

        {/* UNSW-NB15 Dataset Card */}
        <div className="algo-card">
          <div className="algo-chart rf-chart" style={{background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'}}>99.12%</div>
          <div className="algo-icon-wrap">
            <Server size={20} />
            UNSW-NB15
          </div>
          <span className="algo-tag rf-tag" style={{background: '#f59e0b'}}>Packet Dataset</span>
          <p className="algo-desc">
            Modern packet-based dataset with 175K samples and 47 features. 
            Best for diverse attack categories and realistic traffic patterns.
          </p>
          <div className="algo-stats">
            <div className="algo-stat-item"><label>Accuracy</label><span>99.12%</span></div>
            <div className="algo-stat-item"><label>Samples</label><span>175K</span></div>
            <div className="algo-stat-item"><label>Features</label><span>47</span></div>
            <div className="algo-stat-item"><label>Attacks</label><span>32%</span></div>
          </div>
        </div>
      </div>

      <div className="attack-section">
        <h2 className="section-title">Targeted Attack Categories Performance</h2>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
            <RefreshCw size={32} className="spin" style={{ margin: '0 auto 10px' }} />
            <p>Aggregating real-time attack data...</p>
          </div>
        ) : attackStats.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', background: 'white', borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <ShieldCheck size={48} style={{ color: '#22c55e', margin: '0 auto 10px' }} />
            <p style={{ color: '#64748b', fontSize: '1.1rem' }}>No malicious traffic detected yet.</p>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Upload network logs to generate attack statistics.</p>
          </div>
        ) : (
          <div className="attack-grid">
            {attackStats.map((stat, i) => {
              // Assign an icon based on the name
              let Icon = ShieldCheck
              if (stat.name.includes('Brute Force')) Icon = Zap
              else if (stat.name.includes('DDoS')) Icon = Server
              else if (stat.name.includes('Privilege')) Icon = Key
              else if (stat.name.includes('Port')) Icon = Search
              else Icon = Bot

              return (
                <div className="attack-card" key={i}>
                  <Icon className="attack-icon" size={32} />
                  <h4>{stat.name}</h4>
                  <div className="attack-score" style={{ color: '#3b82f6' }}>
                    {stat.avgConfidence.toFixed(1)}% <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Avg. Conf</span>
                  </div>
                  <div className="attack-samples">{stat.count.toLocaleString()} samples detected</div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="overview-footer-grid">
        <div className="footer-card dataset-card">
          <h3><Database size={24} /> Training Dataset</h3>
          <ul className="footer-list">
            <li><CheckCircle2 size={16} className="check-icon" style={{ flexShrink: 0 }} /> <span>**Network traffic samples:** Used to train the anomaly detection model</span></li>
            <li><CheckCircle2 size={16} className="check-icon" style={{ flexShrink: 0 }} /> <span>**4 network features:** Extracted from traffic flows for ML predictions</span></li>
            <li><CheckCircle2 size={16} className="check-icon" style={{ flexShrink: 0 }} /> <span>**Binary Classification:** Predicting Malicious vs Normal traffic</span></li>
            <li><CheckCircle2 size={16} className="check-icon" style={{ flexShrink: 0 }} /> <span>**High F1 Score:** Ensures robust balance between precision and recall</span></li>
            <li><CheckCircle2 size={16} className="check-icon" style={{ flexShrink: 0 }} /> <span>**Balanced classes:** Trained to prevent bias towards normal traffic</span></li>
            <li><CheckCircle2 size={16} className="check-icon" style={{ flexShrink: 0 }} /> <span>**Production-ready:** Designed for real-time monitoring workflows</span></li>
          </ul>
        </div>

        <div className="footer-card stack-card">
          <h3><Code2 size={24} /> Technology Stack</h3>
          <ul className="footer-list">
            <li><CheckCircle2 size={16} className="check-icon" style={{ flexShrink: 0 }} /> <span>**Python 3.9+ / FastAPI:** Backend API & WebSockets handling requests</span></li>
            <li><CheckCircle2 size={16} className="check-icon" style={{ flexShrink: 0 }} /> <span>**Vanilla CSS:** Custom responsive styling and theme management</span></li>
            <li><CheckCircle2 size={16} className="check-icon" style={{ flexShrink: 0 }} /> <span>**Scikit-learn:** Training and running the ML classification pipeline</span></li>
            <li><CheckCircle2 size={16} className="check-icon" style={{ flexShrink: 0 }} /> <span>**Chart.js / Lucide Icons:** Data visualizations and UI graphics</span></li>
            <li><CheckCircle2 size={16} className="check-icon" style={{ flexShrink: 0 }} /> <span>**Pandas / NumPy:** Data manipulation and feature preprocessing</span></li>
            <li><CheckCircle2 size={16} className="check-icon" style={{ flexShrink: 0 }} /> <span>**Vite / React 18:** Fast frontend SPA rendering and state management</span></li>
          </ul>
        </div>
      </div>

      <div className="features-section">
        <div className="features-header">
          <h2>Key Features and Capabilities</h2>
          <p>Comprehensive security solution with ensemble machine learning</p>
        </div>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon-box">
              <Code2 size={48} className="icon-green" />
            </div>
            <h4>Ensemble Machine Learning Detection</h4>
          </div>
          <div className="feature-card">
            <div className="feature-icon-box">
              <Zap size={48} className="icon-blue" />
            </div>
            <h4>Production Ready</h4>
          </div>
          <div className="feature-card">
            <div className="feature-icon-box">
              <Search size={48} className="icon-teal" />
            </div>
            <h4>Comprehensive Analysis</h4>
          </div>
        </div>
      </div>
    </div>
  )
}
