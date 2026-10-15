import { useState } from 'react'
import { Play, X, Cpu, MemoryStick } from 'lucide-react'
import { LoadingState, EmptyState, RawOutput, ALGO_CLASS } from '../shared.jsx'
import { WORKLOAD_TYPES } from '../../App.jsx'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, ResponsiveContainer, Cell,
  RadialBarChart, RadialBar, PolarAngleAxis,
} from 'recharts'

const COLORS      = ['#94a3b8', '#4ecdc4', '#a78bfa', '#ff6b6b']
const NODE_COLORS = ['#ff6b6b', '#4ecdc4', '#a78bfa', '#34d399']

// ─── Workload badge ───────────────────────────────────────────────────────────
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

// ─── Radial gauge ─────────────────────────────────────────────────────────────
function RadialGauge({ value, max = 100, color, label, size = 120 }) {
  const capped = Math.min(value, max)
  const data   = [{ name: label, value: capped, fill: color }]
  return (
    <div style={{ textAlign: 'center' }}>
      <ResponsiveContainer width={size} height={size}>
        <RadialBarChart
          cx="50%" cy="50%"
          innerRadius="65%" outerRadius="100%"
          startAngle={225} endAngle={-45}
          data={data}
        >
          <PolarAngleAxis type="number" domain={[0, max]} angleAxisId={0} tick={false} />
          <RadialBar
            background={{ fill: 'var(--bg-main)' }}
            dataKey="value"
            angleAxisId={0}
            cornerRadius={6}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div style={{ marginTop: -12, fontSize: 18, fontWeight: 900, color }}>
        {value.toFixed(0)}%
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
    </div>
  )
}

// ─── Node detail modal ────────────────────────────────────────────────────────
function NodeModal({ node, algo, algoColor, onClose }) {
  if (!node) return null

  const nodeColor = NODE_COLORS[node.id % NODE_COLORS.length]
  const cpuColor  = node.cpuLoad  > 100 ? '#ff6b6b' : node.cpuLoad  > 75 ? '#ff8e53' : '#4ecdc4'
  const memColor  = node.memUtil  > 80  ? '#ff6b6b' : node.memUtil  > 60 ? '#ff8e53' : '#a78bfa'

  // Bar chart comparing this node vs all nodes in same algo
  const barData = algo.nodes.map(n => ({
    name: `N${n.id}`,
    cpu: +n.cpuLoad.toFixed(1),
    mem: +n.memUtil.toFixed(1),
    threads: n.threads,
    active: n.id === node.id,
  }))

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-card)', borderRadius: 20,
          width: '100%', maxWidth: 680,
          boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Modal header */}
        <div style={{
          padding: '20px 24px',
          background: `linear-gradient(135deg, ${nodeColor}22, ${nodeColor}08)`,
          borderBottom: `3px solid ${nodeColor}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 900, color: nodeColor }}>
              Node {node.id}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
              <span style={{ fontWeight: 700, color: algoColor }}>{algo.algorithm}</span>
              &nbsp;· {node.threads} thread{node.threads !== 1 ? 's' : ''} assigned
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              border: 'none', cursor: 'pointer', background: 'var(--bg-main)',
              borderRadius: 8, padding: 8, display: 'flex', color: 'var(--text-muted)',
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 24 }}>
          {/* Gauges row */}
          <div style={{
            display: 'flex', justifyContent: 'space-around', alignItems: 'center',
            marginBottom: 28,
            padding: '20px 0',
            background: 'var(--bg-main)', borderRadius: 14,
          }}>
            <RadialGauge value={Math.min(node.cpuLoad, 100)} color={cpuColor}  label="CPU Load"   size={130} />
            <div style={{ width: 1, height: 80, background: 'var(--border)' }} />
            <RadialGauge value={node.memUtil}                color={memColor}  label="Mem Util"   size={130} />
            <div style={{ width: 1, height: 80, background: 'var(--border)' }} />
            {/* Thread gauge */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 40, fontWeight: 900, color: nodeColor, lineHeight: 1 }}>
                {node.threads}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>Threads</div>
              {node.cpuLoad > 100 && (
                <div style={{
                  marginTop: 6, fontSize: 10, fontWeight: 700,
                  background: 'rgba(255,107,107,0.12)', color: '#dc2626',
                  padding: '2px 8px', borderRadius: 10,
                }}>
                  OVERSUBSCRIBED
                </div>
              )}
            </div>
          </div>

          {/* All-nodes comparison chart */}
          <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
            Node Comparison — {algo.algorithm}
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={barData} margin={{ top: 0, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} domain={[0, Math.max(100, ...barData.map(d => d.cpu))]} />
              <RTooltip
                formatter={(v, name) => [`${v}%`, name === 'cpu' ? 'CPU Load' : 'Mem Util']}
              />
              <Bar dataKey="cpu" name="cpu" radius={[4, 4, 0, 0]}>
                {barData.map((d, i) => (
                  <Cell
                    key={i}
                    fill={d.active ? cpuColor : '#e2e8f0'}
                    opacity={d.active ? 1 : 0.7}
                  />
                ))}
              </Bar>
              <Bar dataKey="mem" name="mem" radius={[4, 4, 0, 0]}>
                {barData.map((d, i) => (
                  <Cell
                    key={i}
                    fill={d.active ? memColor : '#cbd5e1'}
                    opacity={d.active ? 1 : 0.5}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-muted)', marginTop: 6, justifyContent: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: cpuColor, display: 'inline-block' }} />
              CPU Load
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: memColor, display: 'inline-block' }} />
              Mem Util
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: nodeColor, display: 'inline-block' }} />
              Selected node (N{node.id})
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Per-algo card with clickable rows ────────────────────────────────────────
function AlgoNodeGrid({ algo, algoIndex, onNodeClick }) {
  const cls       = ALGO_CLASS[algo.algorithm] || 'algo-random'
  const algoColor = COLORS[algoIndex % COLORS.length]

  return (
    <div className="card" style={{ borderTop: `3px solid ${algoColor}` }}>
      <div className="card-header">
        <span className={`algo-chip ${cls}`}>{algo.algorithm}</span>
        <span className="text-muted text-sm">
          Cost: {algo.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </span>
      </div>

      <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', marginBottom: 12 }}>
        <thead>
          <tr style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>
            <td style={{ paddingBottom: 6 }}>Node</td>
            <td style={{ paddingBottom: 6 }}>Threads</td>
            <td style={{ paddingBottom: 6 }}>CPU Load</td>
            <td style={{ paddingBottom: 6 }}>Mem Util</td>
            <td />
          </tr>
        </thead>
        <tbody>
          {algo.nodes.map(n => {
            const nodeColor = NODE_COLORS[n.id % NODE_COLORS.length]
            return (
              <tr
                key={n.id}
                onClick={() => onNodeClick(n, algo, algoColor)}
                style={{
                  cursor: 'pointer', borderRadius: 8,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-main)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <td style={{ padding: '5px 0' }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 26, height: 26, borderRadius: 6,
                    background: `${nodeColor}18`, color: nodeColor,
                    fontSize: 11, fontWeight: 800,
                  }}>
                    N{n.id}
                  </span>
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
                <td style={{ color: 'var(--text-muted)', fontSize: 11, paddingLeft: 4 }}>
                  ▸
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)' }}>
        <span>Local: <strong style={{ color: 'var(--accent-5)' }}>{algo.localAccesses.toLocaleString()}</strong></span>
        <span>Remote: <strong style={{ color: 'var(--accent-1)' }}>{algo.remoteAccesses.toLocaleString()}</strong></span>
      </div>
      <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
        Click a node row to see detailed charts
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function RunPage({ seed, workloadType }) {
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [modalNode, setModalNode]  = useState(null)   // { node, algo, algoColor }

  const wt = WORKLOAD_TYPES.find(w => w.key === workloadType) ?? WORKLOAD_TYPES[3]

  async function runAll() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed, workloadType }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      setData(json)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const chartData = (data?.algorithms ?? []).map((a, i) => ({
    name: a.algorithm,
    cost: Math.round(a.cost),
    color: COLORS[i % COLORS.length],
  }))

  return (
    <div>
      {/* Node detail modal */}
      {modalNode && (
        <NodeModal
          node={modalNode.node}
          algo={modalNode.algo}
          algoColor={modalNode.algoColor}
          onClose={() => setModalNode(null)}
        />
      )}

      <div className="page-hero">
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            Run All Four Algorithms
            <WorkloadBadge typeKey={workloadType} />
          </h2>
          <p>Random · Local-First · Load-Aware · Adaptive NUMA-Aware · seed {seed}</p>
        </div>
        <button className="btn btn-primary" onClick={runAll} disabled={loading}>
          <Play size={16} />
          {loading ? 'Running…' : `Run All`}
        </button>
      </div>

      {/* Workload info strip */}
      <div style={{
        display: 'flex', gap: 10, marginBottom: 24, padding: '12px 16px',
        background: wt.bg, borderRadius: 12, borderLeft: `4px solid ${wt.color}`,
        alignItems: 'center', flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: wt.color, textTransform: 'uppercase' }}>
          {wt.label} Workload
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>·</span>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Seed: <strong>{seed}</strong></span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>·</span>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          All 4 algorithms run on the <strong>same generated workload</strong> for fair comparison
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
          {/* Summary mini-cards */}
          <div className="grid-4" style={{ marginBottom: 24 }}>
            <div className="card card-sm" style={{ borderTop: `3px solid ${wt.color}` }}>
              <div className="card-title">Workload</div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>#{data.workload?.workloadId}</div>
              <div className="card-sub">{wt.label} · seed {data.workload?.seed}</div>
            </div>
            <div className="card card-sm">
              <div className="card-title">Pages</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{data.workload?.numPages}</div>
              <div className="card-sub">{data.workload?.pageSizeMB} MB each</div>
            </div>
            <div className="card card-sm">
              <div className="card-title">Threads</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{data.workload?.numThreads}</div>
            </div>
            <div className="card card-sm">
              <div className="card-title">Total Accesses</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>
                {data.workload?.totalAccesses?.toLocaleString()}
              </div>
              <div className="card-sub">
                R:{((data.workload?.totalReads / data.workload?.totalAccesses) * 100).toFixed(0)}%
                &nbsp;W:{((data.workload?.totalWrites / data.workload?.totalAccesses) * 100).toFixed(0)}%
              </div>
            </div>
          </div>

          {/* Cost bar chart */}
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="card-title" style={{ marginBottom: 16 }}>
              Simulated Cost by Algorithm — {wt.label} Workload
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <RTooltip formatter={(v) => v.toLocaleString()} />
                <Bar dataKey="cost" radius={[6, 6, 0, 0]}>
                  {chartData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Per-algo clickable cards */}
          <div className="section-title">
            Per-Algorithm Node Placement
            <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 10 }}>
              — click any node row for detailed charts
            </span>
          </div>
          <div className="grid-2" style={{ marginBottom: 24 }}>
            {data.algorithms.map((a, i) => (
              <AlgoNodeGrid
                key={a.algorithm}
                algo={a}
                algoIndex={i}
                onNodeClick={(node, algo, algoColor) => setModalNode({ node, algo, algoColor })}
              />
            ))}
          </div>

          <RawOutput text={data.raw} />
        </>
      )}
    </div>
  )
}
