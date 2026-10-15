import {
  Server, Activity, Play, BarChart2, Database, Clock
} from 'lucide-react'

const ICONS = {
  nodes:    <Server size={20} />,
  workload: <Database size={20} />,
  run:      <Play size={20} />,
  compare:  <BarChart2 size={20} />,
  history:  <Clock size={20} />,
}

export default function Sidebar({ pages, activePage, onNavigate }) {
  return (
    <nav className="sidebar">
      <div className="sidebar-logo">N</div>
      {pages.map(page => (
        <button
          key={page.id}
          className={`nav-item ${activePage === page.id ? 'active' : ''}`}
          onClick={() => onNavigate(page.id)}
          title={page.label}
        >
          {ICONS[page.id]}
          <span className="tooltip">{page.label}</span>
        </button>
      ))}
    </nav>
  )
}
