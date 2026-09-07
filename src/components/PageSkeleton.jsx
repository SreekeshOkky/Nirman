import React from 'react'

function SkeletonRow({ right }) { return <div className="sk-row"><div className="sk sk-circle" /><div className="sk-lines"><div className="sk sk-line wide" /><div className="sk sk-line short" /></div>{right && <div className="sk sk-line right" />}</div> }

function MetricCard() { return <div className="sk sk-metric"><div className="sk sk-label" /><div className="sk sk-value" /><div className="sk sk-foot" /></div> }

function ListCard({ rows = 5 }) { return <div className="sk-card"><div className="sk sk-head-line" />{Array.from({ length: rows }).map((_, i) => <SkeletonRow key={i} right />)}</div> }

export default function PageSkeleton({ pathname }) {
  const variant = pathname === '/' ? 'dashboard' : pathname === '/notes' ? 'notes' : pathname === '/ledger' ? 'ledger' : 'list'
  return <div className="page-skeleton">
    <div className="sk-title-block"><div className="sk sk-title" /><div className="sk sk-subtitle" /></div>
    {variant === 'dashboard' && <><div className="sk-metrics">{Array.from({ length: 4 }).map((_, i) => <MetricCard key={i} />)}</div><ListCard rows={4} /></>}
    {variant === 'notes' && <div className="sk-split"><div className="sk-card sk-form"><div className="sk sk-head-line" /><div className="sk sk-textarea" /><div className="sk sk-button" /></div><ListCard rows={4} /></div>}
    {variant === 'ledger' && <><div className="sk-toolbar"><div className="sk sk-input" /><div className="sk sk-select" /></div><ListCard rows={6} /></>}
    {variant === 'list' && <ListCard rows={5} />}
  </div>
}