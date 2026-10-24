import React from 'react';
import { injectCss } from './injectCss.js';
import { BTN_CSS } from './buttonCss.js';
import { Icon } from './Icon.jsx';
export function Button({ variant = 'secondary', size = 'md', icon, iconRight, fullWidth, loading, disabled, children, onClick, type = 'button', href, style }) {
  injectCss('btn', BTN_CSS);
  const cls = ['cvz-btn', 'cvz-btn--' + variant, size !== 'md' && 'cvz-btn--' + size, fullWidth && 'cvz-btn--full'].filter(Boolean).join(' ');
  const isz = size === 'sm' ? 16 : 18;
  const inner = <>{loading ? <span className="cvz-spin" aria-hidden="true" /> : icon && <Icon name={icon} size={isz} />}{children}{iconRight && <Icon name={iconRight} size={isz} />}</>;
  if (href) return <a className={cls} href={href} style={style}>{inner}</a>;
  return <button type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} onClick={onClick} style={style}>{inner}</button>;
}
