import { useState } from 'react'
import { Server, RefreshCw } from 'lucide-react'
import { LoadingState, EmptyState, RawOutput, ProgressBar, StatRow } from '../shared.jsx'

const NODE_COLORS = ['#ff6b6b', '#4ecdc4', '#a78bfa', '#34d399', '#ff8e53', '#60a5fa', '#f472b6', '#fbbf24']

export default function NodesPage({ simConfig }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const numNodes    = simConfig?.numNodes ?? 4
  const topoType    = simConfig?.topologyType ?? 'Symmetric'

  async function load() {
    setLoading(true)
    setError(null)
    try {
      // Use JSON mode via /api/topology to get topology info
      const res = await fetch('/api/topology', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(simConfig ?? { numNodes: 4, topologyType: 'Symmetric', seed: 42 }),
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

  const topology   = data?.topology
  const distMatrix = topology?.distMatrix ?? []
  const nodes      = topology?.nodes ?? []

  return (
    <div>
      <div className="page-hero">
        <div>
          <h2>NUMA Nodes</h2>
          <p>
            {numNodes} nodes · {topoType} topology ·{' '}
            {nodes.length > 0
              ? `${nodes[0].cpus} CPUs × ${nodes[0].memMB?.toLocaleString()} MB (N0)`
              : 'Load to see details'}
          </p>
        </div>
        <button className="btn btn-primary" onClick={load} disabled={loading}>
          <RefreshCw size={16} />
          {loading ? 'Loading…' : 'Load Nodes'}
        </button>
      </div>

      {!data && !loading && (
        <EmptyState
          icon={<Server />}
          title="No data yet"
          desc="Configure topology in the Config tab, then click 'Load Nodes'"
        />
      )}
      {loading && <LoadingState />}
      {error   && <p style={{ color: 'var(--accent-1)' }}>Error: {error}</p>}

      {data && (
        <>
          {/* Summary stat cards */}
          <div className="grid-4" style={{ marginBottom: 24 }}>
            <div className="card card-gradient">
              <div className="card-title">Total Nodes</div>
              <div className="card-value">{nodes.length}</div>
              <div className="card-sub">{topoType}</div>
            </div>
            <div className="card">
              <div className="card-title">Total CPUs</div>
              <div className="card-value">{nodes.reduce((s, n) => s + (n.cpus ?? 4), 0)}</div>
              <div className="card-sub">across all nodes</div>
            </div>
            <div className="card">
              <div className="card-title">Total Memory</div>
              <div className="card-value" style={{ fontSize: 26 }}>
                {(nodes.reduce((s, n) => s + (n.memMB ?? 8192), 0) / 1024).toFixed(0)}
              </div>
              <div className="card-sub">GB across all nodes</div>
            </div>
            <div className="card">
              <div className="card-title">Local Distance</div>
              <div className="card-value">10</div>
              <div className="card-sub">synthetic sim units (not ACPI-SLIT)</div>
            </div>
          </div>

          {/* Node cards */}
          <div className="section-title">Node Details</div>
          <div className="grid-auto" style={{ marginBottom: 24 }}>
            {nodes.map((n, i) => (
              <div key={n.id} className="node-card">
                <div className="node-id" style={{ color: NODE_COLORS[i % NODE_COLORS.length] }}>
                  N{n.id}
                </div>
                <StatRow label="CPUs" value={n.cpus ?? 4} />
                <StatRow label="Memory" value={`${(n.memMB ?? 8192).toLocaleString()} MB`} />
                <div className="node-stat mt-8">
                  <span>CPU Util</span>
                  <strong>0.0% (idle)</strong>
                </div>
                <ProgressBar value={0} color={NODE_COLORS[i % NODE_COLORS.length]} />
                <div className="node-stat mt-8">
                  <span>Mem Used</span>
                  <strong>0 MB</strong>
                </div>
                <ProgressBar value={0} color={NODE_COLORS[i % NODE_COLORS.length]} />
                <div className="text-xs text-muted mt-4">
                  0.0% of {(n.memMB ?? 8192).toLocaleString()} MB (pre-workload)
                </div>
              </div>
            ))}
          </div>

          {/* Distance matrix */}
          {distMatrix.length > 0 && (
            <>
              <div className="section-title">
                Distance Matrix — {topoType}
                <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 10 }}>
                  (synthetic simulation units, NOT ACPI-SLIT)
                </span>
              </div>
              <div className="card" style={{ marginBottom: 24, overflowX: 'auto' }}>
                <table className="dist-table">
                  <thead>
                    <tr>
                      <th>↓From\To→</th>
                      {distMatrix[0].map((_, j) => (
                        <th key={j} style={{ color: NODE_COLORS[j % NODE_COLORS.length] }}>N{j}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {distMatrix.map((row, i) => (
                      <tr key={i}>
                        <th style={{ color: NODE_COLORS[i % NODE_COLORS.length] }}>N{i}</th>
                        {row.map((d, j) => (
                          <td
                            key={j}
                            className={i === j ? 'dist-local' : d <= 20 ? 'dist-near' : 'dist-far'}
                            title={i === j ? 'Local (same node)' : `Distance N${i}→N${j}`}
                          >
                            {d}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10 }}>
                  <span style={{ color: '#059669', fontWeight: 700 }}>■</span> Local (10) &nbsp;
                  <span style={{ color: '#0d9488', fontWeight: 700 }}>■</span> Near (≤20) &nbsp;
                  <span style={{ color: '#dc2626', fontWeight: 700 }}>■</span> Far (&gt;20)
                </p>
              </div>
            </>
          )}

          {/* Topology explanation */}
          <div className="card" style={{ background: 'var(--bg-main)', border: '1px solid var(--border)' }}>
            <div className="card-title" style={{ marginBottom: 8 }}>Topology Explanation</div>
            {topoType === 'Symmetric' ? (
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                <strong>Symmetric ring topology</strong> — all {nodes.length} nodes have equal resources.
                Distance formula: <code>distance(i,j) = 10 + 10 × min(|i−j|, N−|i−j|)</code>.
                Local access (same node) costs 10 simulation units; each additional ring hop adds 10.
                These are synthetic values for simulation, not real ACPI-SLIT measurements.
              </p>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                <strong>Asymmetric topology</strong> — nodes have different CPU and memory capacities.
                The distance matrix is user-configured or auto-generated with seeded perturbation (±20% from ring base).
                Asymmetric distances model unequal memory bus bandwidth or multi-socket NUMA architectures.
                These are synthetic values for simulation, not real ACPI-SLIT measurements.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
