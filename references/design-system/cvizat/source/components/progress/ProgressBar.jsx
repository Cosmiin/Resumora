import React from 'react';
export function ProgressBar({ value = 0, max = 100, label, valueLabel, tone = 'primary', height = 7 }) {
  const pct = Math.max(0, Math.min(100, value / max * 100));
  const fill = { primary:'var(--action-primary)', warn:'var(--marigold-500)', muted:'var(--sage-400)' }[tone];
  return <div style={{ minWidth:0 }}>
    {(label || valueLabel) && <div style={{ display:'flex', justifyContent:'space-between', gap:12, fontSize:'.79rem', marginBottom:8, color:'var(--text-body)' }}><span>{label}</span><span style={{ fontWeight:650 }}>{valueLabel}</span></div>}
    <div role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} style={{ height, background:'var(--sage-150)', borderRadius:height, overflow:'hidden' }}><i style={{ display:'block', height:'100%', width:pct + '%', background:fill, borderRadius:height, transition:'width var(--dur-slow) var(--ease-out)' }} /></div>
  </div>;
}
