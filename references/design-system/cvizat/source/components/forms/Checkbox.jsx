import React from 'react';
import { injectCss } from '../core/injectCss.js';
import { FIELD_CSS } from './fieldCss.js';
import { Icon } from '../core/Icon.jsx';
export function Checkbox({ label, description, checked, defaultChecked, onChange, disabled, variant = 'plain' }) {
  injectCss('field', FIELD_CSS);
  return <label className={'rz-check' + (variant === 'card' ? ' rz-check--card' : '')}>
    <input type="checkbox" checked={checked} defaultChecked={defaultChecked} disabled={disabled} onChange={onChange && (e => onChange(e.target.checked, e))} />
    <span className="rz-box"><Icon name="check" size={14} style={{ strokeWidth:3 }} /></span>
    <span className="rz-check-t"><span style={{ fontWeight: description ? 650 : 450, color:'var(--text-strong)' }}>{label}</span>{description && <span className="rz-check-d">{description}</span>}</span>
  </label>;
}
