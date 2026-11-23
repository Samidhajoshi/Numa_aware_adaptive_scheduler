import { useState } from 'react'
import { BarChart2, Trophy } from 'lucide-react'
import { LoadingState, EmptyState, RawOutput, ALGO_CLASS } from '../shared.jsx'
import { WORKLOAD_TYPES } from '../../App.jsx'
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
  ResponsiveContainer, Tooltip as RTooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell,
} from 'recharts'

const COLORS = ['#94a3b8', '#4ecdc4', '#a78bfa', '#ff6b6b']

function WorkloadBadge({ typeKey }) {
  const wt = WORKLOAD_TYPES.find(w => w.key === typeKey) ?? WORKLOAD_TYPES[3]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '3px 12px', borderRadius: 20,
      background: wt.bg, color: wt.color,
      fontSize: 11, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase',
    }}>{wt.label}</span>
  )
}

export default function ComparePage({ seed, workloadType, simConfig }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [tab, setTab]         = useState('bar')

  const wt = WORKLOAD_TYPES.find(w => w.key === workloadType) ?? WORKLOAD_TYPES[3]
  const migEnabled = simConfig?.migrationEnabled ?? false

  async function compare() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(simConfig ?? { seed, workloadType }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || JSON.stringify(json.errors))
      setData(json)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const rows        = data?.comparison?.rows ?? []
  const best        = data?.comparison?.bestAlgorithm
  const improvement = data?.comparison?.improvementPct
  const topology    = data?.topology

  // Chart data — use costWithMig when migration is enabled
  const costData = rows.map((r, i) => ({
    name:    r.algorithm,
    cost:    Math.round(migEnabled ? (r.costWithMig ?? r.cost) : r.cost),
    color:   COLORS[i % COLORS.length],
  }))

  // Side-by-side: placement cost vs cost-with-migration
  const dualCostData = rows.map((r, i) => ({
    name:       r.algorithm,
    placement:  Math.round(r.cost ?? 0),
    withMig:    Math.round(r.costWithMig ?? r.cost ?? 0),
    color:      COLORS[i % COLORS.length],
  }))

  const radarData = ['localPct', 'cpuUtil', 'memUtil'].map(key => ({
    metric: key === 'localPct' ? 'Local %' : key === 'cpuUtil' ? 'CPU Util' : 'Mem Util',
    ...Object.fromEntries(rows.map(r => [r.algorithm, r[key] ?? 0])),
  }))

  return (
    <div>
      <div className="page-hero">
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            Compare Performance
            <WorkloadBadge typeKey={workloadType} />
            {migEnabled && (
              <span style={{ fontSize: 11, background: 'rgba(52,211,153,0.15)', color: '#059669', padding: '3px 10px', borderRadius: 20, fontWeight: 700 }}>
                🔄 Migration ON
              </span>
            )}
          </h2>
          <p>
            Side-by-side analysis · seed {seed} ·{' '}
            {simConfig?.numNodes ?? 4}N {simConfig?.topologyType ?? 'Symmetric'}
          </p>
        </div>
        <button className="btn btn-primary" onClick={compare} disabled={loading}>
          <BarChart2 size={16} />
          {loading ? 'Comparing…' : 'Compare'}
        </button>
      </div>

      {/* Context strip */}
      <div style={{
        display: 'flex', gap: 10, marginBottom: 24, padding: '12px 16px',
        background: wt.bg, borderRadius: 12, borderLeft: `4px solid ${wt.color}`,
        alignItems: 'center', flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: wt.color, textTransform: 'uppercase' }}>
          {wt.label}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>·</span>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Seed: <strong>{seed}</strong></span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>·</span>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {simConfig?.numNodes ?? 4} nodes · {simConfig?.topologyType ?? 'Symmetric'}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>·</span>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          Same workload, same topology for <strong>all 4 algorithms</strong>
        </span>
      </div>

      {!data && !loading && (
        <EmptyState icon="📊" title="No comparison yet"
          desc={`Click Compare to run all 4 algorithms on the ${wt.label} workload`} />
      )}
      {loading && <LoadingState text={`Running all algorithms on ${wt.label} workload…`} />}
      {error   && <p style={{ color: 'var(--accent-1)' }}>Error: {error}</p>}

      {data && (
        <>
          {/* Winner banner */}
          {best && (
            <div className="card card-gradient" style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 20 }}>
              <Trophy size={40} color="rgba(255,255,255,0.9)" />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 2, letterSpacing: 0.5 }}>
                  LOWEST COST — {wt.label.toUpperCase()} · {simConfig?.numNodes ?? 4}N {simConfig?.topologyType ?? 'SYMMETRIC'}
                  {migEnabled ? ' · MIGRATION ENABLED' : ''}
                </div>
                <div style={{ fontSize: 26, fontWeight: 900 }}>{best}</div>
                {improvement != null && improvement > 0 && (
                  <div style={{ fontSize: 14, opacity: 0.85 }}>
                    {improvement.toFixed(1)}% lower cost than Random
                  </div>
                )}
              </div>
              {data.workload && (
                <div style={{ textAlign: 'right', opacity: 0.85 }}>
                  <div style={{ fontSize: 11, marginBottom: 2 }}>WORKLOAD #{data.workload.workloadId}</div>
                  <div style={{ fontSize: 13 }}>
                    {data.workload.numPages} pages · {data.workload.numThreads} threads
                  </div>
                  <div style={{ fontSize: 12 }}>
                    {data.workload.totalAccesses?.toLocaleString()} accesses
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Chart tabs */}
          <div className="tabs" style={{ marginBottom: 20, maxWidth: 480 }}>
            <button className={`tab ${tab === 'bar'   ? 'active' : ''}`} onClick={() => setTab('bar')}>Cost Chart</button>
            {migEnabled && <button className={`tab ${tab === 'dual' ? 'active' : ''}`} onClick={() => setTab('dual')}>Mig Impact</button>}
            <button className={`tab ${tab === 'radar' ? 'active' : ''}`} onClick={() => setTab('radar')}>Radar</button>
            <button className={`tab ${tab === 'table' ? 'active' : ''}`} onClick={() => setTab('table')}>Full Table</button>
          </div>

          {tab === 'bar' && (
            <div className="card" style={{ marginBottom: 24 }}>
              <div className="card-title" style={{ marginBottom: 16 }}>
                Total Simulated Cost — {wt.label} · seed {seed}
                <span style={{ fontWeight: 400, marginLeft: 8, color: 'var(--text-muted)' }}>
                  (lower = better; {migEnabled ? 'includes migration cost' : 'placement cost only'})
                </span>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={costData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <RTooltip formatter={(v) => v.toLocaleString()} />
                  <Bar dataKey="cost" radius={[6, 6, 0, 0]}>
                    {costData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {tab === 'dual' && migEnabled && (
            <div className="card" style={{ marginBottom: 24 }}>
              <div className="card-title" style={{ marginBottom: 16 }}>
                Migration Impact — Placement Cost vs Total Cost (incl. migration)
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={dualCostData} margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <RTooltip formatter={(v, name) => [v.toLocaleString(), name === 'placement' ? 'Placement cost' : 'Total incl. migration']} />
                  <Legend formatter={v => v === 'placement' ? 'Placement cost' : 'Cost incl. migration'} />
                  <Bar dataKey="placement" name="placement" radius={[4, 4, 0, 0]}>
                    {dualCostData.map((d, i) => <Cell key={i} fill={d.color} opacity={0.9} />)}
                  </Bar>
                  <Bar dataKey="withMig" name="withMig" radius={[4, 4, 0, 0]} fillOpacity={0.45}>
                    {dualCostData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                Migration cost = sizeMB × 2.0 × (dist/10). Solid bars = placement cost; transparent bars = total cost.
                The no-migration baseline has zero migration cost — useful for measuring migration overhead.
              </p>
            </div>
          )}

          {tab === 'radar' && (
            <div className="card" style={{ marginBottom: 24 }}>
              <div className="card-title" style={{ marginBottom: 16 }}>
                Multi-Metric Radar — {wt.label}
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="var(--border)" />
                  <PolarAngleAxis dataKey="metric" tick={{ fontSize: 12 }} />
                  {rows.map((r, i) => (
                    <Radar key={r.algorithm} name={r.algorithm} dataKey={r.algorithm}
                      stroke={COLORS[i]} fill={COLORS[i]} fillOpacity={0.15} />
                  ))}
                  <Legend iconType="circle" iconSize={10} />
                  <RTooltip formatter={(v) => `${v.toFixed(1)}%`} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}

          {tab === 'table' && (
            <div className="card" style={{ marginBottom: 24, overflowX: 'auto' }}>
              <div className="card-title" style={{ marginBottom: 12 }}>
                {wt.label} — Algorithm Comparison (seed {seed}, {simConfig?.numNodes ?? 4}N {simConfig?.topologyType ?? 'Symmetric'})
              </div>
              <table className="algo-table">
                <thead>
                  <tr>
                    <th>Algorithm</th>
                    <th>Placement Cost</th>
                    {migEnabled && <th>Migration Cost</th>}
                    {migEnabled && <th>Total Cost (incl.mig)</th>}
                    <th>Local Access %</th>
                    <th>Remote Access %</th>
                    <th>CPU Util</th>
                    <th>Mem Util</th>
                    {migEnabled && <th>Migr. Completed</th>}
                    {migEnabled && <th>Evals</th>}
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const isBest = r.algorithm === best
                    const cls    = ALGO_CLASS[r.algorithm] || 'algo-random'
                    return (
                      <tr key={r.algorithm} className={isBest ? 'best-row' : ''}>
                        <td><span className={`algo-chip ${cls}`}>{r.algorithm}</span></td>
                        <td><strong>{r.cost?.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></td>
                        {migEnabled && <td>{(r.costWithMig - r.cost)?.toFixed(0)}</td>}
                        {migEnabled && <td><strong>{r.costWithMig?.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></td>}
                        <td><strong style={{ color: 'var(--accent-5)' }}>{r.localPct?.toFixed(2)}%</strong></td>
                        <td style={{ color: 'var(--accent-1)' }}>{r.remotePct?.toFixed(2)}%</td>
                        <td>{r.cpuUtil?.toFixed(1)}%</td>
                        <td>{r.memUtil?.toFixed(1)}%</td>
                        {migEnabled && <td style={{ color: '#059669', fontWeight: 700 }}>{r.migrationsCompleted ?? '—'}</td>}
                        {migEnabled && <td>{r.evalCount ?? '—'}</td>}
                        <td>
                          {isBest
                            ? <span className="badge badge-green">✓ Best</span>
                            : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10 }}>
                All algorithms ran on the same workload trace with seed {seed}. Cost values are synthetic simulation units, not real latency.
                {migEnabled && ' Migration cost is included in "Total Cost". The Random algorithm with migration disabled is the baseline for improvement%.'}
              </p>
            </div>
          )}

          {/* Local access rate cards */}
          <div className="section-title">Local Access Rate by Algorithm</div>
          <div className="grid-4" style={{ marginBottom: 24 }}>
            {rows.map((r, i) => (
              <div key={r.algorithm} className="card card-sm" style={{ borderTop: `3px solid ${COLORS[i % COLORS.length]}` }}>
                <div className="text-xs text-muted" style={{ marginBottom: 4 }}>{r.algorithm}</div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{r.localPct?.toFixed(1)}%</div>
                <div className="text-xs text-muted">local access rate</div>
                <div className="progress-wrap" style={{ marginTop: 8 }}>
                  <div className="progress-fill" style={{ width: `${r.localPct ?? 0}%`, background: COLORS[i % COLORS.length] }} />
                </div>
                <div className="text-xs text-muted" style={{ marginTop: 4 }}>
                  {migEnabled
                    ? `Cost w/mig: ${r.costWithMig?.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                    : `Cost: ${r.cost?.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                </div>
              </div>
            ))}
          </div>

          {/* Topology info */}
          {topology && (
            <div className="card" style={{ background: 'var(--bg-main)', border: '1px solid var(--border)', marginBottom: 24 }}>
              <div className="card-title" style={{ marginBottom: 8 }}>Topology Used for This Comparison</div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: 'var(--text-secondary)' }}>
                <span><strong>{topology.numNodes}</strong> nodes</span>
                <span><strong>{topology.type}</strong> topology</span>
                {(topology.nodes ?? []).map(n => (
                  <span key={n.id}>N{n.id}: {n.cpus}C/{n.memMB?.toLocaleString()}MB</span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
