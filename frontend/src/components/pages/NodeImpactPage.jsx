import { useState } from 'react'
import { Play, ArrowDown, ArrowUp, Minus } from 'lucide-react'
import { LoadingState, EmptyState } from '../shared.jsx'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell,
  Tooltip as RTooltip, ResponsiveContainer, ReferenceLine, LabelList,
} from 'recharts'

// Diverging pair: better / worse. Position relative to the zero line is the
// primary encoding — colour is redundant, which is what lets this pair be used
// even though the two are not separable under deuteranopia. Every figure also
// carries a sign and an arrow.
const BETTER = '#15803d'
const WORSE  = '#b91c1c'
const FLAT   = '#64748b'

const GRID = 'var(--border)'
const INK  = 'var(--text-muted)'

const n0 = (v) => Math.round(v).toLocaleString()
const pct1 = (v) => `${(v * 100).toFixed(1)}%`
const signed = (v, f = n0) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${f(Math.abs(v))}`

// Costs are displayed rounded, so anything that rounds to zero is reported as
// unchanged. Without this a delta of +0.4 shows as "+0" painted red.
const EPS = 0.5
const dir = (v, eps = EPS) => (Math.abs(v) < eps ? 0 : v < 0 ? -1 : 1)

function Delta({ value, goodWhenNegative = true, format = n0, suffix = '', eps = EPS }) {
  const d = dir(value, eps)
  const good = goodWhenNegative ? d < 0 : d > 0
  const color = d === 0 ? FLAT : good ? BETTER : WORSE
  const Icon  = d === 0 ? Minus : d < 0 ? ArrowDown : ArrowUp
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color, fontWeight: 700 }}>
      <Icon size={13} strokeWidth={3} />
      {d === 0 ? format(0) : signed(value, format)}{suffix}
    </span>
  )
}

// ── One node, before and after ───────────────────────────────────────────────
function NodeCard({ before, after }) {
  const locBefore = before.issuedAccesses ? before.issuedLocal / before.issuedAccesses : 0
  const locAfter  = after.issuedAccesses  ? after.issuedLocal  / after.issuedAccesses  : 0
  const locDelta  = locAfter - locBefore

  const costDelta   = after.issuedCost - before.issuedCost
  const remoteDelta = after.issuedRemote - before.issuedRemote
  const pageDelta   = after.pageCount - before.pageCount

  const costDir = dir(costDelta)
  // The locality bar is coloured by the LOCALITY change, not the cost change —
  // colouring a locality bar red because cost rose reads as "locality fell".
  const locDir  = dir(locDelta * 100, 0.05)

  return (
    <div className="card" style={{
      borderTop: `3px solid ${costDir === 0 ? FLAT : costDir < 0 ? BETTER : WORSE}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 17, fontWeight: 900 }}>Node {before.id}</span>
        <span style={{ fontSize: 11, color: INK }}>
          {before.threads} thread{before.threads === 1 ? '' : 's'}
        </span>
      </div>

      {/* Locality is the headline: what share of this node's own accesses
          stayed on this node. */}
      <div style={{ fontSize: 11, color: INK, marginBottom: 4 }}>
        Accesses that stayed local
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 15, color: 'var(--text-secondary)' }}>{pct1(locBefore)}</span>
        <span style={{ color: INK }}>→</span>
        <span style={{ fontSize: 24, fontWeight: 900 }}>{pct1(locAfter)}</span>
        <Delta value={locDelta * 100} goodWhenNegative={false} eps={0.05}
               format={(v) => v.toFixed(1)} suffix=" pts" />
      </div>

      {/* Paired bars, before above after, so the change is a length difference */}
      <div style={{ marginBottom: 14 }}>
        {[['before', locBefore, 'var(--text-muted)'],
          ['after',  locAfter,  locDir === 0 ? FLAT : locDir > 0 ? BETTER : WORSE]]
          .map(([label, val, col]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
              <span style={{ fontSize: 10, color: INK, width: 38 }}>{label}</span>
              <div style={{ flex: 1, height: 7, borderRadius: 99, background: 'var(--bg-main)' }}>
                <div style={{
                  width: `${Math.max(0, Math.min(100, val * 100))}%`,
                  height: '100%', borderRadius: 99, background: col,
                }} />
              </div>
            </div>
          ))}
      </div>

      <div style={{ borderTop: `1px solid var(--border)`, paddingTop: 10, fontSize: 12 }}>
        {[
          ['Cost paid by its threads', n0(before.issuedCost), n0(after.issuedCost),
            <Delta key="c" value={costDelta} />],
          ['Remote accesses', n0(before.issuedRemote), n0(after.issuedRemote),
            <Delta key="r" value={remoteDelta} />],
          ['Pages homed here', n0(before.pageCount), n0(after.pageCount),
            <Delta key="p" value={pageDelta} goodWhenNegative={false} />],
          ['Memory used', pct1(before.memUtil), pct1(after.memUtil), null],
        ].map(([label, b, a, delta]) => (
          <div key={label} style={{
            display: 'grid', gridTemplateColumns: '1fr auto', gap: 8,
            padding: '4px 0', alignItems: 'baseline',
          }}>
            <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
              <span style={{ color: INK }}>{b}</span>
              <span style={{ color: INK, margin: '0 4px' }}>→</span>
              <span style={{ fontWeight: 600 }}>{a}</span>
              {delta && <span style={{ marginLeft: 8 }}>{delta}</span>}
            </span>
          </div>
        ))}
      </div>

      {(after.incomingMig > 0 || after.outgoingMig > 0) && (
        <div style={{ marginTop: 10, fontSize: 11, color: INK }}>
          Migration moved <strong style={{ color: 'var(--text-primary)' }}>{after.incomingMig}</strong> pages
          in and <strong style={{ color: 'var(--text-primary)' }}>{after.outgoingMig}</strong> out.
        </div>
      )}
    </div>
  )
}

// ── Headline chart: how much cost each node shed ─────────────────────────────
function NodeDeltaChart({ rows }) {
  const data = rows.map(r => ({
    name: `Node ${r.before.id}`,
    delta: Math.round(r.after.issuedCost - r.before.issuedCost),
  }))
  const anyNegative = data.some(d => d.delta < 0)

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div className="card-title" style={{ marginBottom: 4 }}>Cost change per node</div>
      <p style={{ fontSize: 12, color: INK, margin: '0 0 14px' }}>
        Access cost paid by the threads on each node, after migration minus before.
        {anyNegative && ' Bars below the line are nodes migration made cheaper.'}
      </p>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 20, right: 20, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--text-secondary)' }}
                 tickLine={false} axisLine={false} interval={0} />
          <YAxis tick={{ fontSize: 11, fill: INK }} tickLine={false} axisLine={false}
                 tickFormatter={v => v.toLocaleString()} />
          <RTooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                    formatter={(v) => [
                      `${signed(v)} cost units`,
                      v < 0 ? 'Cheaper after migration' : v > 0 ? 'More expensive after migration' : 'No change',
                    ]} />
          <ReferenceLine y={0} stroke="var(--text-secondary)" strokeWidth={1.5} />
          <Bar dataKey="delta" radius={[3, 3, 3, 3]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.delta < 0 ? BETTER : d.delta > 0 ? WORSE : FLAT} />
            ))}
            <LabelList dataKey="delta" position="top"
                       formatter={(v) => signed(v)}
                       style={{ fontSize: 11, fill: 'var(--text-secondary)', fontWeight: 700 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function NodeImpactPage({ simConfig }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [algo, setAlgo]       = useState('Adaptive NUMA-Aware')
  const [policy, setPolicy]   = useState('recency')

  async function run() {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/migration-study', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(simConfig ?? {}),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || JSON.stringify(json.errors))
      setData(json)
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }

  const pick = (which) =>
    (data?.runs?.[which]?.algorithms ?? []).find(a => a.algorithm === algo)
  const beforeAlgo = pick('off')
  const afterAlgo  = pick(policy)

  const rows = (beforeAlgo?.nodes ?? []).map(b => ({
    before: b,
    after:  (afterAlgo?.nodes ?? []).find(a => a.id === b.id) ?? b,
  }))

  const improved  = rows.filter(r => dir(r.after.issuedCost - r.before.issuedCost) < 0).length
  const worsened  = rows.filter(r => dir(r.after.issuedCost - r.before.issuedCost) > 0).length
  const unchanged = rows.length - improved - worsened
  const totalBefore = rows.reduce((s, r) => s + r.before.issuedCost, 0)
  const totalAfter  = rows.reduce((s, r) => s + r.after.issuedCost, 0)
  const migCost     = afterAlgo?.migrationCostTotal ?? 0
  const netSaving   = totalBefore - totalAfter - migCost

  const algoNames = (data?.runs?.off?.algorithms ?? []).map(a => a.algorithm)

  return (
    <div>
      <div className="page-hero">
        <div>
          <h2>Node Impact</h2>
          <p>What migration changed for each NUMA node, measured against the same run with migration off.</p>
        </div>
        <button className="btn btn-primary" onClick={run} disabled={loading}>
          <Play size={16} />{loading ? 'Running…' : 'Run comparison'}
        </button>
      </div>

      {!data && !loading && (
        <EmptyState icon="🧭" title="Ready"
          desc="Runs the workload with migration off and on, then reports the difference node by node." />
      )}
      {loading && <LoadingState text="Running migration off and on…" />}
      {error && <p style={{ color: WORSE }}>Error: {error}</p>}

      {data && rows.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: INK }}>Algorithm:</span>
            <select value={algo} onChange={e => setAlgo(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid var(--border)`, fontSize: 13 }}>
              {algoNames.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <select value={policy} onChange={e => setPolicy(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid var(--border)`, fontSize: 13 }}>
              <option value="recency">Recency policy</option>
              <option value="naive">Naive policy</option>
            </select>
          </div>

          {/* Summary, in words first */}
          <div style={{
            padding: '14px 18px', marginBottom: 24, borderRadius: 12,
            background: 'var(--bg-card)', border: `1px solid var(--border)`,
            borderLeft: `4px solid ${netSaving > 0 ? BETTER : WORSE}`, fontSize: 14,
          }}>
            <strong>{improved} of {rows.length} nodes</strong> paid less for memory access after
            migration{worsened > 0 && <>, <strong>{worsened}</strong> paid more</>}
            {unchanged > 0 && <>, <strong>{unchanged}</strong> unchanged</>}.
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>
              Access cost across all nodes {n0(totalBefore)} → {n0(totalAfter)}
              {' '}({signed(totalAfter - totalBefore)}), migration cost {n0(migCost)} paid to get there
              {' '}— <strong style={{ color: netSaving > 0 ? BETTER : WORSE }}>
                net {n0(Math.abs(netSaving))} cost units {netSaving > 0 ? 'saved' : 'lost'}
              </strong>.
            </div>
          </div>

          <NodeDeltaChart rows={rows} />

          <div className="section-title">Node by node</div>
          <div className="grid-2" style={{ marginBottom: 24 }}>
            {rows.map(r => <NodeCard key={r.before.id} before={r.before} after={r.after} />)}
          </div>

          <p style={{ fontSize: 11, color: INK, marginBottom: 32 }}>
            "Before" is the identical workload and placement with migration disabled, so every
            difference shown is caused by migration alone. Costs are simulated units.
            A node can lose pages and still improve: what matters is whether the threads running
            there reach their data locally.
          </p>
        </>
      )}
    </div>
  )
}
