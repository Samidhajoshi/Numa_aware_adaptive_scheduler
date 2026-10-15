import { useState } from 'react'
import { Clock, RefreshCw } from 'lucide-react'
import { LoadingState, EmptyState, RawOutput, ALGO_CLASS } from '../shared.jsx'

export default function HistoryPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/history')
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      setData(json)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const rows = data?.rows ?? []

  // group by workload id for summary cards
  const byWorkload = rows.reduce((acc, r) => {
    const wid = r.workloadId
    if (!acc[wid]) acc[wid] = []
    acc[wid].push(r)
    return acc
  }, {})

  const wids = Object.keys(byWorkload).sort((a, b) => Number(b) - Number(a))

  return (
    <div>
      <div className="page-hero">
        <div>
          <h2>Stored Results</h2>
          <p>All previous simulator runs saved in SQLite</p>
        </div>
        <button className="btn btn-primary" onClick={load} disabled={loading}>
          <RefreshCw size={16} />
          {loading ? 'Loading…' : 'Load History'}
        </button>
      </div>

      {!data && !loading && (
        <EmptyState icon={<Clock />} title="No history loaded" desc="Click 'Load History' to fetch stored SQLite results" />
      )}
      {loading && <LoadingState text="Fetching stored results…" />}
      {error   && <p style={{ color: 'var(--accent-1)' }}>Error: {error}</p>}

      {data && rows.length === 0 && (
        <EmptyState
          icon="📭"
          title="No results stored yet"
          desc="Run option 3 (Run Algorithms) first to generate records"
        />
      )}

      {data && rows.length > 0 && (
        <>
          {/* Summary stat strip */}
          <div className="grid-4" style={{ marginBottom: 24 }}>
            <div className="card card-gradient">
              <div className="card-title">Total Runs</div>
              <div className="card-value">{rows.length}</div>
              <div className="card-sub">stored in SQLite</div>
            </div>
            <div className="card">
              <div className="card-title">Workloads</div>
              <div className="card-value">{wids.length}</div>
              <div className="card-sub">unique workloads</div>
            </div>
            <div className="card">
              <div className="card-title">Latest Run</div>
              <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4 }}>
                {rows[rows.length - 1]?.runAt}
              </div>
            </div>
            <div className="card">
              <div className="card-title">Best Ever Cost</div>
              <div className="card-value">
                {Math.min(...rows.map(r => r.cost)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
              <div className="card-sub">
                by {rows.reduce((b, r) => r.cost < b.cost ? r : b, rows[0]).algorithm}
              </div>
            </div>
          </div>

          {/* Grouped by workload */}
          {wids.map(wid => {
            const wRows = byWorkload[wid]
            const bestRow = wRows.reduce((b, r) => r.cost < b.cost ? r : b, wRows[0])
            return (
              <div key={wid} style={{ marginBottom: 24 }}>
                <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span>Workload #{wid}</span>
                  <span className="badge badge-blue">{wRows.length} runs</span>
                  <span className="text-sm text-muted">Best: {bestRow.algorithm}</span>
                </div>
                <div className="card" style={{ overflowX: 'auto' }}>
                  <table className="hist-table">
                    <thead>
                      <tr>
                        <th>Run ID</th>
                        <th>Algorithm</th>
                        <th>Total Acc.</th>
                        <th>Local</th>
                        <th>Remote</th>
                        <th>Remote %</th>
                        <th>CPU %</th>
                        <th>Mem %</th>
                        <th>Cost</th>
                        <th>Run At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {wRows.map(r => {
                        const cls = ALGO_CLASS[r.algorithm] || 'algo-random'
                        const isBest = r.runId === bestRow.runId
                        return (
                          <tr key={r.runId}>
                            <td>#{r.runId}</td>
                            <td><span className={`algo-chip ${cls}`}>{r.algorithm}</span></td>
                            <td>{r.totalAccesses.toLocaleString()}</td>
                            <td style={{ color: 'var(--accent-5)' }}>{r.localAccesses.toLocaleString()}</td>
                            <td style={{ color: 'var(--accent-1)' }}>{r.remoteAccesses.toLocaleString()}</td>
                            <td>{r.remotePct.toFixed(2)}%</td>
                            <td>{r.cpuUtil.toFixed(1)}%</td>
                            <td>{r.memUtil.toFixed(1)}%</td>
                            <td>
                              <strong>{r.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>
                              {isBest && <span className="badge badge-green" style={{ marginLeft: 6 }}>Best</span>}
                            </td>
                            <td className="text-muted">{r.runAt}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}

          <RawOutput text={data.raw} />
        </>
      )}
    </div>
  )
}
