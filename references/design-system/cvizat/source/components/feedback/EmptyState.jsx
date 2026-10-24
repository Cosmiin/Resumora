import React from 'react';
import { Icon } from '../core/Icon.jsx';
export function EmptyState({ icon = 'file-plus', title, children, actions }) {
  return <div style={{ textAlign:'center', padding:'46px 25px', display:'grid', justifyItems:'center', gap:14 }}>
    <span style={{ width:56, height:56, borderRadius:16, background:'var(--surface-hero)', color:'var(--text-accent)', display:'grid', placeItems:'center' }}><Icon name={icon} size={26} /></span>
    <h2 style={{ margin:0, font:'var(--type-section-title)', color:'var(--text-strong)' }}>{title}</h2>
    {children && <p style={{ margin:0, color:'var(--text-muted)', maxWidth:420, lineHeight:1.6, fontSize:'.9rem' }}>{children}</p>}
    {actions && <div style={{ display:'flex', gap:10, flexWrap:'wrap', justifyContent:'center', marginTop:4 }}>{actions}</div>}
  </div>;
}
