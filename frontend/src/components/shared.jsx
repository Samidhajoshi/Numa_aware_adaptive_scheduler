/** Shared helper utilities */

export const ALGO_CLASS = {
  'Random':              'algo-random',
  'Local-First':         'algo-local',
  'Load-Aware':          'algo-load',
  'Adaptive NUMA-Aware': 'algo-adaptive',
}

export function algoChip(name, extra = '') {
  const cls = ALGO_CLASS[name] || 'algo-random'
  return <span className={`algo-chip ${cls} ${extra}`}>{name}</span>
}

export function pct(v) { return `${v.toFixed(1)}%` }
export function num(v) { return v.toLocaleString() }

export function ProgressBar({ value, max = 100, color = 'var(--accent-1)' }) {
  const pct = Math.min(100, (value / max) * 100)
  return (
    <div className="progress-wrap">
      <div
        className="progress-fill"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  )
}

export function StatRow({ label, value, children }) {
  return (
    <div className="node-stat">
      <span>{label}</span>
      <strong>{value ?? children}</strong>
    </div>
  )
}

export function LoadingState({ text = 'Running simulator…' }) {
  return (
    <div className="loading-state">
      <div className="spinner" />
      <p>{text}</p>
    </div>
  )
}

export function EmptyState({ title, desc, icon }) {
  return (
    <div className="empty-state">
      {icon && <div style={{ fontSize: 48, marginBottom: 12 }}>{icon}</div>}
      <h3>{title}</h3>
      <p>{desc}</p>
    </div>
  )
}

export function RawOutput({ text }) {
  const [show, setShow] = React.useState(false)
  return (
    <div className="mt-16">
      <button className="btn btn-secondary btn-sm" onClick={() => setShow(s => !s)}>
        {show ? 'Hide' : 'Show'} raw output
      </button>
      {show && <div className="raw-output">{text}</div>}
    </div>
  )
}

import React from 'react'
