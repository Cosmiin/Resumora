import React from 'react';
import { Icon } from '../core/Icon.jsx';
export function TaskCard({ icon = 'briefcase', title, children, meta, onClick, emphasis }) {
  return <button onClick={onClick} style={{ display:'flex', gap:14, alignItems:'flex-start', width:'100%', padding:19, textAlign:'left', font:'inherit', color:'var(--text-body)', background: emphasis ? 'var(--surface-hero)' : 'var(--surface-card)', border:'1px solid ' + (emphasis ? '#d6e4d9' : 'var(--border-subtle)'), borderRadius:'var(--radius-card)', cursor:'pointer', transition:'border-color var(--dur-fast), transform var(--dur-fast) var(--ease-out)' }}
    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-strong)'} onMouseLeave={e => e.currentTarget.style.borderColor = emphasis ? '#d6e4d9' : 'var(--border-subtle)'}>
    <span style={{ width:40, height:40, borderRadius:12, background: emphasis ? 'var(--action-primary)' : 'var(--surface-hero)', color: emphasis ? 'var(--text-on-primary)' : 'var(--text-accent)', display:'grid', placeItems:'center', flexShrink:0 }}><Icon name={icon} size={20} /></span>
    <span style={{ flex:1, minWidth:0 }}><b style={{ display:'block', fontSize:'.95rem', fontWeight:650, color:'var(--text-strong)' }}>{title}</b>{children && <span style={{ display:'block', fontSize:'.82rem', color:'var(--text-muted)', marginTop:4, lineHeight:1.5 }}>{children}</span>}{meta && <span style={{ display:'flex', gap:6, marginTop:10, flexWrap:'wrap' }}>{meta}</span>}</span>
    <span style={{ color:'var(--text-muted)', alignSelf:'center' }}><Icon name="chevron-right" size={18} /></span>
  </button>;
}
