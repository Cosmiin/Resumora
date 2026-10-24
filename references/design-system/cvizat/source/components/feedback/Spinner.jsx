import React from 'react';
import { injectCss } from '../core/injectCss.js';
export function Spinner({ size = 40, label }) {
  injectCss('spinner', '@keyframes cvz-ring{to{transform:rotate(360deg)}}');
  return <div style={{ display:'grid', justifyItems:'center', gap:12 }}><span role="progressbar" aria-label={label || 'Working'} style={{ width:size, height:size, border:(size > 24 ? 4 : 2)+'px solid var(--pine-200)', borderTopColor:'var(--action-primary)', borderRadius:'50%', animation:'cvz-ring 1s linear infinite', display:'block' }} />{label && <span style={{ fontSize:'.85rem', color:'var(--text-muted)' }}>{label}</span>}</div>;
}
