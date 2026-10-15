import { useState } from 'react'
import Sidebar from './components/Sidebar.jsx'
import NodesPage from './components/pages/NodesPage.jsx'
import WorkloadPage from './components/pages/WorkloadPage.jsx'
import RunPage from './components/pages/RunPage.jsx'
import ComparePage from './components/pages/ComparePage.jsx'
import HistoryPage from './components/pages/HistoryPage.jsx'

const PAGES = [
  { id: 'nodes',    label: 'NUMA Nodes'       },
  { id: 'workload', label: 'Database Workload' },
  { id: 'run',      label: 'Run Algorithms'   },
  { id: 'compare',  label: 'Compare'          },
  { id: 'history',  label: 'Stored Results'   },
]

export const WORKLOAD_TYPES = [
  { key: 'CPU_INTENSIVE', label: 'CPU Intensive',  color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
  { key: 'READ_HEAVY',    label: 'Read Heavy',     color: '#4ecdc4', bg: 'rgba(78,205,196,0.12)'  },
  { key: 'WRITE_HEAVY',   label: 'Write Heavy',    color: '#ff6b6b', bg: 'rgba(255,107,107,0.12)' },
  { key: 'MIXED',         label: 'Mixed',          color: '#34d399', bg: 'rgba(52,211,153,0.12)'  },
]

export default function App() {
  const [activePage, setActivePage]       = useState('nodes')
  const [seed, setSeed]                   = useState(42)
  const [workloadType, setWorkloadType]   = useState('MIXED')

  const wt = WORKLOAD_TYPES.find(w => w.key === workloadType) ?? WORKLOAD_TYPES[3]

  return (
    <div className="app-shell">
      <Sidebar
        pages={PAGES}
        activePage={activePage}
        onNavigate={setActivePage}
      />
      <main className="main-content">
        {/* Top bar */}
        <div className="topbar">
          <h1 className="topbar-title">NUMA Simulator</h1>

          {/* Workload type selector */}
          <div className="topbar-seed-input" style={{ gap: 6 }}>
            <label style={{ whiteSpace: 'nowrap' }}>Workload</label>
            <select
              value={workloadType}
              onChange={e => setWorkloadType(e.target.value)}
              style={{
                border: 'none', outline: 'none', background: 'transparent',
                fontSize: 14, fontWeight: 700, color: wt.color, cursor: 'pointer'
              }}
            >
              {WORKLOAD_TYPES.map(t => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Seed input */}
          <div className="topbar-seed-input">
            <label>Seed</label>
            <input
              type="number"
              value={seed}
              min={0}
              onChange={e => setSeed(Number(e.target.value))}
            />
          </div>
        </div>

        {/* Pages */}
        {activePage === 'nodes'    && <NodesPage />}
        {activePage === 'workload' && <WorkloadPage seed={seed} workloadType={workloadType} />}
        {activePage === 'run'      && <RunPage      seed={seed} workloadType={workloadType} />}
        {activePage === 'compare'  && <ComparePage  seed={seed} workloadType={workloadType} />}
        {activePage === 'history'  && <HistoryPage />}
      </main>
    </div>
  )
}
