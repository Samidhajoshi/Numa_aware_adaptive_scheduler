import { useState } from 'react'
import { Server, RefreshCw } from 'lucide-react'
import { LoadingState, EmptyState, RawOutput, ProgressBar, StatRow } from '../shared.jsx'

export default function NodesPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/nodes')
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      setData(json)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const nodeColors = [
    'var(--accent-1)', 'var(--accent-3)', 'var(--accent-4)', 'var(--accent-5)'
  ]

  return (
    <div>
      {/* Page hero */}
      <div className="page-hero">
        <div>
          <h2>NUMA Nodes</h2>
          <p>Hardware topology: 4 nodes, 4 CPUs each, 8 192 MB per node</p>
        </div>
        <button className="btn btn-primary" onClick={load} disabled={loading}>
          <RefreshCw size={16} />
          {loading ? 'Loading…' : 'Load Nodes'}
        </button>
      </div>

      {/* Stats strip */}
      {!data && !loading && (
        <EmptyState
          icon={<Server />}
          title="No data yet"
          desc="Click 'Load Nodes' to query the C++ simulator"
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
              <div className="card-value">{data.nodes.length}</div>
              <div className="card-sub">Ring topology</div>
            </div>
            <div className="card">
              <div className="card-title">CPUs per Node</div>
              <div className="card-value">{data.nodes[0]?.cpus ?? 4}</div>
              <div className="card-sub">cores</div>
            </div>
            <div className="card">
              <div className="card-title">Total Memory</div>
              <div className="card-value">
                {data.nodes.reduce((s, n) => s + n.memTotalMB, 0).toLocaleString()}
              </div>
              <div className="card-sub">MB across all nodes</div>
            </div>
            <div className="card">
              <div className="card-title">Local Distance</div>
              <div className="card-value">10</div>
              <div className="card-sub">+10 per ring hop</div>
            </div>
          </div>

          {/* Node cards */}
          <div className="section-title">Node Details</div>
          <div className="grid-4" style={{ marginBottom: 24 }}>
            {data.nodes.map((n, i) => (
              <div key={n.id} className="node-card">
                <div className="node-id" style={{ color: nodeColors[i % nodeColors.length] }}>
                  N{n.id}
                </div>
                <StatRow label="CPUs" value={n.cpus} />
                <div className="node-stat">
                  <span>CPU Load</span>
                  <strong>{n.cpuLoad.toFixed(1)}%</strong>
                </div>
                <ProgressBar
                  value={n.cpuLoad}
                  color={nodeColors[i % nodeColors.length]}
                />
                <div className="node-stat mt-8">
                  <span>Mem Used</span>
                  <strong>{n.memUsedMB.toLocaleString()} MB</strong>
                </div>
                <ProgressBar
                  value={n.memUtil}
                  color={nodeColors[i % nodeColors.length]}
                />
                <div className="text-xs text-muted mt-4">
                  {n.memUtil.toFixed(1)}% of {n.memTotalMB.toLocaleString()} MB
                </div>
              </div>
            ))}
          </div>

          {/* Distance matrix */}
          {data.distMatrix.length > 0 && (
            <>
              <div className="section-title">Distance Matrix (ACPI-SLIT)</div>
              <div className="card">
                <table className="dist-table">
                  <thead>
                    <tr>
                      <th>From \ To</th>
                      {data.distMatrix[0].map((_, j) => (
                        <th key={j}>N{j}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.distMatrix.map((row, i) => (
                      <tr key={i}>
                        <th>N{i}</th>
                        {row.map((d, j) => (
                          <td
                            key={j}
                            className={
                              i === j ? 'dist-local'
                              : d <= 20  ? 'dist-near'
                              : 'dist-far'
                            }
                          >
                            {d}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <RawOutput text={data.raw} />
        </>
      )}
    </div>
  )
}
