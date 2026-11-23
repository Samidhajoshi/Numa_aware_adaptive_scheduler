import { useState } from 'react'
import { Settings2, ChevronDown, ChevronUp, Info } from 'lucide-react'

// ─── Tooltip helper ───────────────────────────────────────────────────────────
function Tip({ text }) {
  const [show, setShow] = useState(false)
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <Info
        size={13} style={{ color: 'var(--text-muted)', cursor: 'help', marginLeft: 4 }}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      />
      {show && (
        <span style={{
          position: 'absolute', left: 20, top: -4, zIndex: 300,
          background: '#1a1d2e', color: '#fff',
          padding: '6px 10px', borderRadius: 8,
          fontSize: 11, whiteSpace: 'nowrap', maxWidth: 300,
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        }}>{text}</span>
      )}
    </span>
  )
}

// ─── Section accordion ────────────────────────────────────────────────────────
function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: 0, marginBottom: open ? 20 : 0,
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</span>
        {open ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
      </button>
      {open && children}
    </div>
  )
}

// ─── Field row ────────────────────────────────────────────────────────────────
function Field({ label, tip, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
      <div style={{ minWidth: 180, fontSize: 13, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>
        {label}{tip && <Tip text={tip} />}
      </div>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  )
}

const INPUT_STYLE = {
  padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)',
  fontSize: 13, background: 'var(--bg-card)', color: 'var(--text-primary)',
  outline: 'none', width: '100%',
}

// ─── Distance matrix editor ───────────────────────────────────────────────────
function DistMatrixEditor({ numNodes, distMatrix, setDistMatrix }) {
  const nodeColors = ['#ff6b6b', '#4ecdc4', '#a78bfa', '#34d399', '#ff8e53', '#60a5fa', '#f472b6', '#34d399']

  function handleCell(i, j, val) {
    if (i === j) return // diagonal locked
    const v = parseInt(val)
    if (isNaN(v) || v <= 0) return
    setDistMatrix(prev => {
      const next = prev.map(r => [...r])
      next[i][j] = v
      return next
    })
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="dist-table" style={{ tableLayout: 'fixed' }}>
        <thead>
          <tr>
            <th style={{ width: 56 }}>↓From\To→</th>
            {Array.from({ length: numNodes }, (_, j) => (
              <th key={j} style={{ color: nodeColors[j % nodeColors.length] }}>N{j}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: numNodes }, (_, i) => (
            <tr key={i}>
              <th style={{ color: nodeColors[i % nodeColors.length] }}>N{i}</th>
              {Array.from({ length: numNodes }, (_, j) => {
                const val = distMatrix[i]?.[j] ?? (i === j ? 10 : 20)
                const isDiag = i === j
                return (
                  <td key={j} className={isDiag ? 'dist-local' : val <= 20 ? 'dist-near' : 'dist-far'}>
                    {isDiag
                      ? <span style={{ fontWeight: 800 }}>10</span>
                      : <input
                          type="number" min={11} max={200}
                          value={val}
                          onChange={e => handleCell(i, j, e.target.value)}
                          style={{
                            width: 52, textAlign: 'center', padding: '2px 4px',
                            border: '1px solid var(--border)', borderRadius: 4,
                            background: 'var(--bg-main)', fontSize: 12,
                            color: 'var(--text-primary)',
                          }}
                        />
                    }
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
        Diagonal = 10 (local access cost, fixed). Off-diagonal values are synthetic simulation units — NOT real ACPI-SLIT measurements.
      </p>
    </div>
  )
}

// ─── Main ConfigPage ──────────────────────────────────────────────────────────
export default function ConfigPage({
  numNodes, setNumNodes,
  topologyType, setTopologyType,
  nodeConfigs, setNodeConfigs,
  distMatrix, setDistMatrix,
  numThreads, setNumThreads,
  hotPageSkew, setHotPageSkew,
  refsPerThread, setRefsPerThread,
  phases, setPhases,
  migrationEnabled, setMigrationEnabled,
  initInterval, setInitInterval,
  minInterval, setMinInterval,
  maxInterval, setMaxInterval,
  cooldownSteps, setCooldownSteps,
  safetyMargin, setSafetyMargin,
  makeSymmetricMatrix,
}) {
  const nodeColors = ['#ff6b6b', '#4ecdc4', '#a78bfa', '#34d399', '#ff8e53', '#60a5fa', '#f472b6', '#34d399']

  function handleNodeCfg(i, field, val) {
    setNodeConfigs(prev => prev.map((nc, idx) =>
      idx === i ? { ...nc, [field]: Number(val) } : nc
    ))
  }

  function handleTopologyChange(t) {
    setTopologyType(t)
    if (t === 'Symmetric') {
      setDistMatrix(makeSymmetricMatrix(numNodes))
    }
  }

  function addPhase() {
    // Alternate the affinity shift by default, so adding phases immediately
    // produces a moving access pattern rather than a stationary one.
    setPhases(prev => [...prev, { type: 'MIXED', steps: 48, affinityShift: prev.length % 2 }])
  }
  function removePhase(i) {
    setPhases(prev => prev.filter((_, idx) => idx !== i))
  }
  function updatePhase(i, field, val) {
    setPhases(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: val } : p))
  }

  return (
    <div>
      <div className="page-hero">
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Settings2 size={22} style={{ color: 'var(--accent-1)' }} />
            Topology & Simulation Configuration
          </h2>
          <p>Configure NUMA topology, workload, and migration settings before running simulations</p>
        </div>
      </div>

      {/* ── Summary badges ── */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <div className="card card-sm card-gradient">
          <div className="card-title">NUMA Nodes</div>
          <div className="card-value">{numNodes}</div>
          <div className="card-sub">{topologyType}</div>
        </div>
        <div className="card card-sm">
          <div className="card-title">Threads</div>
          <div className="card-value">{numThreads}</div>
          <div className="card-sub">worker threads</div>
        </div>
        <div className="card card-sm">
          <div className="card-title">Phases</div>
          <div className="card-value">{phases.length || 1}</div>
          <div className="card-sub">{phases.length > 0 ? 'multi-phase' : 'single phase'}</div>
        </div>
        <div className="card card-sm" style={{ borderTop: `3px solid ${migrationEnabled ? '#34d399' : 'var(--border)'}` }}>
          <div className="card-title">Migration</div>
          <div className="card-value" style={{ fontSize: 20, color: migrationEnabled ? '#059669' : 'var(--text-muted)' }}>
            {migrationEnabled ? 'ENABLED' : 'DISABLED'}
          </div>
          <div className="card-sub">simulated (not OS-level)</div>
        </div>
      </div>

      {/* ── Section 1: NUMA Topology ── */}
      <Section title="1. NUMA Topology">
        <Field label="Number of Nodes" tip="Valid range: 2–8. Changing this resets the distance matrix.">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input type="range" min={2} max={8} step={1} value={numNodes}
              onChange={e => setNumNodes(Number(e.target.value))}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 20, fontWeight: 800, minWidth: 28, textAlign: 'right' }}>{numNodes}</span>
          </div>
        </Field>

        <Field label="Topology Type" tip="Symmetric: equal node resources, ring distances. Asymmetric: custom per-node resources and distance matrix.">
          <div style={{ display: 'flex', gap: 10 }}>
            {['Symmetric', 'Asymmetric'].map(t => (
              <button key={t}
                onClick={() => handleTopologyChange(t)}
                className={`btn btn-sm ${topologyType === t ? 'btn-primary' : 'btn-secondary'}`}
              >
                {t}
              </button>
            ))}
          </div>
          {topologyType !== 'Symmetric' && (
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
              Custom distance matrix below. Diagonal fixed at 10. Values are synthetic simulation units, NOT ACPI-SLIT.
            </p>
          )}
        </Field>

        {/* Per-node resource config */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 12, letterSpacing: 0.5 }}>
            Per-Node Resources
          </div>
          <div className="grid-auto">
            {nodeConfigs.map((nc, i) => (
              <div key={i} className="node-card" style={{ borderColor: nodeColors[i % nodeColors.length] + '44' }}>
                <div className="node-id" style={{ color: nodeColors[i % nodeColors.length], marginBottom: 10 }}>N{i}</div>
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                    CPU Cores
                    <Tip text="Number of logical CPU cores on this node. Valid: 1–128." />
                  </label>
                  <input type="number" min={1} max={128} value={nc.cpus}
                    onChange={e => handleNodeCfg(i, 'cpus', e.target.value)}
                    style={{ ...INPUT_STYLE, width: '100%' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                    Memory (MB)
                    <Tip text="Total memory on this node in MB. Minimum 1024 MB." />
                  </label>
                  <input type="number" min={1024} max={524288} step={1024} value={nc.memMB}
                    onChange={e => handleNodeCfg(i, 'memMB', e.target.value)}
                    style={{ ...INPUT_STYLE, width: '100%' }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Distance matrix */}
        {topologyType === 'Asymmetric' && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 12, letterSpacing: 0.5 }}>
              Asymmetric Distance Matrix
            </div>
            <DistMatrixEditor
              numNodes={numNodes}
              distMatrix={distMatrix}
              setDistMatrix={setDistMatrix}
            />
          </div>
        )}

        {/* Show read-only matrix for symmetric */}
        {topologyType === 'Symmetric' && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 12, letterSpacing: 0.5 }}>
              Symmetric Distance Matrix (auto-computed)
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="dist-table">
                <thead>
                  <tr>
                    <th>↓\→</th>
                    {Array.from({ length: numNodes }, (_, j) => <th key={j}>N{j}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: numNodes }, (_, i) => (
                    <tr key={i}>
                      <th>N{i}</th>
                      {Array.from({ length: numNodes }, (_, j) => {
                        const d = Math.abs(i - j)
                        const hops = Math.min(d, numNodes - d)
                        const val = 10 + 10 * hops
                        return (
                          <td key={j} className={i === j ? 'dist-local' : val <= 20 ? 'dist-near' : 'dist-far'}>
                            {val}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Section>

      {/* ── Section 2: Workload Settings ── */}
      <Section title="2. Workload Settings">
        <Field label="Worker Threads" tip="Number of simulated database worker threads. Range: 1–64. All algorithms use the same thread count.">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input type="range" min={1} max={64} step={1} value={numThreads}
              onChange={e => setNumThreads(Number(e.target.value))} style={{ flex: 1 }} />
            <span style={{ fontWeight: 700, minWidth: 28 }}>{numThreads}</span>
          </div>
        </Field>

        <Field label="Hot-Page Skew" tip="Fraction of accesses going to 'hot' pages (thread-local partition). 0 = uniform, 1 = all hot. Simulates data locality in databases.">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input type="range" min={0} max={1} step={0.05} value={hotPageSkew}
              onChange={e => setHotPageSkew(Number(e.target.value))} style={{ flex: 1 }} />
            <span style={{ fontWeight: 700, minWidth: 40 }}>{(hotPageSkew * 100).toFixed(0)}%</span>
          </div>
        </Field>

        <Field label="Refs per Thread" tip="Number of access references generated per thread per phase. More refs = larger workload trace.">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input type="range" min={8} max={200} step={4} value={refsPerThread}
              onChange={e => setRefsPerThread(Number(e.target.value))} style={{ flex: 1 }} />
            <span style={{ fontWeight: 700, minWidth: 32 }}>{refsPerThread}</span>
          </div>
        </Field>

        {/* Multi-phase */}
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>
              Workload Phases
              <Tip text="Optional multi-phase workload. Each phase has a type, a step count and an affinity shift. Shift rotates which thread's data this phase reads, so the best page placement changes between phases — that is what gives migration something to chase. Leave empty for a single, stationary phase." />
            </div>
            <button className="btn btn-sm btn-secondary" onClick={addPhase}>+ Add Phase</button>
          </div>

          {phases.map((ph, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
              background: 'var(--bg-main)', borderRadius: 10, marginBottom: 8,
            }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 60 }}>Phase {i + 1}</span>
              <select value={ph.type} onChange={e => updatePhase(i, 'type', e.target.value)}
                style={{ ...INPUT_STYLE, width: 140 }}>
                <option value="CPU_INTENSIVE">CPU Intensive</option>
                <option value="READ_HEAVY">Read Heavy</option>
                <option value="WRITE_HEAVY">Write Heavy</option>
                <option value="MIXED">Mixed</option>
              </select>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Steps:</label>
                <input type="number" min={1} max={1000} value={ph.steps}
                  onChange={e => updatePhase(i, 'steps', Number(e.target.value))}
                  style={{ ...INPUT_STYLE, width: 80 }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Shift:
                  <Tip text="0 = each thread reads its own data (stationary). Non-zero = each thread reads the data of the thread this many positions away, so the optimal placement moves when the phase starts." />
                </label>
                <input type="number" min={0} max={63} value={ph.affinityShift ?? 0}
                  onChange={e => updatePhase(i, 'affinityShift', Number(e.target.value))}
                  style={{
                    ...INPUT_STYLE, width: 70,
                    color: (ph.affinityShift ?? 0) !== 0 ? '#059669' : undefined,
                    fontWeight: (ph.affinityShift ?? 0) !== 0 ? 700 : undefined,
                  }} />
              </div>
              <button className="btn btn-sm btn-secondary" onClick={() => removePhase(i)}
                style={{ color: 'var(--accent-1)', marginLeft: 'auto' }}>✕</button>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Section 3: Page Migration ── */}
      <Section title="3. Simulated Page Migration">
        <Field label="Enable Migration" tip="When enabled, the simulator tracks page access patterns and moves pages to reduce remote accesses. Applied to all algorithms equally.">
          <div style={{ display: 'flex', gap: 10 }}>
            <button className={`btn btn-sm ${migrationEnabled ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setMigrationEnabled(true)}>Enable</button>
            <button className={`btn btn-sm ${!migrationEnabled ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setMigrationEnabled(false)}>Disable</button>
          </div>
        </Field>

        {migrationEnabled && (<>
          <Field label="Initial Eval Interval" tip="Steps between the first and second migration evaluation. The adaptive policy adjusts this up or down based on remote-access ratio.">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input type="range" min={10} max={500} step={10} value={initInterval}
                onChange={e => setInitInterval(Number(e.target.value))} style={{ flex: 1 }} />
              <span style={{ fontWeight: 700, minWidth: 40 }}>{initInterval}</span>
            </div>
          </Field>

          <Field label="Min Interval" tip="Minimum steps between evaluations (lower bound of adaptive policy). Prevents over-evaluation.">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input type="range" min={1} max={100} step={1} value={minInterval}
                onChange={e => setMinInterval(Number(e.target.value))} style={{ flex: 1 }} />
              <span style={{ fontWeight: 700, minWidth: 40 }}>{minInterval}</span>
            </div>
          </Field>

          <Field label="Max Interval" tip="Maximum steps between evaluations (upper bound). Prevents stale monitoring of stable workloads.">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input type="range" min={100} max={5000} step={100} value={maxInterval}
                onChange={e => setMaxInterval(Number(e.target.value))} style={{ flex: 1 }} />
              <span style={{ fontWeight: 700, minWidth: 40 }}>{maxInterval}</span>
            </div>
          </Field>

          <Field label="Cooldown Steps" tip="Steps a page must wait after a migration before it can move again. Prevents ping-pong migration between nodes.">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input type="range" min={10} max={2000} step={10} value={cooldownSteps}
                onChange={e => setCooldownSteps(Number(e.target.value))} style={{ flex: 1 }} />
              <span style={{ fontWeight: 700, minWidth: 40 }}>{cooldownSteps}</span>
            </div>
          </Field>

          <Field label="Safety Margin" tip="Predicted saving must exceed migration cost by this factor before migration is approved. Higher = more conservative. Formula: predictedSaving > migCost × safetyMargin">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input type="range" min={1.0} max={5.0} step={0.1} value={safetyMargin}
                onChange={e => setSafetyMargin(Number(e.target.value))} style={{ flex: 1 }} />
              <span style={{ fontWeight: 700, minWidth: 40 }}>{safetyMargin.toFixed(1)}×</span>
            </div>
          </Field>

          <div style={{ padding: '12px 14px', background: 'var(--bg-main)', borderRadius: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
            <strong>Adaptive Interval Heuristic</strong>
            <ul style={{ paddingLeft: 18, marginTop: 6, lineHeight: 1.8 }}>
              <li>If remote-access ratio &gt; 50%: halve the interval (evaluate more often)</li>
              <li>If remote-access ratio &lt; 10% and no migration found: double the interval</li>
              <li>Migrate only when predictedSaving &gt; migCost × {safetyMargin.toFixed(1)} and destination has capacity</li>
              <li>Cooldown of {cooldownSteps} steps prevents ping-pong migration</li>
              <li>Interval is always bounded to [{minInterval}, {maxInterval}]</li>
            </ul>
            <p style={{ marginTop: 6, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              This heuristic is experimental — not claimed to be optimal.
            </p>
          </div>
        </>)}
      </Section>

      {/* ── Section 4: Config Summary ── */}
      <div className="card" style={{ background: 'var(--bg-main)', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'var(--text-secondary)' }}>
          Active Configuration Summary
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, fontSize: 12 }}>
          {[
            ['Topology', `${numNodes} nodes, ${topologyType}`],
            ['Threads', numThreads],
            ['Hot-page skew', `${(hotPageSkew * 100).toFixed(0)}%`],
            ['Refs/thread', refsPerThread],
            ['Phases', phases.length || 1],
            ['Migration', migrationEnabled ? `ON (interval ${initInterval}–${maxInterval})` : 'OFF'],
            ['Cooldown', migrationEnabled ? `${cooldownSteps} steps` : '—'],
            ['Safety margin', migrationEnabled ? `${safetyMargin.toFixed(1)}×` : '—'],
          ].map(([k, v]) => (
            <div key={k} style={{ padding: '8px 12px', background: 'var(--bg-card)', borderRadius: 8 }}>
              <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>{k}</div>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
