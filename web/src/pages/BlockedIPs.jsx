import React, { useState, useEffect } from 'react'
import { getApiBase } from '../lib/api'
import { ShieldOff, Plus, Trash2, ShieldCheck, RefreshCw } from 'lucide-react'

export default function BlockedIPs() {
  const [ips, setIps] = useState([])
  const [loading, setLoading] = useState(true)
  const [newIp, setNewIp] = useState('')
  const [reason, setReason] = useState('')
  const [adding, setAdding] = useState(false)

  const fetchIps = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${getApiBase()}/blocked_ips`)
      if (res.ok) {
        const data = await res.json()
        setIps(data)
      }
    } catch (e) {
      console.error('Failed to fetch blocked IPs', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchIps()
  }, [])

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!newIp.trim()) return

    setAdding(true)
    try {
      const res = await fetch(`${getApiBase()}/blocked_ips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip_address: newIp.trim(), reason: reason.trim() })
      })
      if (res.ok) {
        setNewIp('')
        setReason('')
        await fetchIps()
      }
    } catch (e) {
      console.error('Failed to add IP', e)
    } finally {
      setAdding(false)
    }
  }

  const handleUnblock = async (ip) => {
    if (!window.confirm(`Are you sure you want to unblock ${ip}?`)) return
    
    try {
      const res = await fetch(`${getApiBase()}/blocked_ips/${encodeURIComponent(ip)}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        await fetchIps()
      }
    } catch (e) {
      console.error('Failed to unblock IP', e)
    }
  }

  return (
    <div style={{ padding: '28px 28px 48px', background: '#f8fafc', minHeight: '100vh', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <ShieldOff size={32} color="#ef4444" />
          <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 900, color: '#0f172a' }}>Blocked IPs</h1>
        </div>
        <p style={{ color: '#64748b', margin: '0 0 14px', fontSize: '0.95rem' }}>
          Manage network access control. Traffic from these IPs will be rejected before analysis.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 24 }}>
        
        {/* Block New IP Form */}
        <div style={{ background: 'white', borderRadius: 14, padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', alignSelf: 'start' }}>
          <h3 style={{ marginTop: 0, marginBottom: 20, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Plus size={20} /> Block New IP
          </h3>
          <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: 6 }}>IP Address</label>
              <input 
                type="text" 
                placeholder="e.g. 192.168.1.100" 
                value={newIp}
                onChange={(e) => setNewIp(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.95rem' }}
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: 6 }}>Reason (Optional)</label>
              <input 
                type="text" 
                placeholder="e.g. Repeated SSH Brute Force" 
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.95rem' }}
              />
            </div>
            <button 
              type="submit" 
              disabled={adding || !newIp.trim()}
              style={{ 
                background: '#ef4444', color: 'white', border: 'none', padding: '12px', borderRadius: 8, 
                fontWeight: 700, cursor: (adding || !newIp.trim()) ? 'not-allowed' : 'pointer',
                opacity: (adding || !newIp.trim()) ? 0.7 : 1, marginTop: 8
              }}
            >
              {adding ? 'Blocking...' : 'Block IP'}
            </button>
          </form>
        </div>

        {/* List of Blocked IPs */}
        <div style={{ background: 'white', borderRadius: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #e2e8f0' }}>
            <h3 style={{ margin: 0, color: '#0f172a' }}>Active Blocks</h3>
            <span style={{ background: '#fee2e2', color: '#ef4444', padding: '4px 12px', borderRadius: 20, fontSize: '0.85rem', fontWeight: 700 }}>
              {ips.length} IPs Blocked
            </span>
          </div>

          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
              <RefreshCw size={24} className="spin" style={{ marginBottom: 10 }} />
              <div>Loading blocklist...</div>
            </div>
          ) : ips.length === 0 ? (
            <div style={{ padding: '60px 40px', textAlign: 'center' }}>
              <ShieldCheck size={48} color="#22c55e" style={{ marginBottom: 16 }} />
              <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#334155', marginBottom: 8 }}>No blocked IPs</div>
              <div style={{ color: '#64748b', fontSize: '0.9rem' }}>All network traffic is currently permitted for analysis.</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>
                    <th style={{ padding: '14px 24px', fontWeight: 700 }}>IP Address</th>
                    <th style={{ padding: '14px 24px', fontWeight: 700 }}>Reason</th>
                    <th style={{ padding: '14px 24px', fontWeight: 700 }}>Blocked Date</th>
                    <th style={{ padding: '14px 24px', fontWeight: 700, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {ips.map(ip => (
                    <tr key={ip.ip_address} style={{ borderTop: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '16px 24px', fontWeight: 600, color: '#0f172a', fontFamily: 'monospace', fontSize: '1.05rem' }}>
                        {ip.ip_address}
                      </td>
                      <td style={{ padding: '16px 24px', color: '#475569', fontSize: '0.9rem' }}>
                        {ip.reason || <span style={{ color: '#cbd5e1', fontStyle: 'italic' }}>No reason provided</span>}
                      </td>
                      <td style={{ padding: '16px 24px', color: '#64748b', fontSize: '0.85rem' }}>
                        {new Date(ip.blocked_at).toLocaleString('en-GB')}
                      </td>
                      <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                        <button 
                          onClick={() => handleUnblock(ip.ip_address)}
                          style={{ 
                            background: 'transparent', border: '1px solid #cbd5e1', color: '#475569', 
                            padding: '6px 12px', borderRadius: 6, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                            fontSize: '0.85rem', fontWeight: 600, transition: 'all 0.2s'
                          }}
                          onMouseOver={e => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.borderColor = '#94a3b8' }}
                          onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = '#cbd5e1' }}
                        >
                          <Trash2 size={14} /> Unblock
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
