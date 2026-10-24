import React from 'react';
export function TopBar({ title, back, right, children }) {
  return <header style={{ display:'flex', alignItems:'center', gap:16, justifyContent:'space-between', padding:'14px 28px', background:'var(--surface-card)', borderBottom:'1px solid var(--border-subtle)', minHeight:64 }}>
    <div style={{ display:'flex', alignItems:'center', gap:12, minWidth:0 }}>{back}{title && <span style={{ fontWeight:650, fontSize:'.95rem', color:'var(--text-strong)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{title}</span>}</div>
    {children && <div style={{ flex:1, display:'flex', justifyContent:'center', minWidth:0 }}>{children}</div>}
    <div style={{ display:'flex', alignItems:'center', gap:10 }}>{right}</div>
  </header>;
}
