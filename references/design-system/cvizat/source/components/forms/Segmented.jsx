import React from 'react';
import { Icon } from '../core/Icon.jsx';
export function Segmented({ options = [], value, onChange, size = 'md', fullWidth }) {
  return <div role="tablist" style={{ display: fullWidth ? 'flex' : 'inline-flex', gap:4, padding:4, background:'var(--sage-100)', borderRadius:12, border:'1px solid var(--sage-150)' }}>
    {options.map(o => { const v = typeof o === 'string' ? o : o.value; const l = typeof o === 'string' ? o : o.label; const ic = typeof o === 'string' ? null : o.icon; const on = v === value;
      return <button key={v} role="tab" aria-selected={on} onClick={() => onChange && onChange(v)} style={{ flex: fullWidth ? 1 : undefined, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:7, border:0, borderRadius:9, padding: size === 'sm' ? '6px 12px' : '9px 16px', minHeight: size === 'sm' ? 32 : 40, font:'650 '+(size === 'sm' ? '.78rem' : '.86rem')+'/1.2 var(--font-sans)', cursor:'pointer', background: on ? 'var(--surface-card)' : 'transparent', color: on ? 'var(--text-strong)' : 'var(--sage-600)', boxShadow: on ? '0 1px 3px rgba(23,59,57,.12), 0 0 0 1px rgba(23,59,57,.05)' : 'none', transition:'background var(--dur-fast), color var(--dur-fast), box-shadow var(--dur-fast)', whiteSpace:'nowrap' }}>{ic && <Icon name={ic} size={16} color={on ? 'var(--pine-600)' : undefined} />}{l}</button>; })}
  </div>;
}
