import React from 'react';
import { injectCss } from './injectCss.js';
const CSS = '.cvz-icon{display:inline-block;flex-shrink:0;background:currentColor;-webkit-mask:var(--cvz-icon) center/contain no-repeat;mask:var(--cvz-icon) center/contain no-repeat;vertical-align:middle}';
export function Icon({ name, size = 18, color, label, style }) {
  injectCss('icon', CSS);
  const url = 'url("https://unpkg.com/lucide-static@0.460.0/icons/' + name + '.svg")';
  return <span className="cvz-icon" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} style={{ width: size, height: size, color, '--cvz-icon': url, ...style }} />;
}
