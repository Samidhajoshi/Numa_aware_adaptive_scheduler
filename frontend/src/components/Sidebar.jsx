import {
  Server, Activity, Play, BarChart2, Database, Clock, Settings2,
  FlaskConical, Compass, Circle
} from 'lucide-react'

const ICONS = {
  config:     <Settings2 size={20} />,
  nodes:      <Server size={20} />,
  workload:   <Database size={20} />,
  run:        <Play size={20} />,
  compare:    <BarChart2 size={20} />,
  migration:  <FlaskConical size={20} />,
  nodeimpact: <Compass size={20} />,
  history:    <Clock size={20} />,
}

// The nav is icon-only, so a page with no icon renders as an invisible gap.
const fallbackIcon = <Circle size={20} />

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
          aria-label={page.label}
        >
          {ICONS[page.id] ?? fallbackIcon}
          <span className="tooltip">{page.label}</span>
        </button>
      ))}
    </nav>
  )
}
