import React from 'react';
import { Icon } from '../core/Icon.jsx';
export function FieldShell({ id, label, hint, error, success, optional, children }) {
  const msg = error || success || hint;
  const kind = error ? 'error' : success ? 'success' : 'hint';
  return <div className="rz-field">
    {label && <div className="rz-lrow"><label htmlFor={id} className="rz-label">{label}</label>{optional && <span className="rz-opt">Optional</span>}</div>}
    {children}
    {msg && <div id={id + '-msg'} className={'rz-msg rz-msg--' + kind}>{kind !== 'hint' && <Icon name={error ? 'circle-alert' : 'circle-check'} size={14} />}<span>{msg}</span></div>}
  </div>;
}
