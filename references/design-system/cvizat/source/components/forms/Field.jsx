import React from 'react';
import { injectCss } from '../core/injectCss.js';
import { FIELD_CSS } from './fieldCss.js';
import { FieldShell } from './FieldShell.jsx';
import { Icon } from '../core/Icon.jsx';
let n = 0;
export function Field({ id, label, hint, error, success, optional, icon, suffix, multiline, rows = 4, maxLength, value, defaultValue, placeholder, onChange, type = 'text', disabled, size = 'md' }) {
  injectCss('field', FIELD_CSS);
  const fid = React.useMemo(() => id || 'rz-f' + (++n), [id]);
  const [len, setLen] = React.useState(String(value ?? defaultValue ?? '').length);
  const cur = value != null ? String(value).length : len;
  const state = error ? 'error' : success ? 'success' : undefined;
  const p = { id:fid, className:'rz-native', value, defaultValue, placeholder, disabled, onChange: e => { setLen(e.target.value.length); onChange && onChange(e.target.value, e); }, 'aria-invalid': !!error, 'aria-describedby': (error || success || hint) ? fid + '-msg' : undefined };
  return <FieldShell id={fid} label={label} hint={hint} error={error} success={success} optional={optional}>
    <div className={'rz-control' + (multiline ? ' rz-control--multi' : '') + (size === 'sm' ? ' rz-control--sm' : '')} data-state={state} data-disabled={!!disabled}>
      {icon && !multiline && <span className="rz-adorn"><Icon name={icon} size={18} /></span>}
      {multiline ? <textarea rows={rows} {...p} /> : <input type={type} {...p} />}
      {suffix && !multiline && <span className="rz-suffix">{suffix}</span>}
      {success && !multiline && <span className="rz-adorn" style={{ color:'var(--status-good-fg)' }}><Icon name="circle-check" size={18} /></span>}
      {maxLength && <span className="rz-count" data-over={cur > maxLength}>{cur} / {maxLength}</span>}
    </div>
  </FieldShell>;
}
