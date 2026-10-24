import React from 'react';
export function Card({ tone = 'default', padding = 'md', interactive, selected, children, onClick, style }) {
  const bg = { default:'var(--surface-card)', hero:'var(--surface-hero)', sunken:'var(--surface-sunken)', inverse:'var(--surface-inverse)' }[tone];
  const pad = { none:0, sm:'var(--space-6)', md:'var(--pad-card)', lg:'var(--pad-hero)' }[padding];
  const border = selected ? '2px solid var(--border-selected)' : tone === 'hero' ? '1px solid #d6e4d9' : tone === 'inverse' ? '1px solid transparent' : '1px solid var(--border-subtle)';
  const Tag = onClick ? 'button' : 'div';
  return <Tag onClick={onClick} style={{ display:'block', width:'100%', textAlign:'left', font:'inherit', color: tone === 'inverse' ? 'var(--text-on-inverse)' : 'inherit', background:bg, border, borderRadius: tone === 'hero' ? 'var(--radius-hero)' : 'var(--radius-card)', padding:pad, minWidth:0, cursor: onClick ? 'pointer' : undefined, transition:'border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)', boxShadow: interactive ? 'var(--shadow-card)' : 'none', ...style }}>{children}</Tag>;
}
