import React from 'react';
import { ScoreRing } from '../progress/ScoreRing.jsx';
export function MatchVerdict({ headline, summary, score, previous, scoreLabel = 'This CV vs the job', counts, actions }) {
  return <div style={{ display:'grid', gridTemplateColumns:'auto minmax(0,1fr)', gap:28, alignItems:'center', background:'var(--surface-hero)', border:'1px solid #d6e4d9', borderRadius:'var(--radius-hero)', padding:'28px 32px' }}>
    <ScoreRing value={score} previous={previous} label={scoreLabel} size={128} />
    <div style={{ minWidth:0 }}>
      <h2 style={{ margin:0, fontFamily:'var(--font-display)', fontWeight:700, fontSize:'1.7rem', lineHeight:1.15, letterSpacing:'-0.03em', color:'var(--text-strong)', textWrap:'balance' }}>{headline}</h2>
      {summary && <p style={{ margin:'10px 0 0', color:'var(--text-muted)', fontSize:'.92rem', lineHeight:1.6, maxWidth:560, textWrap:'pretty' }}>{summary}</p>}
      {counts && <div style={{ display:'flex', gap:22, marginTop:18, flexWrap:'wrap' }}>{counts.map((c, i) => <div key={i} style={{ display:'grid', gap:2 }}><span style={{ fontFamily:'var(--font-display)', fontSize:'1.5rem', fontWeight:700, color: c.color || 'var(--text-strong)', lineHeight:1 }}>{c.value}</span><span style={{ fontSize:'.76rem', color:'var(--text-muted)' }}>{c.label}</span></div>)}</div>}
      {actions && <div style={{ display:'flex', gap:10, marginTop:20, flexWrap:'wrap' }}>{actions}</div>}
    </div>
  </div>;
}
