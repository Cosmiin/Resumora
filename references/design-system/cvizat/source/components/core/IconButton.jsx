import React from 'react';
import { injectCss } from './injectCss.js';
import { BTN_CSS } from './buttonCss.js';
import { Icon } from './Icon.jsx';
export function IconButton({ icon, label, variant = 'ghost', size = 'md', onClick, disabled }) {
  injectCss('btn', BTN_CSS);
  const cls = ['cvz-btn', 'cvz-btn--icon', 'cvz-btn--' + variant, size === 'sm' && 'cvz-btn--sm'].filter(Boolean).join(' ');
  return <button type="button" className={cls} aria-label={label} title={label} onClick={onClick} disabled={disabled}><Icon name={icon} size={size === 'sm' ? 16 : 18} /></button>;
}
