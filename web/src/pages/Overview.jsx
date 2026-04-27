import React from 'react'
import { Link } from 'react-router-dom'
import { 
  ShieldCheck, 
  ArrowRight, 
  Trees, 
  Layers, 
  Binary, 
  Server, 
  Zap, 
  Activity, 
  Bot, 
  Search, 
  Key,
  Database,
  Code2,
  CheckCircle2
} from 'lucide-react'

export default function Overview() {
  return (
    <div className="overview-page">
      <div className="overview-hero">
        <img src="/hero-lock.png" alt="Security Lock" className="hero-image" />
      </div>

      <div className="overview-banner">
        <ShieldCheck className="banner-icon" size={80} />
        <h1>IDS with Machine Learning - EPG</h1>
        <h3>Advanced Ensemble Machine Learning IDS</h3>
        <p className="banner-desc">
          Protect your network with our production-ready ensemble model achieving **98.12% accuracy** 
          using Random Forest, Extra Trees, and Decision Tree algorithms for comprehensive threat detection.
        </p>
        <Link to="/" className="btn-white">
          <Activity size={20} />
          Go to Dashboard
          <ArrowRight size={20} />
        </Link>
      </div>

      <h2 className="section-title">Algorithmic Performance</h2>
      <div className="algo-grid">
        <div className="algo-card">
          <div className="algo-chart rf-chart">98.1%</div>
          <div className="algo-icon-wrap">
            <Trees size={20} />
            Random Forest
          </div>
          <span className="algo-tag rf-tag">Best Performer</span>
          <p className="algo-desc">
            Primary Algorithm - Ensemble learning method using multiple decision trees 
            with bootstrap aggregation for robust predictions.
          </p>
          <div className="algo-stats">
            <div className="algo-stat-item"><label>Accuracy</label><span>98.12%</span></div>
            <div className="algo-stat-item"><label>Precision</label><span>98.17%</span></div>
            <div className="algo-stat-item"><label>F1 Score</label><span>98.13%</span></div>
            <div className="algo-stat-item"><label>Recall</label><span>98.12%</span></div>
          </div>
        </div>

        <div className="algo-card">
          <div className="algo-chart et-chart">98.0%</div>
          <div className="algo-icon-wrap">
            <Layers size={20} />
            Extra Trees
          </div>
          <span className="algo-tag et-tag">Runner-up</span>
          <p className="algo-desc">
            Ensemble Member - Extremely randomized trees providing improved 
            generalization and reduced overfitting.
          </p>
          <div className="algo-stats">
            <div className="algo-stat-item"><label>Accuracy</label><span>98.06%</span></div>
            <div className="algo-stat-item"><label>Precision</label><span>98.12%</span></div>
            <div className="algo-stat-item"><label>F1 Score</label><span>98.07%</span></div>
            <div className="algo-stat-item"><label>Recall</label><span>98.06%</span></div>
          </div>
        </div>

        <div className="algo-card">
          <div className="algo-chart dt-chart">98.0%</div>
          <div className="algo-icon-wrap">
            <Binary size={20} />
            Decision Tree
          </div>
          <span className="algo-tag dt-tag">Interpretable</span>
          <p className="algo-desc">
            Ensemble Member - Provides clear decision paths and high interpretability 
            for security analysis and troubleshooting.
          </p>
          <div className="algo-stats">
            <div className="algo-stat-item"><label>Accuracy</label><span>98.06%</span></div>
            <div className="algo-stat-item"><label>Precision</label><span>98.12%</span></div>
            <div className="algo-stat-item"><label>F1 Score</label><span>98.07%</span></div>
            <div className="algo-stat-item"><label>Recall</label><span>98.06%</span></div>
          </div>
        </div>
      </div>

      <div className="attack-section">
        <h2 className="section-title">Targeted Attack Categories Performance</h2>
        <div className="attack-grid">
          <div className="attack-card">
            <Server className="attack-icon" size={32} />
            <h4>Service Exploits</h4>
            <div className="attack-score">98.48%</div>
            <div className="attack-samples">15,547 samples</div>
          </div>
          <div className="attack-card">
            <Zap className="attack-icon" size={32} />
            <h4>Brute Force Attacks</h4>
            <div className="attack-score">98.14%</div>
            <div className="attack-samples">294 samples</div>
          </div>
          <div className="attack-card">
            <ShieldCheck className="attack-icon" size={32} />
            <h4>DDoS Attacks</h4>
            <div className="attack-score">98.05%</div>
            <div className="attack-samples">608 samples</div>
          </div>
          <div className="attack-card">
            <Bot className="attack-icon" size={32} />
            <h4>Botnet Activities</h4>
            <div className="attack-score">97.82%</div>
            <div className="attack-samples">11,098 samples</div>
          </div>
          <div className="attack-card">
            <Search className="attack-icon" size={32} />
            <h4>Port Scanning</h4>
            <div className="attack-score">97.58%</div>
            <div className="attack-samples">2,031 samples</div>
          </div>
          <div className="attack-card">
            <Key className="attack-icon" size={32} />
            <h4>Privilege Escalation</h4>
            <div className="attack-score">89.80%</div>
            <div className="attack-samples">88 samples</div>
          </div>
        </div>
      </div>

      <div className="overview-footer-grid">
        <div className="footer-card dataset-card">
          <h3><Database size={24} /> Training Dataset</h3>
          <ul className="footer-list">
            <li><CheckCircle2 size={16} className="check-icon" /> **29,966** total training samples</li>
            <li><CheckCircle2 size={16} className="check-icon" /> **37** network features</li>
            <li><CheckCircle2 size={16} className="check-icon" /> **6** attack categories + Normal</li>
            <li><CheckCircle2 size={16} className="check-icon" /> **98.13%** F1 Score achieved</li>
            <li><CheckCircle2 size={16} className="check-icon" /> Balanced class distribution</li>
            <li><CheckCircle2 size={16} className="check-icon" /> Production-ready performance</li>
          </ul>
        </div>

        <div className="footer-card stack-card">
          <h3><Code2 size={24} /> Technology Stack</h3>
          <ul className="footer-list">
            <li><CheckCircle2 size={16} className="check-icon" /> **Python 3.9+ / FastAPI**</li>
            <li><CheckCircle2 size={16} className="check-icon" /> **Bootstrap 5 / Vanilla CSS**</li>
            <li><CheckCircle2 size={16} className="check-icon" /> **Scikit-learn**</li>
            <li><CheckCircle2 size={16} className="check-icon" /> **Chart.js / Lucide Icons**</li>
            <li><CheckCircle2 size={16} className="check-icon" /> **Pandas / NumPy**</li>
            <li><CheckCircle2 size={16} className="check-icon" /> **Vite / React 18**</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
