import React from 'react';
import { injectCss } from '../core/injectCss.js';
import { FIELD_CSS } from './fieldCss.js';
let n = 0;
export function RadioGroup({ label, name, options = [], value, onChange, variant = 'card', direction = 'column' }) {
  injectCss('field', FIELD_CSS);
  const nm = React.useMemo(() => name || 'rz-r' + (++n), [name]);
  return <fieldset style={{ border:0, padding:0, margin:0, display:'grid', gap:10, minWidth:0 }}>
    {label && <legend className="rz-label" style={{ padding:0, marginBottom:8 }}>{label}</legend>}
    <div style={{ display:'flex', flexDirection:direction, gap:10, flexWrap:'wrap' }}>
      {options.map(o => { const v = typeof o === 'string' ? o : o.value; const l = typeof o === 'string' ? o : o.label;
        return <label key={v} className={'rz-check' + (variant === 'card' ? ' rz-check--card' : '')} style={{ flex: direction === 'row' ? '1 1 0' : undefined }}>
          <input type="radio" name={nm} value={v} checked={value === v} onChange={() => onChange && onChange(v)} />
          <span className="rz-box rz-box--radio" />
          <span className="rz-check-t"><span style={{ fontWeight: o.description ? 650 : 500, color:'var(--text-strong)' }}>{l}</span>{o.description && <span className="rz-check-d">{o.description}</span>}</span>
        </label>; })}
    </div>
  </fieldset>;
}
