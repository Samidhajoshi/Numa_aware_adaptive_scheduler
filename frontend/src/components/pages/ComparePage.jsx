import { useState } from 'react'
import { BarChart2, Trophy } from 'lucide-react'
import { LoadingState, EmptyState, RawOutput, ALGO_CLASS } from '../shared.jsx'
import { WORKLOAD_TYPES } from '../../App.jsx'
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
  ResponsiveContainer, Tooltip as RTooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell
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
    }}>
      {wt.label}
    </span>
  )
}

export default function ComparePage({ seed, workloadType }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [tab, setTab]         = useState('bar')

  const wt = WORKLOAD_TYPES.find(w => w.key === workloadType) ?? WORKLOAD_TYPES[3]

  async function compare() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/compare', {
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

  const rows       = data?.comparison?.rows ?? []
  const best       = data?.comparison?.bestAlgorithm
  const improvement = data?.comparison?.improvementPct

  const radarData = ['localPct', 'cpuUtil', 'memUtil'].map(key => ({
    metric: key === 'localPct' ? 'Local %' : key === 'cpuUtil' ? 'CPU Util' : 'Mem Util',
    ...Object.fromEntries(rows.map(r => [r.algorithm, r[key]])),
  }))

  const costData = rows.map((r, i) => ({
    name:  r.algorithm,
    cost:  Math.round(r.cost),
    color: COLORS[i % COLORS.length],
  }))

  return (
    <div>
      <div className="page-hero">
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            Compare Performance
            <WorkloadBadge typeKey={workloadType} />
          </h2>
          <p>Side-by-side analysis of all four placement strategies · seed {seed}</p>
        </div>
        <button className="btn btn-primary" onClick={compare} disabled={loading}>
          <BarChart2 size={16} />
          {loading ? 'Comparing…' : `Compare`}
        </button>
      </div>

      {/* Workload context strip */}
      <div style={{
        display: 'flex', gap: 10, marginBottom: 24, padding: '12px 16px',
        background: wt.bg, borderRadius: 12, borderLeft: `4px solid ${wt.color}`,
        alignItems: 'center', flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: wt.color, textTransform: 'uppercase' }}>
          Selected Workload: {wt.label}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>·</span>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Seed: <strong>{seed}</strong></span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>·</span>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          Same workload passed to all 4 algorithms
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
            <div className="card card-gradient" style={{
              marginBottom: 24, display: 'flex', alignItems: 'center', gap: 20
            }}>
              <Trophy size={40} color="rgba(255,255,255,0.9)" />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 2, letterSpacing: 0.5 }}>
                  BEST ALGORITHM — {wt.label.toUpperCase()} WORKLOAD
                </div>
                <div style={{ fontSize: 26, fontWeight: 900 }}>{best}</div>
                {improvement != null && (
                  <div style={{ fontSize: 14, opacity: 0.85 }}>
                    {improvement.toFixed(1)}% lower cost than Random
                  </div>
                )}
              </div>
              {data.workload && (
                <div style={{ textAlign: 'right', opacity: 0.85 }}>
                  <div style={{ fontSize: 11, marginBottom: 2 }}>WORKLOAD</div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>#{data.workload.workloadId}</div>
                  <div style={{ fontSize: 12 }}>
                    {((data.workload.totalReads / data.workload.totalAccesses)*100).toFixed(0)}%R /
                    {((data.workload.totalWrites / data.workload.totalAccesses)*100).toFixed(0)}%W
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Chart tabs */}
          <div className="tabs" style={{ marginBottom: 20, maxWidth: 340 }}>
            <button className={`tab ${tab === 'bar'   ? 'active' : ''}`} onClick={() => setTab('bar')}>Cost Chart</button>
            <button className={`tab ${tab === 'radar' ? 'active' : ''}`} onClick={() => setTab('radar')}>Radar</button>
            <button className={`tab ${tab === 'table' ? 'active' : ''}`} onClick={() => setTab('table')}>Table</button>
          </div>

          {tab === 'bar' && (
            <div className="card" style={{ marginBottom: 24 }}>
              <div className="card-title" style={{ marginBottom: 16 }}>
                Total Simulated Cost — {wt.label} · seed {seed} (lower = better)
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
                    <Radar
                      key={r.algorithm}
                      name={r.algorithm}
                      dataKey={r.algorithm}
                      stroke={COLORS[i]}
                      fill={COLORS[i]}
                      fillOpacity={0.15}
                    />
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
                {wt.label} Workload — Algorithm Comparison (seed {seed})
              </div>
              <table className="algo-table">
                <thead>
                  <tr>
                    <th>Algorithm</th>
                    <th>Total Cost</th>
                    <th>Local Access %</th>
                    <th>Remote Access %</th>
                    <th>CPU Util</th>
                    <th>Mem Util</th>
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
                        <td><strong>{r.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></td>
                        <td><strong style={{ color: 'var(--accent-5)' }}>{r.localPct.toFixed(2)}%</strong></td>
                        <td style={{ color: 'var(--accent-1)' }}>{r.remotePct.toFixed(2)}%</td>
                        <td>{r.cpuUtil.toFixed(1)}%</td>
                        <td>{r.memUtil.toFixed(1)}%</td>
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
            </div>
          )}

          {/* Local access rate breakdown cards */}
          <div className="section-title">Local Access Rate by Algorithm — {wt.label}</div>
          <div className="grid-4" style={{ marginBottom: 24 }}>
            {rows.map((r, i) => (
              <div key={r.algorithm} className="card card-sm" style={{
                borderTop: `3px solid ${COLORS[i % COLORS.length]}`
              }}>
                <div className="text-xs text-muted" style={{ marginBottom: 4 }}>{r.algorithm}</div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>
                  {r.localPct.toFixed(1)}%
                </div>
                <div className="text-xs text-muted">local access rate</div>
                <div className="progress-wrap" style={{ marginTop: 8 }}>
                  <div className="progress-fill" style={{
                    width: `${r.localPct}%`,
                    background: COLORS[i % COLORS.length]
                  }} />
                </div>
                <div className="text-xs text-muted" style={{ marginTop: 4 }}>
                  Cost: {r.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
              </div>
            ))}
          </div>

          <RawOutput text={data.raw} />
        </>
      )}
    </div>
  )
}
