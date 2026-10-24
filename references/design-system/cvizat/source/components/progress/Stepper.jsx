import React from 'react';
import { Icon } from '../core/Icon.jsx';
export function Stepper({ steps = [], current = 0, onStepClick }) {
  return <ol style={{ display:'flex', gap:6, listStyle:'none', margin:0, padding:0, flexWrap:'wrap', alignItems:'center' }}>
    {steps.map((s, i) => { const done = i < current, on = i === current;
      return <li key={i} style={{ display:'flex', alignItems:'center', gap:6 }}>
        <button disabled={!onStepClick || i > current} onClick={() => onStepClick && onStepClick(i)} aria-current={on ? 'step' : undefined} style={{ display:'inline-flex', alignItems:'center', gap:8, border:0, borderRadius:'var(--radius-pill)', padding:'6px 12px 6px 6px', background: on ? 'var(--action-primary)' : done ? 'var(--surface-hero)' : 'var(--sage-150)', color: on ? 'var(--text-on-primary)' : done ? 'var(--text-accent)' : 'var(--text-muted)', font:'600 .78rem/1 var(--font-sans)', cursor: onStepClick && i <= current ? 'pointer' : 'default' }}>
          <span style={{ width:20, height:20, borderRadius:'50%', display:'grid', placeItems:'center', background: on ? 'rgba(255,255,255,.2)' : done ? 'var(--surface-card)' : 'var(--surface-card)', fontSize:'.7rem' }}>{done ? <Icon name="check" size={12} /> : i + 1}</span>{s}
        </button>
        {i < steps.length - 1 && <span aria-hidden="true" style={{ width:14, height:2, background: done ? 'var(--pine-300)' : 'var(--sage-200)', borderRadius:2 }} />}
      </li>; })}
  </ol>;
}
