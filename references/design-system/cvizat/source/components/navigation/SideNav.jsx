import React from 'react';
import { Icon } from '../core/Icon.jsx';
import { Logo } from '../core/Logo.jsx';
export function SideNav({ items = [], value, onChange, footer }) {
  return <nav style={{ width:'var(--sidebar-width)', flexShrink:0, background:'var(--surface-card)', borderRight:'1px solid var(--border-subtle)', padding:'22px 14px', display:'flex', flexDirection:'column', gap:4, minHeight:'100%' }}>
    <div style={{ padding:'4px 12px 22px' }}><Logo size={28} /></div>
    {items.map(it => { const on = it.value === value;
      return <button key={it.value} onClick={() => onChange && onChange(it.value)} aria-current={on ? 'page' : undefined} style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 12px', border:0, borderRadius:'var(--radius-md)', background: on ? 'var(--surface-selected)' : 'transparent', color: on ? 'var(--text-accent)' : 'var(--text-muted)', fontWeight: on ? 700 : 500, fontSize:'.88rem', textAlign:'left', cursor:'pointer', fontFamily:'var(--font-sans)' }}
        onMouseEnter={e => { if (!on) e.currentTarget.style.background = 'var(--surface-hover)'; }} onMouseLeave={e => { if (!on) e.currentTarget.style.background = 'transparent'; }}>
        <Icon name={it.icon} size={18} /><span style={{ flex:1 }}>{it.label}</span>{it.badge && <span style={{ fontSize:'.7rem', fontWeight:700, background:'var(--marigold-300)', color:'var(--pine-900)', borderRadius:'var(--radius-pill)', padding:'1px 7px' }}>{it.badge}</span>}
      </button>; })}
    <div style={{ flex:1 }} />{footer}
  </nav>;
}
