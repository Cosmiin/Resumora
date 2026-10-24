import React from 'react';
import { Icon } from '../core/Icon.jsx';
export function Toast({ children, icon = 'check', action, onAction, floating = true }) {
  return <div role="status" aria-live="polite" style={{ position: floating ? 'fixed' : 'relative', bottom: floating ? 22 : undefined, left: floating ? '50%' : undefined, transform: floating ? 'translateX(-50%)' : undefined, zIndex:50, display:'inline-flex', alignItems:'center', gap:10, background:'var(--surface-inverse)', color:'var(--text-on-inverse)', padding:'11px 14px 11px 16px', borderRadius:'var(--radius-md)', fontSize:'.85rem', boxShadow:'var(--shadow-toast)', maxWidth:'calc(100vw - 30px)' }}>
    {icon && <Icon name={icon} size={16} color="var(--pine-200)" />}<span>{children}</span>
    {action && <button onClick={onAction} style={{ marginLeft:6, background:'transparent', border:0, color:'var(--marigold-300)', font:'700 .82rem var(--font-sans)', cursor:'pointer', padding:'4px 6px' }}>{action}</button>}
  </div>;
}
