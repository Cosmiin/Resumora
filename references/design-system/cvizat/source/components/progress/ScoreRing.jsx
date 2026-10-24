import React from 'react';
export function ScoreRing({ value, size = 120, label, caption, previous, untested }) {
  const stroke = size >= 100 ? 10 : 7, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const pct = untested || value == null ? 0 : Math.max(0, Math.min(100, value));
  return <div style={{ display:'inline-grid', justifyItems:'center', gap:8 }}>
    <div style={{ position:'relative', width:size, height:size }}>
      <svg width={size} height={size} style={{ transform:'rotate(-90deg)' }} aria-hidden="true">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={untested ? 'var(--sage-200)' : 'var(--score-track)'} strokeWidth={stroke} strokeDasharray={untested ? '4 6' : undefined} />
        {!untested && <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--score-fill)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} style={{ transition:'stroke-dashoffset var(--dur-celebrate) var(--ease-out)' }} />}
      </svg>
      <div style={{ position:'absolute', inset:0, display:'grid', placeContent:'center', textAlign:'center' }}>
        <b style={{ fontFamily:'var(--font-display)', fontSize: untested ? size * .13 : size * .28, letterSpacing:'var(--tracking-stat)', color: untested ? 'var(--text-muted)' : 'var(--text-strong)', lineHeight:1, fontWeight:700 }}>{untested ? 'Not tested' : Math.round(value)}</b>
        {previous != null && !untested && <small style={{ fontSize:'.68rem', color:'var(--text-muted)', marginTop:3 }}>was {previous}</small>}
      </div>
    </div>
    {label && <div style={{ fontSize:'.8rem', fontWeight:650, color:'var(--text-strong)', textAlign:'center' }}>{label}</div>}
    {caption && <div style={{ fontSize:'.74rem', color:'var(--text-muted)', textAlign:'center', maxWidth:size + 40, lineHeight:1.4 }}>{caption}</div>}
  </div>;
}
