import React from 'react';
import { Icon } from '../core/Icon.jsx';
export function PlanCard({ term, price = '— RON', note, features = [], selected, badge, onSelect }) {
  return <button onClick={onSelect} aria-pressed={!!selected} style={{ position:'relative', textAlign:'left', font:'inherit', color:'var(--text-body)', background:'var(--surface-card)', border: selected ? '2px solid var(--border-selected)' : '1px solid var(--border-subtle)', padding: selected ? 24 : 25, borderRadius:'var(--radius-card)', cursor:'pointer', display:'grid', gap:6, minWidth:0, transition:'border-color var(--dur-fast)' }}>
    {badge && <span style={{ position:'absolute', top:-11, left:22, background:'var(--marigold-300)', color:'var(--pine-900)', fontSize:'.7rem', fontWeight:750, padding:'3px 9px', borderRadius:'var(--radius-pill)' }}>{badge}</span>}
    <span style={{ fontWeight:650, fontSize:'.95rem', color:'var(--text-strong)' }}>{term}</span>
    <span style={{ fontFamily:'var(--font-display)', fontSize:'2rem', fontWeight:700, letterSpacing:'var(--tracking-stat)', color:'var(--text-strong)', margin:'10px 0 0' }}>{price}</span>
    {note && <span style={{ fontSize:'.78rem', color:'var(--text-muted)' }}>{note}</span>}
    {features.length > 0 && <ul style={{ listStyle:'none', padding:0, margin:'14px 0 0', display:'grid', gap:8 }}>{features.map((f, i) => <li key={i} style={{ display:'flex', gap:8, fontSize:'.83rem', alignItems:'flex-start' }}><Icon name="check" size={16} color="var(--text-accent)" style={{ marginTop:2 }} />{f}</li>)}</ul>}
  </button>;
}
