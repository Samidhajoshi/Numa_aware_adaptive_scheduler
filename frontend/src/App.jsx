import { useState } from 'react'
import Sidebar from './components/Sidebar.jsx'
import NodesPage from './components/pages/NodesPage.jsx'
import WorkloadPage from './components/pages/WorkloadPage.jsx'
import RunPage from './components/pages/RunPage.jsx'
import ComparePage from './components/pages/ComparePage.jsx'
import MigrationPage from './components/pages/MigrationPage.jsx'
import NodeImpactPage from './components/pages/NodeImpactPage.jsx'
import HistoryPage from './components/pages/HistoryPage.jsx'
import ConfigPage from './components/pages/ConfigPage.jsx'

const PAGES = [
  { id: 'config',   label: 'Topology Config'   },
  { id: 'nodes',    label: 'NUMA Nodes'         },
  { id: 'workload', label: 'Database Workload'  },
  { id: 'run',      label: 'Run Algorithms'     },
  { id: 'compare',  label: 'Compare'            },
  { id: 'migration',label: 'Migration Study'    },
  { id: 'nodeimpact',label: 'Node Impact'       },
  { id: 'history',  label: 'Stored Results'     },
]

export const WORKLOAD_TYPES = [
  { key: 'CPU_INTENSIVE', label: 'CPU Intensive',  color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
  { key: 'READ_HEAVY',    label: 'Read Heavy',     color: '#4ecdc4', bg: 'rgba(78,205,196,0.12)'  },
  { key: 'WRITE_HEAVY',   label: 'Write Heavy',    color: '#ff6b6b', bg: 'rgba(255,107,107,0.12)' },
  { key: 'MIXED',         label: 'Mixed',          color: '#34d399', bg: 'rgba(52,211,153,0.12)'  },
]

// Default per-node config helper
function makeDefaultNodeConfigs(n) {
  return Array.from({ length: n }, (_, i) => ({ cpus: 4, memMB: 8192, id: i }))
}

// Default symmetric distance matrix helper
function makeSymmetricMatrix(n) {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      const d = Math.abs(i - j)
      const hops = Math.min(d, n - d)
      return 10 + 10 * hops
    })
  )
}

export default function App() {
  const [activePage, setActivePage] = useState('config')

  // ── Global simulation config (shared across all pages) ─────────────────────
  const [seed, setSeed]                   = useState(42)
  const [workloadType, setWorkloadType]   = useState('MIXED')

  // Topology
  const [numNodes, setNumNodes]           = useState(4)
  const [topologyType, setTopologyType]   = useState('Symmetric')
  const [nodeConfigs, setNodeConfigs]     = useState(makeDefaultNodeConfigs(4))
  const [distMatrix, setDistMatrix]       = useState(makeSymmetricMatrix(4))

  // Workload extras
  const [numThreads, setNumThreads]       = useState(16)
  const [hotPageSkew, setHotPageSkew]     = useState(0.80)
  const [refsPerThread, setRefsPerThread] = useState(48)
  const [phases, setPhases]               = useState([])

  // Migration
  const [migrationEnabled, setMigrationEnabled] = useState(false)
  const [initInterval, setInitInterval]   = useState(100)
  const [minInterval, setMinInterval]     = useState(10)
  const [maxInterval, setMaxInterval]     = useState(1000)
  const [cooldownSteps, setCooldownSteps] = useState(200)
  const [safetyMargin, setSafetyMargin]   = useState(1.5)

  // Build the config object sent to the API
  const simConfig = {
    numNodes,
    topologyType,
    nodeConfigs,
    distMatrix: topologyType === 'Asymmetric' ? distMatrix : undefined,
    seed,
    workloadType,
    numThreads,
    hotPageSkew,
    refsPerThread,
    phases: phases.length > 0 ? phases : undefined,
    migrationEnabled,
    initInterval,
    minInterval,
    maxInterval,
    cooldownSteps,
    safetyMargin,
  }

  const wt = WORKLOAD_TYPES.find(w => w.key === workloadType) ?? WORKLOAD_TYPES[3]

  // When numNodes changes, resize nodeConfigs and distMatrix
  function handleNumNodesChange(n) {
    const clamped = Math.max(2, Math.min(8, n))
    setNumNodes(clamped)
    setNodeConfigs(prev => {
      const next = Array.from({ length: clamped }, (_, i) =>
        prev[i] ?? { cpus: 4, memMB: 8192, id: i }
      )
      return next.map((nc, i) => ({ ...nc, id: i }))
    })
    setDistMatrix(makeSymmetricMatrix(clamped))
  }

  return (
    <div className="app-shell">
      <Sidebar pages={PAGES} activePage={activePage} onNavigate={setActivePage} />
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
              type="number" value={seed} min={0}
              onChange={e => setSeed(Number(e.target.value))}
            />
          </div>

          {/* Topology badge */}
          <div className="topbar-badge" style={{ fontSize: 12 }}>
            {numNodes}N · {topologyType} · {migrationEnabled ? '🔄 Mig ON' : 'Mig OFF'}
          </div>
        </div>

        {/* Pages */}
        {activePage === 'config' && (
          <ConfigPage
            numNodes={numNodes}           setNumNodes={handleNumNodesChange}
            topologyType={topologyType}   setTopologyType={setTopologyType}
            nodeConfigs={nodeConfigs}     setNodeConfigs={setNodeConfigs}
            distMatrix={distMatrix}       setDistMatrix={setDistMatrix}
            numThreads={numThreads}       setNumThreads={setNumThreads}
            hotPageSkew={hotPageSkew}     setHotPageSkew={setHotPageSkew}
            refsPerThread={refsPerThread} setRefsPerThread={setRefsPerThread}
            phases={phases}               setPhases={setPhases}
            migrationEnabled={migrationEnabled} setMigrationEnabled={setMigrationEnabled}
            initInterval={initInterval}   setInitInterval={setInitInterval}
            minInterval={minInterval}     setMinInterval={setMinInterval}
            maxInterval={maxInterval}     setMaxInterval={setMaxInterval}
            cooldownSteps={cooldownSteps} setCooldownSteps={setCooldownSteps}
            safetyMargin={safetyMargin}   setSafetyMargin={setSafetyMargin}
            makeSymmetricMatrix={makeSymmetricMatrix}
          />
        )}
        {activePage === 'nodes'    && <NodesPage simConfig={simConfig} />}
        {activePage === 'workload' && <WorkloadPage seed={seed} workloadType={workloadType} simConfig={simConfig} />}
        {activePage === 'run'      && <RunPage      seed={seed} workloadType={workloadType} simConfig={simConfig} />}
        {activePage === 'compare'  && <ComparePage  seed={seed} workloadType={workloadType} simConfig={simConfig} />}
        {activePage === 'migration'&& <MigrationPage simConfig={simConfig} />}
        {activePage === 'nodeimpact'&& <NodeImpactPage simConfig={simConfig} />}
        {activePage === 'history'  && <HistoryPage />}
      </main>
    </div>
  )
}
