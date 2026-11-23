import { useState } from 'react'
import { Play, X, Trophy } from 'lucide-react'
import { LoadingState, EmptyState, RawOutput, ALGO_CLASS } from '../shared.jsx'
import { WORKLOAD_TYPES } from '../../App.jsx'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, ResponsiveContainer, Cell,
  RadialBarChart, RadialBar, PolarAngleAxis,
  LineChart, Line, Legend,
} from 'recharts'

// Algorithm identity. Validated for colour-vision-deficiency separation and
// contrast on the white card surface. Green is deliberately absent so it stays
// reserved for "best"/"paid off" status, and no slot reads as an alert colour —
// the old palette painted the best-performing algorithm alert-red.
const COLORS      = ['#2563eb', '#ea580c', '#9333ea', '#a16207']
const NODE_COLORS = ['#ff6b6b', '#4ecdc4', '#a78bfa', '#34d399', '#ff8e53', '#60a5fa', '#f472b6', '#fbbf24']

// Cost components. In the cost chart colour encodes WHICH COST a slice is, not
// which algorithm — the algorithm is already named on the x axis.
const COST_PLACEMENT = '#2563eb'
const COST_MIGRATION = '#ea580c'
const WIN            = '#15803d'

function WorkloadBadge({ typeKey }) {
  const wt = WORKLOAD_TYPES.find(w => w.key === typeKey) ?? WORKLOAD_TYPES[3]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '3px 12px', borderRadius: 20,
      background: wt.bg, color: wt.color,
      fontSize: 11, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase',
    }}>
      {wt.label}
    </span>
  )
}

function RadialGauge({ value, max = 100, color, label, size = 120 }) {
  const capped = Math.min(value, max)
  const data   = [{ name: label, value: capped, fill: color }]
  return (
    <div style={{ textAlign: 'center' }}>
      <ResponsiveContainer width={size} height={size}>
        <RadialBarChart cx="50%" cy="50%" innerRadius="65%" outerRadius="100%"
          startAngle={225} endAngle={-45} data={data}>
          <PolarAngleAxis type="number" domain={[0, max]} angleAxisId={0} tick={false} />
          <RadialBar background={{ fill: 'var(--bg-main)' }} dataKey="value" angleAxisId={0} cornerRadius={6} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div style={{ marginTop: -12, fontSize: 18, fontWeight: 900, color }}>{value.toFixed(0)}%</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
    </div>
  )
}

function NodeModal({ node, algo, algoColor, onClose }) {
  if (!node) return null
  const nodeColor = NODE_COLORS[node.id % NODE_COLORS.length]
  const cpuColor  = node.cpuLoad > 100 ? '#ff6b6b' : node.cpuLoad > 75 ? '#ff8e53' : '#4ecdc4'
  const memColor  = node.memUtil > 80  ? '#ff6b6b' : node.memUtil > 60 ? '#ff8e53' : '#a78bfa'

  const barData = (algo.nodes ?? []).map(n => ({
    name: `N${n.id}`,
    cpu: +n.cpuLoad.toFixed(1),
    mem: +n.memUtil.toFixed(1),
    threads: n.threads,
    active: n.id === node.id,
  }))

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-card)', borderRadius: 20,
        width: '100%', maxWidth: 680,
        boxShadow: '0 24px 64px rgba(0,0,0,0.18)', overflow: 'hidden',
      }} onClick={e => e.stopPropagation()}>
        <div style={{
          padding: '20px 24px',
          background: `linear-gradient(135deg, ${nodeColor}22, ${nodeColor}08)`,
          borderBottom: `3px solid ${nodeColor}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 900, color: nodeColor }}>Node {node.id}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
              <span style={{ fontWeight: 700, color: algoColor }}>{algo.algorithm}</span>
              &nbsp;· {node.threads} thread{node.threads !== 1 ? 's' : ''} assigned
              {(node.incomingMig > 0 || node.outgoingMig > 0) && (
                <span style={{ marginLeft: 10, color: '#059669' }}>
                  ↑{node.outgoingMig} ↓{node.incomingMig} migrations
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{
            border: 'none', cursor: 'pointer', background: 'var(--bg-main)',
            borderRadius: 8, padding: 8, display: 'flex', color: 'var(--text-muted)',
          }}><X size={18} /></button>
        </div>

        <div style={{ padding: 24 }}>
          <div style={{
            display: 'flex', justifyContent: 'space-around', alignItems: 'center',
            marginBottom: 28, padding: '20px 0',
            background: 'var(--bg-main)', borderRadius: 14,
          }}>
            <RadialGauge value={Math.min(node.cpuLoad, 100)} color={cpuColor} label="CPU Load" size={130} />
            <div style={{ width: 1, height: 80, background: 'var(--border)' }} />
            <RadialGauge value={node.memUtil} color={memColor} label="Mem Util" size={130} />
            <div style={{ width: 1, height: 80, background: 'var(--border)' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 40, fontWeight: 900, color: nodeColor, lineHeight: 1 }}>{node.threads}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>Threads</div>
              {node.cpuLoad > 100 && (
                <div style={{
                  marginTop: 6, fontSize: 10, fontWeight: 700,
                  background: 'rgba(255,107,107,0.12)', color: '#dc2626',
                  padding: '2px 8px', borderRadius: 10,
                }}>OVERSUBSCRIBED</div>
              )}
            </div>
          </div>

          {/* Node detail stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 20 }}>
            {[
              ['Pages', node.pageCount ?? '—'],
              ['Mem Used', `${(node.memUsedMB ?? 0).toLocaleString()} MB`],
              ['Mem Total', `${(node.memTotalMB ?? 8192).toLocaleString()} MB`],
              ['Incoming Mig', node.incomingMig ?? 0],
              ['Outgoing Mig', node.outgoingMig ?? 0],
              ['Remote Access', node.remoteAcc ?? '—'],
            ].map(([label, val]) => (
              <div key={label} style={{ background: 'var(--bg-main)', borderRadius: 8, padding: '8px 12px' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
                <div style={{ fontWeight: 700 }}>{val}</div>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
            Node Comparison — {algo.algorithm}
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={barData} margin={{ top: 0, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} domain={[0, Math.max(100, ...barData.map(d => d.cpu))]} />
              <RTooltip formatter={(v, name) => [`${v}%`, name === 'cpu' ? 'CPU Load' : 'Mem Util']} />
              <Bar dataKey="cpu" name="cpu" radius={[4, 4, 0, 0]}>
                {barData.map((d, i) => <Cell key={i} fill={d.active ? cpuColor : '#e2e8f0'} opacity={d.active ? 1 : 0.7} />)}
              </Bar>
              <Bar dataKey="mem" name="mem" radius={[4, 4, 0, 0]}>
                {barData.map((d, i) => <Cell key={i} fill={d.active ? memColor : '#cbd5e1'} opacity={d.active ? 1 : 0.5} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

function AlgoCard({ algo, algoIndex, onNodeClick }) {
  const cls       = ALGO_CLASS[algo.algorithm] || 'algo-random'
  const algoColor = COLORS[algoIndex % COLORS.length]
  const hasMig    = algo.migrationEnabled

  return (
    <div className="card" style={{ borderTop: `3px solid ${algoColor}` }}>
      <div className="card-header">
        <span className={`algo-chip ${cls}`}>{algo.algorithm}</span>
        <span className="text-muted text-sm">
          Cost: {algo.totalCost?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          {hasMig && (
            <span style={{ marginLeft: 8, color: '#059669', fontSize: 11 }}>
              +mig: {algo.migrationCostTotal?.toFixed(0)} → {algo.totalCostWithMig?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          )}
        </span>
      </div>

      <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', marginBottom: 12 }}>
        <thead>
          <tr style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>
            <td style={{ paddingBottom: 6 }}>Node</td>
            <td style={{ paddingBottom: 6 }}>Threads</td>
            <td style={{ paddingBottom: 6 }}>CPU Load</td>
            <td style={{ paddingBottom: 6 }}>Mem Util</td>
            <td style={{ paddingBottom: 6 }}>Pages</td>
            {hasMig && <td style={{ paddingBottom: 6 }}>Mig ↑↓</td>}
            <td />
          </tr>
        </thead>
        <tbody>
          {(algo.nodes ?? []).map(n => {
            const nodeColor = NODE_COLORS[n.id % NODE_COLORS.length]
            return (
              <tr key={n.id}
                onClick={() => onNodeClick(n, algo, algoColor)}
                style={{ cursor: 'pointer', transition: 'background 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-main)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <td style={{ padding: '5px 0' }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 26, height: 26, borderRadius: 6,
                    background: `${nodeColor}18`, color: nodeColor, fontSize: 11, fontWeight: 800,
                  }}>N{n.id}</span>
                </td>
                <td style={{ fontWeight: 600 }}>{n.threads}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className="progress-wrap" style={{ width: 60 }}>
                      <div className="progress-fill" style={{
                        width: `${Math.min(100, n.cpuLoad)}%`,
                        background: n.cpuLoad > 100 ? '#ff6b6b' : n.cpuLoad > 75 ? '#ff8e53' : '#4ecdc4'
                      }} />
                    </div>
                    <span style={{ fontSize: 12, color: n.cpuLoad > 100 ? '#dc2626' : 'inherit' }}>
                      {n.cpuLoad.toFixed(0)}%
                    </span>
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className="progress-wrap" style={{ width: 60 }}>
                      <div className="progress-fill" style={{
                        width: `${Math.min(100, n.memUtil)}%`,
                        background: n.memUtil > 80 ? '#ff6b6b' : n.memUtil > 60 ? '#ff8e53' : '#a78bfa'
                      }} />
                    </div>
                    {n.memUtil.toFixed(0)}%
                  </div>
                </td>
                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{n.pageCount ?? '—'}</td>
                {hasMig && (
                  <td style={{ fontSize: 12, color: '#059669' }}>
                    ↑{n.outgoingMig ?? 0} ↓{n.incomingMig ?? 0}
                  </td>
                )}
                <td style={{ color: 'var(--text-muted)', fontSize: 11, paddingLeft: 4 }}>▸</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
        <span>Local: <strong style={{ color: 'var(--accent-5)' }}>{algo.localAccesses?.toLocaleString()}</strong></span>
        <span>Remote: <strong style={{ color: 'var(--accent-1)' }}>{algo.remoteAccesses?.toLocaleString()}</strong></span>
        {hasMig && <>
          <span>Migrated: <strong style={{ color: '#059669' }}>{algo.migrationsCompleted}</strong></span>
          <span>Evals: <strong>{algo.evalCount}</strong></span>
        </>}
      </div>
      <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
        Click a node row for detailed charts
      </div>
    </div>
  )
}

// Migration summary panel
function MigrationPanel({ algos }) {
  const hasMig = algos.some(a => a.migrationEnabled)
  if (!hasMig) return null

  return (
    <div className="card" style={{ marginBottom: 24, borderTop: '3px solid #34d399' }}>
      <div className="card-title" style={{ marginBottom: 16 }}>
        Simulated Page Migration Summary
        <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>
          (simulated — not real OS migration)
        </span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="algo-table">
          <thead>
            <tr>
              <th>Algorithm</th>
              <th>Eval Count</th>
              <th>Migr. Attempted</th>
              <th>Migr. Completed</th>
              <th>Rejected</th>
              <th>MB Transferred</th>
              <th>Ping-Pong Prev.</th>
              <th>Migration Cost</th>
              <th>Total Cost (incl. mig)</th>
            </tr>
          </thead>
          <tbody>
            {algos.map(a => (
              <tr key={a.algorithm}>
                <td><span className={`algo-chip ${ALGO_CLASS[a.algorithm] || 'algo-random'}`}>{a.algorithm}</span></td>
                <td>{a.evalCount ?? 0}</td>
                <td>{a.migrationsAttempted ?? 0}</td>
                <td style={{ color: '#059669', fontWeight: 700 }}>{a.migrationsCompleted ?? 0}</td>
                <td style={{ color: a.migrationsRejected > 0 ? '#dc2626' : 'inherit' }}>{a.migrationsRejected ?? 0}</td>
                <td>{a.mbTransferred ?? 0} MB</td>
                <td>{a.pingPongPrevented ?? 0}</td>
                <td>{a.migrationCostTotal?.toFixed(0) ?? 0}</td>
                <td><strong>{a.totalCostWithMig?.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10 }}>
        Migration cost formula: sizeMB × 2.0 × (dist/10). Total cost = placement cost + migration cost. Both are simulation units, not real latency.
      </p>
    </div>
  )
}

export default function RunPage({ seed, workloadType, simConfig }) {
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [modalNode, setModalNode] = useState(null)

  const wt = WORKLOAD_TYPES.find(w => w.key === workloadType) ?? WORKLOAD_TYPES[3]
  const migEnabled = simConfig?.migrationEnabled ?? false

  async function runAll() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/run', {
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

  const algos = data?.algorithms ?? []

  // Stacked rather than paired: migration cost sits on top of the placement
  // cost it was paid to reduce, so the total height is the number to compare
  // and the overhead is a visible slice instead of a second near-identical bar.
  const chartData = algos.map(a => {
    const placement = Math.round(a.totalCost ?? 0)
    const total     = Math.round(a.totalCostWithMig ?? a.totalCost ?? 0)
    return { name: a.algorithm, placement, migration: Math.max(0, total - placement), total }
  })

  const bestIdx = chartData.length
    ? chartData.reduce((b, d, i) => (d.total < chartData[b].total ? i : b), 0) : -1
  const best      = bestIdx >= 0 ? chartData[bestIdx] : null
  const randomRow = chartData.find(d => d.name === 'Random')
  const vsRandom  = best && randomRow && randomRow.total > 0 && best.name !== 'Random'
    ? (1 - best.total / randomRow.total) * 100 : 0

  // The winner's axis label is bold, dark green and check-marked, so the
  // highlight survives greyscale printing and colour-vision deficiency.
  const AlgoTick = ({ x, y, payload }) => {
    const isBest = payload.value === best?.name
    return (
      <text x={x} y={y + 14} textAnchor="middle" fontSize={12}
            fontWeight={isBest ? 800 : 400}
            fill={isBest ? WIN : 'var(--text-secondary)'}>
        {isBest ? '✓ ' : ''}{payload.value}
      </text>
    )
  }

  return (
    <div>
      {modalNode && (
        <NodeModal
          node={modalNode.node} algo={modalNode.algo}
          algoColor={modalNode.algoColor} onClose={() => setModalNode(null)}
        />
      )}

      <div className="page-hero">
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            Run All Four Algorithms
            <WorkloadBadge typeKey={workloadType} />
            {migEnabled && (
              <span style={{ fontSize: 11, background: 'rgba(52,211,153,0.15)', color: '#059669', padding: '3px 10px', borderRadius: 20, fontWeight: 700 }}>
                🔄 Migration ON
              </span>
            )}
          </h2>
          <p>
            Random · Local-First · Load-Aware · Adaptive NUMA-Aware · seed {seed} ·{' '}
            {simConfig?.numNodes ?? 4}N {simConfig?.topologyType ?? 'Symmetric'}
          </p>
        </div>
        <button className="btn btn-primary" onClick={runAll} disabled={loading}>
          <Play size={16} />
          {loading ? 'Running…' : 'Run All'}
        </button>
      </div>

      {/* Config strip */}
      <div style={{
        display: 'flex', gap: 10, marginBottom: 24, padding: '12px 16px',
        background: wt.bg, borderRadius: 12, borderLeft: `4px solid ${wt.color}`,
        alignItems: 'center', flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: wt.color, textTransform: 'uppercase' }}>{wt.label} Workload</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>·</span>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Seed: <strong>{seed}</strong></span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>·</span>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {simConfig?.numNodes ?? 4} nodes · {simConfig?.topologyType ?? 'Symmetric'}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>·</span>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          Same workload for <strong>all 4 algorithms</strong> (fair comparison)
        </span>
      </div>

      {!data && !loading && (
        <EmptyState icon="⚙️" title="Ready to run"
          desc={`Click 'Run All' to execute all 4 algorithms on the ${wt.label} workload`} />
      )}
      {loading && <LoadingState text={`Running all 4 algorithms on ${wt.label} workload…`} />}
      {error   && <p style={{ color: 'var(--accent-1)' }}>Error: {error}</p>}

      {data && (
        <>
          {/* Workload summary cards */}
          <div className="grid-4" style={{ marginBottom: 24 }}>
            <div className="card card-sm" style={{ borderTop: `3px solid ${wt.color}` }}>
              <div className="card-title">Workload</div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>#{data.workload?.workloadId}</div>
              <div className="card-sub">{wt.label} · seed {data.workload?.seed}</div>
            </div>
            <div className="card card-sm">
              <div className="card-title">Pages</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{data.workload?.numPages?.toLocaleString()}</div>
              <div className="card-sub">{data.workload?.pageSizeMB} MB each</div>
            </div>
            <div className="card card-sm">
              <div className="card-title">Threads</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{data.workload?.numThreads}</div>
              <div className="card-sub">{data.workload?.numPhases} phase{data.workload?.numPhases !== 1 ? 's' : ''}</div>
            </div>
            <div className="card card-sm">
              <div className="card-title">Total Accesses</div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>
                {data.workload?.totalAccesses?.toLocaleString()}
              </div>
              <div className="card-sub">
                {data.workload?.totalAccesses
                  ? `R:${((data.workload.totalReads / data.workload.totalAccesses) * 100).toFixed(0)}% W:${((data.workload.totalWrites / data.workload.totalAccesses) * 100).toFixed(0)}%`
                  : ''}
              </div>
            </div>
          </div>

          {/* Cost bar chart */}
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="card-title" style={{ marginBottom: 4 }}>
              Simulated Cost by Algorithm
              <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>
                (lower = better; cost units, not real latency)
              </span>
            </div>

            {/* The headline states the winner in words, so the chart is not the
                only place the result exists. */}
            {best && (
              <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--text-secondary)' }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '2px 9px', borderRadius: 20, marginRight: 8,
                  background: 'rgba(21,128,61,0.10)', color: WIN,
                  fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.4,
                }}>
                  <Trophy size={12} strokeWidth={3} /> Best
                </span>
                <strong style={{ color: WIN }}>{best.name}</strong> at{' '}
                <strong>{best.total.toLocaleString()}</strong> cost units
                {vsRandom > 0 && <> — {vsRandom.toFixed(1)}% below Random</>}
                {migEnabled && best.migration > 0 &&
                  <> · includes {best.migration.toLocaleString()} paid for migration</>}
              </p>
            )}

            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} margin={{ top: 30, right: 20, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={<AlgoTick />} tickLine={false}
                       axisLine={{ stroke: 'var(--border)' }} interval={0} height={28} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickLine={false}
                       axisLine={false} tickFormatter={v => v.toLocaleString()} />
                <RTooltip
                  cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                  formatter={(v, name) => [
                    v.toLocaleString(),
                    name === 'placement' ? 'Memory access cost' : 'Migration cost paid',
                  ]}
                  labelFormatter={(label) => label === best?.name ? `${label}  — best` : label}
                />
                {migEnabled && (
                  <Legend wrapperStyle={{ fontSize: 12 }}
                          formatter={v => v === 'placement' ? 'Memory access cost' : 'Migration cost paid'} />
                )}
                {/* The winner's bar is outlined in the same green used by the
                    headline badge and the axis tick. Cells get their index by
                    construction, so this is reliable where a LabelList with a
                    custom content function is not. */}
                <Bar dataKey="placement" stackId="cost" fill={COST_PLACEMENT}
                     radius={migEnabled ? 0 : [4, 4, 0, 0]}>
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={COST_PLACEMENT}
                          stroke={i === bestIdx ? WIN : undefined}
                          strokeWidth={i === bestIdx ? 2.5 : 0} />
                  ))}
                </Bar>
                {migEnabled && (
                  <Bar dataKey="migration" stackId="cost" fill={COST_MIGRATION}
                       radius={[4, 4, 0, 0]}>
                    {chartData.map((d, i) => (
                      // A surface-coloured stroke keeps the two slices from
                      // reading as one block where they meet; the winner gets
                      // the green outline instead.
                      <Cell key={i} fill={COST_MIGRATION}
                            stroke={i === bestIdx ? WIN : '#ffffff'} strokeWidth={2.5} />
                    ))}
                  </Bar>
                )}
              </BarChart>
            </ResponsiveContainer>

            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '8px 0 0' }}>
              {migEnabled
                ? 'Each bar is the memory access cost plus the migration cost paid on top of it. Shortest total bar wins.'
                : 'Migration is off, so each bar is memory access cost alone. Shortest bar wins.'}
            </p>
          </div>

          {/* Migration panel */}
          <MigrationPanel algos={algos} />

          {/* Per-algo cards */}
          <div className="section-title">
            Per-Algorithm Node Placement
            <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 10 }}>
              — click any row for details
            </span>
          </div>
          <div className="grid-2" style={{ marginBottom: 24 }}>
            {algos.map((a, i) => (
              <AlgoCard key={a.algorithm} algo={a} algoIndex={i}
                onNodeClick={(node, algo, algoColor) => setModalNode({ node, algo, algoColor })} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
