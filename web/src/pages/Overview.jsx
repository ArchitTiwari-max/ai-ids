import React, { useEffect } from 'react'

export default function Overview() {
  useEffect(() => {
    // Import mermaid dynamically if needed or just use a basic SVG.
    // For simplicity, we'll embed the mermaid script to render the diagrams.
    if (window.mermaid) {
      window.mermaid.contentLoaded();
    } else {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js";
      script.onload = () => {
        window.mermaid.initialize({ startOnLoad: true, theme: 'default' });
      };
      document.body.appendChild(script);
    }
  }, []);

  return (
    <div className="container overview-container">
      <h1>Project Overview</h1>
      <p className="overview-intro">
        This Intrusion Detection System (IDS) leverages advanced Machine Learning models to identify 
        malicious network traffic in real-time. It provides a secure, interactive dashboard for monitoring.
      </p>

      <div className="grid">
        <div className="card">
          <div className="card-title">Technology Stack</div>
          <ul className="tech-list">
            <li><strong>Frontend:</strong> React, Vite, react-router-dom, Chart.js</li>
            <li><strong>Styling:</strong> CSS Variables, Flexbox/Grid layouts</li>
            <li><strong>Backend:</strong> Node.js / Python (FastAPI/Flask) - depending on the active API</li>
            <li><strong>Real-time:</strong> WebSockets for live monitoring</li>
            <li><strong>Auth:</strong> Clerk Authentication</li>
            <li><strong>Machine Learning:</strong> Neural Networks/Random Forest for packet classification</li>
          </ul>
        </div>
        <div className="card">
          <div className="card-title">System Features</div>
          <ul className="tech-list">
            <li>Live network traffic visualization</li>
            <li>Immediate anomaly detection scoring</li>
            <li>CSV Uploads for offline traffic analysis</li>
            <li>Real-time alert generation</li>
          </ul>
        </div>
      </div>

      <div className="card" style={{ marginTop: '20px' }}>
        <div className="card-title">Architecture Diagram</div>
        <div className="mermaid-wrapper">
          <div className="mermaid">
            {`
              graph LR
                A[User / Network] -->|Web/WebSocket| B(Frontend Dashboard)
                B -->|REST / WS| C{Backend API}
                C -->|Feature Extraction| D[ML Model Engine]
                D -->|Scoring & Anomaly Status| C
                C -->|Real-time Alerts| B
                B -->|Displays Data| E[Charts & Tables]
            `}
          </div>
        </div>
      </div>
    </div>
  )
}
