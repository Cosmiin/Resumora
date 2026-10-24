import React from 'react';
import { IconButton } from '../core/IconButton.jsx';
export function Dialog({ open = true, title, children, footer, onClose, width = 560, inline }) {
  if (!open) return null;
  const box = <div role="dialog" aria-modal={!inline} aria-label={typeof title === 'string' ? title : undefined} style={{ background:'var(--surface-card)', border:'1px solid var(--border-subtle)', borderRadius:'var(--radius-dialog)', width:'100%', maxWidth:width, boxShadow: inline ? 'none' : 'var(--shadow-raised)', color:'var(--text-body)' }}>
    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, padding:'22px 22px 0 25px' }}><h2 style={{ margin:0, font:'var(--type-section-title)', color:'var(--text-strong)', letterSpacing:'var(--tracking-heading)' }}>{title}</h2>{onClose && <IconButton icon="x" label="Close" size="sm" onClick={onClose} />}</div>
    <div style={{ padding:'12px 25px 0', fontSize:'.9rem', lineHeight:1.6 }}>{children}</div>
    {footer && <div style={{ display:'flex', gap:10, justifyContent:'flex-end', flexWrap:'wrap', padding:'22px 25px 25px' }}>{footer}</div>}
    {!footer && <div style={{ height:25 }} />}
  </div>;
  if (inline) return box;
  return <div onClick={e => e.target === e.currentTarget && onClose && onClose()} style={{ position:'fixed', inset:0, background:'var(--backdrop)', display:'grid', placeItems:'center', padding:16, zIndex:40 }}>{box}</div>;
}
