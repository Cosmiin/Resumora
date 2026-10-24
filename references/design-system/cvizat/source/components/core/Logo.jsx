import React from 'react';
import { LOGO_WORD_D, LOGO_W, DOOR_RAYS, DOOR_LEAF } from './logoPaths.js';
const TONES = {
  default:{ sq:'#17695d', leaf:'#ffffff', knob:'#17695d', a:'#f9d67a', b:'#ffb38a', word:'#173b39' },
  inverse:{ sq:'#ffffff', leaf:'#17695d', knob:'#ffffff', a:'#f6c35f', b:'#ff9f70', word:'#ffffff' },
  mono:{ sq:'#173b39', leaf:'#ffffff', knob:'#173b39', a:'#ffffff', b:'#ffffff', word:'#173b39' },
};
let seq = 0;
export function Logo({ variant = 'full', tone = 'default', size = 32, title = 'Resumora', rays }) {
  const t = TONES[tone] || TONES.default;
  const id = React.useMemo(() => 'rzl' + (++seq), []);
  const showRays = rays ?? size >= 24;
  const mark = <g>
    <defs>
      <linearGradient id={id + 'g'} x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stopColor={t.a} /><stop offset="1" stopColor={t.b} /></linearGradient>
      <linearGradient id={id + 'r'} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor={t.b} stopOpacity=".75" /><stop offset="1" stopColor={t.b} stopOpacity="0" /></linearGradient>
      <clipPath id={id + 'c'}><rect width="64" height="64" rx="16" /></clipPath>
    </defs>
    <rect width="64" height="64" rx="16" fill={t.sq} />
    <g clipPath={'url(#' + id + 'c)'}>
      {showRays && DOOR_RAYS.map((d, i) => <path key={i} d={d} fill={'url(#' + id + 'r)'} opacity={[1, .8, .6][i]} />)}
      <rect x="19" y="13" width="22" height="38" rx="3" fill={'url(#' + id + 'g)'} />
      <path d={DOOR_LEAF} fill={t.leaf} stroke={t.leaf} strokeWidth="2" strokeLinejoin="round" />
      <circle cx="27.6" cy="32.5" r="1.9" fill={t.knob} />
    </g>
  </g>;
  if (variant === 'mark') return <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={title} style={{ display:'block', flexShrink:0 }}>{mark}</svg>;
  if (variant === 'wordmark') { const w = LOGO_W - 78; return <svg width={size * w / 64} height={size} viewBox={'78 0 ' + w + ' 64'} role="img" aria-label={title} style={{ display:'block', flexShrink:0 }}><path d={LOGO_WORD_D} fill={t.word} /></svg>; }
  return <svg width={size * LOGO_W / 64} height={size} viewBox={'0 0 ' + LOGO_W + ' 64'} role="img" aria-label={title} style={{ display:'block', flexShrink:0 }}>{mark}<path d={LOGO_WORD_D} fill={t.word} /></svg>;
}
