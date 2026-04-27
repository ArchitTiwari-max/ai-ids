import React from 'react'
import { NavLink } from 'react-router-dom'
import { 
  ShieldAlert, 
  LayoutDashboard, 
  Info, 
  UploadCloud, 
  FileText, 
  Activity, 
  Lock, 
  ShieldOff 
} from 'lucide-react'
import { UserButton } from '@clerk/react'

export default function Header() {
  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Overview', path: '/overview', icon: Info },
    { name: 'Upload', path: '/upload', icon: UploadCloud },
    { name: 'Reports', path: '/reports', icon: FileText },
    { name: 'Live Monitoring', path: '/monitoring', icon: Activity },
    { name: 'Access', path: '/access', icon: Lock },
    { name: 'Blocked IPs', path: '/blocked', icon: ShieldOff },
  ]

  return (
    <header className="main-header">
      <div className="header-logo">
        <ShieldAlert className="logo-icon" size={28} />
        <h2>IDS with Machine Learning</h2>
      </div>
      <nav className="header-nav">
        {navItems.map((item) => (
          <NavLink 
            key={item.name} 
            to={item.path} 
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
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
