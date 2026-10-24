import React from 'react';
import { Pill } from '../core/Pill.jsx';
import { Icon } from '../core/Icon.jsx';
const STATE = {
  included:{ tone:'good', icon:'check', label:'In your CV' },
  equivalent:{ tone:'good', icon:'languages', label:'In your CV · similar wording' },
  omitted:{ tone:'info', icon:'archive', label:'You have it · not in this CV' },
  confirm:{ tone:'warn', icon:'circle-help', label:'Is this true for you?' },
  gap:{ tone:'neutral', icon:'minus', label:'Not in your experience' },
};
export function KeywordRow({ term, state = 'included', required, detail, action, last }) {
  const s = STATE[state] || STATE.included;
  return <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:15, padding:'15px 0', borderBottom: last ? 0 : '1px solid var(--border-subtle)', flexWrap:'wrap' }}>
    <div style={{ minWidth:0, flex:'1 1 260px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}><b style={{ fontSize:'.92rem', color:'var(--text-strong)', fontWeight:650 }}>{term}</b>{required ? <Pill size="sm" tone="neutral">Required</Pill> : <Pill size="sm" tone="neutral">Nice to have</Pill>}</div>
      {detail && <p style={{ margin:'6px 0 0', fontSize:'.8rem', lineHeight:1.55, color:'var(--text-muted)' }}>{detail}</p>}
    </div>
    <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0 }}><Pill tone={s.tone} icon={s.icon}>{s.label}</Pill>{action}</div>
  </div>;
}
