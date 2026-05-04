import React, { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { 
  ShieldAlert, 
  LayoutDashboard, 
  Info, 
  UploadCloud, 
  FileText, 
  Activity, 
  ShieldOff,
  BarChart3,
  Menu,
  X
} from 'lucide-react'
import { UserButton } from '@clerk/react'

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Overview', path: '/overview', icon: Info },
    { name: 'Comparison', path: '/comparison', icon: BarChart3 },
    { name: 'Upload', path: '/upload', icon: UploadCloud },
    { name: 'Reports', path: '/reports', icon: FileText },
    { name: 'Live Monitoring', path: '/monitoring', icon: Activity },
    { name: 'Blocked IPs', path: '/blocked', icon: ShieldOff },
  ]

  const closeMobileMenu = () => setMobileMenuOpen(false)

  return (
    <header className="main-header">
      <div className="header-logo">
        <ShieldAlert className="logo-icon" size={28} />
        <h2>ai-ids</h2>
      </div>

      {/* Mobile Menu Button */}
      <button 
        className="mobile-menu-btn"
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
      >
        {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      <nav className={`header-nav ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        {navItems.map((item) => (
          <NavLink 
            key={item.name} 
            to={item.path} 
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            onClick={closeMobileMenu}
          >
            <item.icon size={18} />
            <span>{item.name}</span>
          </NavLink>
        ))}
      </nav>

      <div className="header-actions">
        {/* We use Clerk UserButton for admin/profile management */}
        <div className="admin-profile">
          <UserButton afterSignOutUrl="/" />
          <span style={{ marginLeft: '8px', fontSize: '14px', fontWeight: '500' }}>Admin</span>
        </div>
      </div>
    </header>
  )
}
