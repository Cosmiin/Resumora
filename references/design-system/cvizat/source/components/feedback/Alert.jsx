import React from 'react';
import { Icon } from '../core/Icon.jsx';
const MAP = { info:['info','info'], good:['good','circle-check'], warn:['warn','circle-alert'], bad:['bad','circle-x'], neutral:['neutral','info'] };
export function Alert({ tone = 'info', title, children, action, icon }) {
  const [t, ic] = MAP[tone] || MAP.info;
  return <div role={tone === 'bad' ? 'alert' : 'status'} style={{ display:'flex', gap:12, alignItems:'flex-start', padding:'14px 16px', background:'var(--status-'+t+'-bg)', border:'1px solid var(--status-'+t+'-border)', borderRadius:'var(--radius-lg)', color:'var(--text-body)', fontSize:'.84rem', lineHeight:1.55 }}>
    <span style={{ color:'var(--status-'+t+'-fg)', marginTop:1 }}><Icon name={icon || ic} size={18} /></span>
    <div style={{ flex:1, minWidth:0 }}>{title && <div style={{ fontWeight:700, color:'var(--status-'+t+'-fg)', marginBottom: children ? 2 : 0 }}>{title}</div>}{children}</div>
    {action && <div style={{ flexShrink:0, alignSelf:'center' }}>{action}</div>}
  </div>;
}
