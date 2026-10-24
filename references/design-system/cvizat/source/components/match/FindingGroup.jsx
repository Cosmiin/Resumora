import React from 'react';
import { Icon } from '../core/Icon.jsx';
const TONE = { good:['var(--status-good-bg)','var(--status-good-fg)'], info:['var(--status-info-bg)','var(--status-info-fg)'], warn:['var(--status-warn-bg)','var(--status-warn-fg)'], neutral:['var(--status-neutral-bg)','var(--status-neutral-fg)'] };
export function FindingGroup({ tone = 'good', icon = 'check', title, count, subtitle, children, defaultOpen = true }) {
  const [open, setOpen] = React.useState(defaultOpen);
  const [bg, fg] = TONE[tone] || TONE.good;
  return <section style={{ background:'var(--surface-card)', border:'1px solid var(--border-subtle)', borderRadius:'var(--radius-card)', overflow:'hidden' }}>
    <button onClick={() => setOpen(!open)} aria-expanded={open} style={{ width:'100%', display:'flex', alignItems:'center', gap:14, padding:'18px 22px', background:'transparent', border:0, cursor:'pointer', textAlign:'left', font:'inherit', color:'inherit' }}>
      <span style={{ width:36, height:36, borderRadius:11, background:bg, color:fg, display:'grid', placeItems:'center', flexShrink:0 }}><Icon name={icon} size={18} /></span>
      <span style={{ flex:1, minWidth:0 }}><span style={{ display:'flex', gap:8, alignItems:'baseline' }}><b style={{ fontFamily:'var(--font-display)', fontWeight:650, fontSize:'1.05rem', color:'var(--text-strong)' }}>{title}</b>{count != null && <span style={{ fontSize:'.8rem', color:'var(--text-muted)', fontWeight:600 }}>{count}</span>}</span>{subtitle && <span style={{ display:'block', fontSize:'.8rem', color:'var(--text-muted)', marginTop:2 }}>{subtitle}</span>}</span>
      <span style={{ color:'var(--text-muted)', transform: open ? 'rotate(180deg)' : 'none', transition:'transform var(--dur-base) var(--ease-out)' }}><Icon name="chevron-down" size={18} /></span>
    </button>
    {open && <div style={{ padding:'0 22px 6px', borderTop:'1px solid var(--border-subtle)' }}>{children}</div>}
  </section>;
}
