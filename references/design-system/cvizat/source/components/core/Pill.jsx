import React from 'react';
import { Icon } from './Icon.jsx';
const TONES = { neutral:'neutral', good:'good', warn:'warn', bad:'bad', info:'info' };
export function Pill({ tone = 'neutral', icon, children, size = 'md', shape = 'tag' }) {
  const t = TONES[tone] || 'neutral';
  return <span style={{ display:'inline-flex', alignItems:'center', gap:5, border:'1px solid var(--status-'+t+'-border)', background:'var(--status-'+t+'-bg)', color:'var(--status-'+t+'-fg)', borderRadius: shape === 'round' ? 'var(--radius-pill)' : 'var(--radius-sm)', padding: size === 'sm' ? '2px 7px' : '4px 9px', fontSize: size === 'sm' ? '.68rem' : '.72rem', fontWeight:600, lineHeight:1.35, fontFamily:'var(--font-sans)', whiteSpace:'nowrap' }}>{icon && <Icon name={icon} size={size === 'sm' ? 12 : 14} />}{children}</span>;
}
