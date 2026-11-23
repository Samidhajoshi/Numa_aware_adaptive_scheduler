import { useState } from 'react'
import { Play, Check, X } from 'lucide-react'
import { LoadingState, EmptyState } from '../shared.jsx'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, ResponsiveContainer, Legend, Cell,
  LineChart, Line, ReferenceLine,
} from 'recharts'

// Categorical palette for the four algorithms.  Validated for colour-vision
// deficiency separation and contrast against the white card surface; green is
// deliberately absent so it stays reserved for the "paid off" status.
const ALGO_COLORS = ['#2563eb', '#ea580c', '#9333ea', '#a16207']

// Status colours.  These two are NOT separable under deuteranopia, so every
// place they appear also carries an icon and a word — never colour alone.
const GOOD = '#15803d'
const BAD  = '#b91c1c'

const GRID = 'var(--border)'
const INK  = 'var(--text-muted)'

const fmt  = (n) => Math.round(n).toLocaleString()
const sign = (n) => `${n >= 0 ? '+' : '−'}${fmt(Math.abs(n))}`

function Verdict({ paidOff, small }) {
  const Icon = paidOff ? Check : X
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: small ? '1px 7px' : '3px 10px', borderRadius: 20,
      background: paidOff ? 'rgba(21,128,61,0.10)' : 'rgba(185,28,28,0.10)',
      color: paidOff ? GOOD : BAD,
      fontSize: small ? 10 : 11, fontWeight: 800,
      letterSpacing: 0.3, textTransform: 'uppercase', whiteSpace: 'nowrap',
    }}>
      <Icon size={small ? 11 : 13} strokeWidth={3} />
      {paidOff ? 'paid off' : 'cost more'}
    </span>
  )
}

// ── Headline: did migration pay for itself, and by how much ──────────────────
function VerdictCard({ v, color }) {
  const best = v.recency && v.naive
    ? (v.recency.net >= v.naive.net ? v.recency : v.naive)
    : (v.recency ?? v.naive)
  if (!best) return null
  const bestName = best === v.recency ? 'recency' : 'naive'

  return (
    <div className="card" style={{ borderTop: `3px solid ${color}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontWeight: 800, fontSize: 13, color }}>{v.algorithm}</span>
        <Verdict paidOff={best.paidOff} />
      </div>

      <div style={{ fontSize: 26, fontWeight: 900, color: best.paidOff ? GOOD : BAD, lineHeight: 1.1 }}>
        {sign(best.net)}
      </div>
      <div style={{ fontSize: 11, color: INK, marginTop: 2 }}>
        cost units {best.paidOff ? 'saved' : 'wasted'} · {Math.abs(best.pctOfBaseline).toFixed(1)}% of baseline
        <br />best policy: <strong>{bestName}</strong>
      </div>

      {/* The arithmetic, so the verdict is checkable rather than asserted. */}
      <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid var(--border)`, fontSize: 12 }}>
        {[
          ['Cost without migration', fmt(v.baselineCost)],
          ['Access cost with migration', fmt(best.placementCost)],
          ['Migration cost paid', `+ ${fmt(best.migrationCost)}`],
          ['Total with migration', fmt(best.totalCost)],
        ].map(([k, val], i, arr) => (
          <div key={k} style={{
            display: 'flex', justifyContent: 'space-between', padding: '3px 0',
            fontWeight: i === arr.length - 1 ? 700 : 400,
            color: i === arr.length - 1 ? 'var(--text-primary)' : 'var(--text-secondary)',
            borderTop: i === arr.length - 1 ? `1px solid var(--border)` : 'none',
            marginTop: i === arr.length - 1 ? 4 : 0,
            paddingTop: i === arr.length - 1 ? 6 : 3,
          }}>
            <span>{k}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{val}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 10, fontSize: 11, color: INK }}>
        Locality {(v.baselineLocalRatio * 100).toFixed(1)}% → {(best.localRatio * 100).toFixed(1)}% ·{' '}
        {best.migrationsCompleted} pages moved · {best.evalCount} evaluations
      </div>
    </div>
  )
}

// ── Policy comparison: two series, so legend + direct labels ─────────────────
function PolicyChart({ verdicts }) {
  const data = verdicts.map(v => ({
    name:    v.algorithm.replace(' NUMA-Aware', ''),
    naive:   Math.round(v.naive?.net ?? 0),
    recency: Math.round(v.recency?.net ?? 0),
  }))
  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div className="card-title" style={{ marginBottom: 4 }}>Net benefit by migration policy</div>
      <p style={{ fontSize: 12, color: INK, margin: '0 0 14px' }}>
        Cost without migration minus cost with it, migration cost included.
        Above the line, migration paid for itself; below it, it cost more than it saved.
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 0 }} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 12, fill: INK }} tickLine={false} axisLine={{ stroke: GRID }} />
          <YAxis tick={{ fontSize: 11, fill: INK }} tickLine={false} axisLine={false}
                 tickFormatter={v => v.toLocaleString()} />
          <RTooltip
            cursor={{ fill: 'rgba(0,0,0,0.04)' }}
            formatter={(val, key) => [`${sign(val)} cost units`, key === 'naive' ? 'Naive policy' : 'Recency policy']}
          />
          <Legend formatter={v => v === 'naive' ? 'Naive policy' : 'Recency policy'}
                  wrapperStyle={{ fontSize: 12 }} />
          <ReferenceLine y={0} stroke="var(--text-secondary)" strokeWidth={1.5} />
          <Bar dataKey="naive"   fill={ALGO_COLORS[0]} radius={[4, 4, 0, 0]} />
          <Bar dataKey="recency" fill={ALGO_COLORS[1]} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Adaptive timeline: three stacked panels sharing the step axis ────────────
// Remote ratio, evaluation interval and pages moved have different units, so
// they get their own panels rather than a second y-axis.
function AdaptiveTimeline({ run, algoName, policyLabel }) {
  const algo  = (run?.algorithms ?? []).find(a => a.algorithm === algoName)
  const trace = algo?.evalTrace ?? []
  if (trace.length === 0) {
    return <p style={{ fontSize: 12, color: INK }}>No evaluations recorded for this run.</p>
  }
  const data = trace.map(e => ({
    step: e.step,
    remotePct: +(e.remoteRatio * 100).toFixed(2),
    interval: e.intervalAfter,
    moved: e.pagesMigrated,
  }))

  const panels = [
    { key: 'remotePct', label: 'Remote access ratio (%)', color: ALGO_COLORS[0], kind: 'line',
      help: 'What the policy reacts to. Spikes mark the access pattern moving.' },
    { key: 'interval',  label: 'Evaluation interval (steps)', color: ALGO_COLORS[2], kind: 'line',
      help: 'The adaptive part: the interval shrinks when the remote ratio is high and grows when things are calm.' },
    { key: 'moved',     label: 'Pages migrated per evaluation', color: ALGO_COLORS[1], kind: 'bar',
      help: 'What it actually did at each decision point.' },
  ]

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div className="card-title" style={{ marginBottom: 4 }}>
        When the system decided to migrate — {algoName}
        <span style={{ fontWeight: 400, color: INK, marginLeft: 8, fontSize: 12 }}>
          ({policyLabel} policy)
        </span>
      </div>
      <p style={{ fontSize: 12, color: INK, margin: '0 0 8px' }}>
        One point per evaluation, on a shared step axis.
      </p>
      {panels.map((p, i) => (
        <div key={p.key} style={{ marginTop: i ? 14 : 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>{p.label}</div>
          <div style={{ fontSize: 11, color: INK, marginBottom: 2 }}>{p.help}</div>
          <ResponsiveContainer width="100%" height={110}>
            {p.kind === 'line' ? (
              <LineChart data={data} margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="step" tick={{ fontSize: 10, fill: INK }} tickLine={false}
                       axisLine={{ stroke: GRID }} hide={i < panels.length - 1} />
                <YAxis tick={{ fontSize: 10, fill: INK }} tickLine={false} axisLine={false} width={44} />
                <RTooltip labelFormatter={s => `step ${s.toLocaleString()}`}
                          formatter={v => [v, p.label]} />
                <Line type="monotone" dataKey={p.key} stroke={p.color} strokeWidth={2}
                      dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            ) : (
              <BarChart data={data} margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="step" tick={{ fontSize: 10, fill: INK }} tickLine={false}
                       axisLine={{ stroke: GRID }} />
                <YAxis tick={{ fontSize: 10, fill: INK }} tickLine={false} axisLine={false} width={44} />
                <RTooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                          labelFormatter={s => `step ${s.toLocaleString()}`}
                          formatter={v => [v, p.label]} />
                <Bar dataKey={p.key} fill={p.color} radius={[2, 2, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      ))}
    </div>
  )
}

// ── Calibration: did the policy's prediction match reality? ──────────────────
function Calibration({ verdicts, policy }) {
  const data = verdicts.map(v => {
    const r = v[policy]
    return {
      name: v.algorithm.replace(' NUMA-Aware', ''),
      predicted: Math.round(r?.predicted ?? 0),
      realized:  Math.round(r?.realized ?? 0),
      ratio: r && r.realized > 0 ? r.predicted / r.realized : 0,
    }
  })
  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div className="card-title" style={{ marginBottom: 4 }}>
        Predicted vs actual saving — {policy} policy
      </div>
      <p style={{ fontSize: 12, color: INK, margin: '0 0 14px' }}>
        What the policy expected each migration to save, against what the replay
        measured it actually saved. A tall gap means the policy is deciding on
        bad estimates — it is moving pages it should not.
      </p>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 0 }} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 12, fill: INK }} tickLine={false} axisLine={{ stroke: GRID }} />
          <YAxis tick={{ fontSize: 11, fill: INK }} tickLine={false} axisLine={false}
                 tickFormatter={v => v.toLocaleString()} />
          <RTooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                    formatter={(val, k) => [fmt(val), k === 'predicted' ? 'Predicted saving' : 'Actual saving']} />
          <Legend formatter={v => v === 'predicted' ? 'Predicted saving' : 'Actual saving'}
                  wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="predicted" fill={ALGO_COLORS[3]} radius={[4, 4, 0, 0]} />
          <Bar dataKey="realized"  fill={ALGO_COLORS[0]} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 10, fontSize: 12 }}>
        {data.map(d => (
          <span key={d.name} style={{ color: 'var(--text-secondary)' }}>
            {d.name}: <strong style={{ color: d.ratio > 1.5 ? BAD : 'var(--text-primary)' }}>
              {d.ratio.toFixed(1)}×
            </strong> over-predicted
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Per-page outcomes, worst first ───────────────────────────────────────────
function PageTable({ run, algoName }) {
  const algo = (run?.algorithms ?? []).find(a => a.algorithm === algoName)
  const rows = (algo?.pageVerdicts ?? []).slice(0, 15)
  if (rows.length === 0) return null
  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div className="card-title" style={{ marginBottom: 4 }}>
        Worst individual migrations — {algoName}
      </div>
      <p style={{ fontSize: 12, color: INK, margin: '0 0 12px' }}>
        {algo.pageVerdictCount?.toLocaleString()} pages were moved; the 15 that
        went worst are shown. A page that moves repeatedly is being chased back
        and forth by a changing access pattern.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table className="algo-table">
          <thead>
            <tr>
              <th>Page</th><th>Moves</th><th>Last move</th>
              <th>Migration cost</th><th>Actual saving</th><th>Net</th><th>Outcome</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const net = r.net
              return (
                <tr key={r.pageId}>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>#{r.pageId}</td>
                  <td style={{ fontWeight: r.moves > 1 ? 700 : 400 }}>{r.moves}</td>
                  <td style={{ color: INK }}>N{r.from} → N{r.to}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(r.migCost)}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(r.realizedSaving)}</td>
                  <td style={{
                    fontVariantNumeric: 'tabular-nums', fontWeight: 700,
                    color: net > 0 ? GOOD : BAD,
                  }}>{sign(net)}</td>
                  <td><Verdict paidOff={net > 0} small /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function MigrationPage({ simConfig }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [focusAlgo, setFocusAlgo] = useState('Adaptive NUMA-Aware')
  const [policy, setPolicy]       = useState('recency')

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

  const verdicts = data?.verdicts ?? []
  const phases   = data?.workload?.phases ?? []
  const shifts   = phases.filter(p => p.shift !== 0).length

  return (
    <div>
      <div className="page-hero">
        <div>
          <h2>Migration Study</h2>
          <p>
            Runs the same workload three ways — no migration, naive policy,
            recency policy — and scores whether moving pages was worth it.
          </p>
        </div>
        <button className="btn btn-primary" onClick={run} disabled={loading}>
          <Play size={16} />{loading ? 'Running 3 simulations…' : 'Run study'}
        </button>
      </div>

      {!data && !loading && (
        <EmptyState icon="🔬" title="Ready"
          desc="Runs the same workload with migration off and on, so the benefit is measured rather than assumed." />
      )}
      {loading && <LoadingState text="Running migration off, naive and recency…" />}
      {error && <p style={{ color: BAD }}>Error: {error}</p>}

      {data && (
        <>
          {/* What kind of workload this is — the thing that decides the answer */}
          <div style={{
            padding: '12px 16px', marginBottom: 24, borderRadius: 12,
            background: 'var(--bg-card)', border: `1px solid var(--border)`,
            borderLeft: `4px solid ${shifts > 0 ? ALGO_COLORS[1] : ALGO_COLORS[0]}`,
            fontSize: 13,
          }}>
            <strong>{phases.length || 1} phase{phases.length === 1 ? '' : 's'}</strong>
            {shifts > 0
              ? <> · <strong style={{ color: ALGO_COLORS[1] }}>{shifts} affinity shift{shifts === 1 ? '' : 's'}</strong>
                  {' '}— the best placement moves during the run, so migration has something to chase.</>
              : <> · <strong>no affinity shift</strong> — the access pattern is stationary, so a good
                  initial placement stays optimal and migration can only repair the starting layout.</>}
            <span style={{ color: INK }}>
              {' '}· {data.workload?.totalAccesses?.toLocaleString()} accesses
              {' '}· {data.workload?.numThreads} threads
            </span>
          </div>

          <div className="section-title">Was migration worth it?</div>
          <div className="grid-4" style={{ marginBottom: 24 }}>
            {verdicts.map((v, i) => (
              <VerdictCard key={v.algorithm} v={v} color={ALGO_COLORS[i % ALGO_COLORS.length]} />
            ))}
          </div>

          <PolicyChart verdicts={verdicts} />

          {/* Controls for the per-algorithm panels */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: INK }}>Inspect:</span>
            <select value={focusAlgo} onChange={e => setFocusAlgo(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid var(--border)`, fontSize: 13 }}>
              {verdicts.map(v => <option key={v.algorithm} value={v.algorithm}>{v.algorithm}</option>)}
            </select>
            <select value={policy} onChange={e => setPolicy(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid var(--border)`, fontSize: 13 }}>
              <option value="recency">Recency policy</option>
              <option value="naive">Naive policy</option>
            </select>
          </div>

          <AdaptiveTimeline run={data.runs?.[policy]} algoName={focusAlgo}
                            policyLabel={policy} />
          <Calibration verdicts={verdicts} policy={policy} />
          <PageTable run={data.runs?.[policy]} algoName={focusAlgo} />

          <p style={{ fontSize: 11, color: INK, marginBottom: 32 }}>
            All costs are simulated units, not real hardware latency. Migration cost =
            pageSizeMB × 2.0 × (distance / 10). Actual saving is measured during the
            replay against the counterfactual that the page never moved, so it is
            independent of what the policy predicted.
          </p>
        </>
      )}
    </div>
  )
}
