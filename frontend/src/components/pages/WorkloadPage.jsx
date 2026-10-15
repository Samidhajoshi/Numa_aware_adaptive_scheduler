import { useState } from 'react'
import { Zap } from 'lucide-react'
import { LoadingState, EmptyState, RawOutput } from '../shared.jsx'
import { WORKLOAD_TYPES } from '../../App.jsx'
import {
  PieChart, Pie, Cell, Tooltip as RTooltip, ResponsiveContainer, Legend
} from 'recharts'

const PIE_COLORS = ['#ff6b6b', '#4ecdc4', '#a78bfa', '#34d399']

// ─── Workload type badge ──────────────────────────────────────────────────────
function WorkloadBadge({ typeKey }) {
  const wt = WORKLOAD_TYPES.find(w => w.key === typeKey) ?? WORKLOAD_TYPES[3]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 14px', borderRadius: 20,
      background: wt.bg, color: wt.color,
      fontSize: 12, fontWeight: 800, letterSpacing: 0.5,
      textTransform: 'uppercase',
    }}>
      {wt.label}
    </span>
  )
}

// ─── Workload type info panel ─────────────────────────────────────────────────
const TYPE_INFO = {
  CPU_INTENSIVE: { reads: '~71%', writes: '~29%', cpu: 'High (0.85–1.0 cores)', mem: 'Moderate (256–448 MB)', skew: 'Quadratic' },
  READ_HEAVY:    { reads: '~90%', writes: '~10%', cpu: 'Low  (0.40–0.70 cores)', mem: 'Light   (128–320 MB)', skew: 'Cubic (strong)' },
  WRITE_HEAVY:   { reads: '~25%', writes: '~75%', cpu: 'High (0.70–1.00 cores)', mem: 'Heavy   (384–704 MB)', skew: 'Linear (distributed)' },
  MIXED:         { reads: '~70%', writes: '~30%', cpu: 'Moderate (0.60–1.0 cores)', mem: 'Moderate (256–704 MB)', skew: 'Quadratic' },
}

export default function WorkloadPage({ seed, workloadType }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  const wt   = WORKLOAD_TYPES.find(w => w.key === workloadType) ?? WORKLOAD_TYPES[3]
  const info = TYPE_INFO[workloadType] ?? TYPE_INFO.MIXED

  async function generate() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/workload', {
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

  const total     = data?.totalAccesses ?? 0
  const reads     = data?.totalReads    ?? 0
  const writes    = data?.totalWrites   ?? 0
  const readPct   = total ? ((reads  / total) * 100).toFixed(1) : '—'
  const writePct  = total ? ((writes / total) * 100).toFixed(1) : '—'

  const pieData = data?.residentPerNode?.map(r => ({
    name: `Node ${r.node}`, value: r.pages,
  })) ?? []

  return (
    <div>
      {/* Page hero */}
      <div className="page-hero">
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            Database Workload
            <WorkloadBadge typeKey={workloadType} />
          </h2>
          <p>Generate a synthetic database workload · seed {seed}</p>
        </div>
        <button className="btn btn-primary" onClick={generate} disabled={loading}>
          <Zap size={16} />
          {loading ? 'Generating…' : `Generate (seed ${seed})`}
        </button>
      </div>

      {/* Workload type description card */}
      <div className="card" style={{
        marginBottom: 24,
        borderLeft: `4px solid ${wt.color}`,
        display: 'flex', alignItems: 'stretch', gap: 0
      }}>
        <div style={{ flex: 1, padding: '0' }}>
          <div className="card-title" style={{ marginBottom: 12 }}>
            Workload Profile — {wt.label}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
            {[
              { label: 'Read ratio',   value: info.reads },
              { label: 'Write ratio',  value: info.writes },
              { label: 'CPU demand',   value: info.cpu },
              { label: 'Mem footprint',value: info.mem },
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: wt.color }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {!data && !loading && (
        <EmptyState icon="🗄️" title="No workload generated" desc="Click Generate to create a database workload" />
      )}
      {loading && <LoadingState text="Generating workload…" />}
      {error   && <p style={{ color: 'var(--accent-1)' }}>Error: {error}</p>}

      {data && (
        <>
          {/* Stat cards */}
          <div className="grid-3" style={{ marginBottom: 24 }}>
            <div className="card card-gradient">
              <div className="card-title">Workload Type</div>
              <div className="card-value" style={{ fontSize: 22 }}>{wt.label}</div>
              <div className="card-sub">ID #{data.workloadId} · seed {data.seed}</div>
            </div>
            <div className="card">
              <div className="card-title">Total Pages</div>
              <div className="card-value">{data.numPages?.toLocaleString()}</div>
              <div className="card-sub">{data.pageSizeMB} MB per page</div>
            </div>
            <div className="card">
              <div className="card-title">Worker Threads</div>
              <div className="card-value">{data.numThreads}</div>
              <div className="card-sub">database worker threads</div>
            </div>
          </div>

          <div className="grid-2" style={{ marginBottom: 24 }}>
            {/* Access breakdown */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">Access Breakdown</div>
              </div>
              <div className="card-value" style={{ marginBottom: 4 }}>
                {data.totalAccesses?.toLocaleString()}
              </div>
              <div className="card-sub" style={{ marginBottom: 20 }}>total memory accesses</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <div className="flex justify-between text-sm text-muted" style={{ marginBottom: 5 }}>
                    <span>Reads</span>
                    <strong style={{ color: 'var(--accent-3)' }}>
                      {readPct}%  ({reads?.toLocaleString()})
                    </strong>
                  </div>
                  <div className="progress-wrap">
                    <div className="progress-fill" style={{ width: `${readPct}%`, background: 'var(--accent-3)' }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm text-muted" style={{ marginBottom: 5 }}>
                    <span>Writes</span>
                    <strong style={{ color: wt.color }}>
                      {writePct}%  ({writes?.toLocaleString()})
                    </strong>
                  </div>
                  <div className="progress-wrap">
                    <div className="progress-fill" style={{ width: `${writePct}%`, background: wt.color }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Pages per node pie */}
            <div className="card">
              <div className="card-title" style={{ marginBottom: 8 }}>Resident Pages per Node</div>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%" cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <RTooltip formatter={(v) => v.toLocaleString()} />
                    <Legend iconType="circle" iconSize={10} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted text-sm" style={{ textAlign: 'center', paddingTop: 40 }}>
                  No per-node data available
                </p>
              )}
            </div>
          </div>

          <RawOutput text={data.raw} />
        </>
      )}
    </div>
  )
}
