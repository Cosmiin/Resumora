import React from 'react';
import { Pill } from '../core/Pill.jsx';
import { Checkbox } from '../forms/Checkbox.jsx';
export function ChangeCard({ section, source, before, after, checked, onChange, why }) {
  return <div style={{ border: checked ? '2px solid var(--border-selected)' : '1px solid var(--border-subtle)', borderRadius:'var(--radius-card)', background:'var(--surface-card)', padding: checked ? 19 : 20, display:'grid', gap:14, transition:'border-color var(--dur-fast)' }}>
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap' }}>
      <Checkbox checked={checked} onChange={onChange} label={<b style={{ color:'var(--text-strong)' }}>{section}</b>} />
      {source && <Pill size="sm" tone="good" icon="shield-check">{source}</Pill>}
    </div>
    <div style={{ display:'grid', gridTemplateColumns: before ? 'minmax(0,1fr) minmax(0,1fr)' : '1fr', gap:10 }}>
      {before && <div style={{ background:'#f6f7f3', borderRadius:'var(--radius-md)', padding:'12px 14px', fontSize:'.84rem', lineHeight:1.55, color:'var(--text-muted)' }}><div style={{ fontSize:'.68rem', fontWeight:750, letterSpacing:'.1em', textTransform:'uppercase', marginBottom:6 }}>Now</div>{before}</div>}
      <div style={{ background:'#ecf5ee', border:'1px solid #b8d4c1', borderRadius:'var(--radius-md)', padding:'12px 14px', fontSize:'.84rem', lineHeight:1.55, color:'var(--text-body)' }}><div style={{ fontSize:'.68rem', fontWeight:750, letterSpacing:'.1em', textTransform:'uppercase', marginBottom:6, color:'var(--text-accent)' }}>{before ? 'Suggested' : 'Add'}</div>{after}</div>
    </div>
    {why && <div style={{ fontSize:'.78rem', color:'var(--text-muted)', lineHeight:1.5 }}>{why}</div>}
  </div>;
}
