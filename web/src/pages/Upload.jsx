import React, { useState, useRef } from 'react'
import { UploadCloud, File, CheckCircle, AlertCircle } from 'lucide-react'
import { getApiBase } from '../lib/api'

export default function Upload() {
  const [file, setFile] = useState(null)
  const [status, setStatus] = useState('idle') // idle, uploading, processing, done, error
  const [errorMsg, setErrorMsg] = useState('')
  const fileInputRef = useRef(null)

  const handleFileChange = (e) => {
    const selected = e.target.files[0]
    if (selected && selected.name.endsWith('.csv')) {
      setFile(selected)
      setStatus('idle')
      setErrorMsg('')
    } else if (selected) {
      setStatus('error')
      setErrorMsg('Please select a valid CSV file.')
    }
  }

  const handleDragOver = (e) => {
    e.preventDefault()
  }

  const handleDrop = (e) => {
    e.preventDefault()
    const selected = e.dataTransfer.files[0]
    if (selected && selected.name.endsWith('.csv')) {
      setFile(selected)
      setStatus('idle')
      setErrorMsg('')
    } else if (selected) {
      setStatus('error')
      setErrorMsg('Please drop a valid CSV file.')
    }
  }

  const processCSV = async () => {
    if (!file) return
    setStatus('processing')
    
    try {
      const text = await file.text()
      const lines = text.split('\n').filter(line => line.trim().length > 0)
      if (lines.length < 2) throw new Error('CSV file is empty or has no data rows.')
      
      const headers = lines[0].split(',').map(h => h.trim())
      const dataRows = lines.slice(1)

      const apiBase = getApiBase()
      
      // We will send rows sequentially or in batches.
      for (let i = 0; i < dataRows.length; i++) {
        const values = dataRows[i].split(',').map(v => v.trim())
        const features = {}
        headers.forEach((h, index) => {
          features[h] = isNaN(Number(values[index])) ? values[index] : Number(values[index])
        })

        // Simulate traffic by sending to backend ingest
        await fetch(`${apiBase}/ingest`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ features })
        }).catch(() => {})
        
        // Wait a bit to simulate real-time stream
        await new Promise(r => setTimeout(r, 200))
      }
      
      setStatus('done')
    } catch (err) {
      setStatus('error')
      setErrorMsg(err.message || 'Error processing CSV file.')
    }
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
                </div>
              </div>
            )}
          </div>
          
          <div className="upload-actions">
            <button 
              className="btn btn-primary" 
              disabled={!file || status === 'processing'}
              onClick={processCSV}
            >
              {status === 'processing' ? 'Processing...' : 'Upload & Run Scan'}
            </button>
            {status === 'done' && (
              <div className="status-msg success">
                <CheckCircle size={18} />
                <span>Processing complete! Check Live Monitoring.</span>
              </div>
            )}
            {status === 'error' && (
              <div className="status-msg error">
                <AlertCircle size={18} />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>
        </div>

        <div className="upload-requirements card">
          <div className="card-title">File Requirements</div>
          <ul className="req-list">
            <li>
              <strong>File Format:</strong> Only CSV (.csv) extensions allowed.
            </li>
            <li>
              <strong>File Size:</strong> Maximum 30 MB per upload.
            </li>
            <li>
              <strong>Data Structure:</strong> Must have numerical or categorical features matching the ML model input.
            </li>
            <li>
              <strong>Columns Example:</strong> duration, src_bytes, dst_bytes, flag, protocol_type, etc.
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}
