import React from 'react';
export function CVDocument({ template = 'clar', name, titles = [], contact, sections = [], highlight, scale = 1 }) {
  const clar = template === 'clar';
  const accent = 'var(--pine-600)';
  return <article style={{ background:'var(--surface-document)', color:'var(--text-document)', padding:36 * scale, border:'1px solid #d7dfda', borderTop: clar ? '1px solid #d7dfda' : (7 * scale) + 'px solid ' + accent, borderRadius:'var(--radius-xs)', fontFamily: clar ? 'var(--font-document)' : 'var(--font-sans)', fontSize: (13.3 * scale) + 'px', lineHeight:1.55, boxShadow:'var(--shadow-document)', minWidth:0 }}>
    <h2 style={{ margin:0, fontSize: (clar ? 27 : 30) * scale, letterSpacing:0, fontWeight:700, color: clar ? 'var(--text-document)' : accent, fontFamily: clar ? 'var(--font-document)' : 'var(--font-display)' }}>{name}</h2>
    {titles.length > 0 && <div style={{ fontSize: 14 * scale, marginTop:4, color:'#334c45' }}>{titles.join(' · ')}</div>}
    {contact && <div style={{ fontSize: 11.5 * scale, margin:(10 * scale) + 'px 0', color:'#334c45' }}>{contact}</div>}
    {sections.map((s, i) => <section key={i}>
      <h3 style={{ fontFamily:'var(--font-sans)', fontSize: 12 * scale, textTransform:'uppercase', letterSpacing:'.1em', padding: clar ? '0 0 '+(7*scale)+'px' : (9*scale)+'px', margin:(22*scale)+'px 0 '+(10*scale)+'px', borderBottom: clar ? '1px solid #c2d4ca' : 0, background: clar ? 'transparent' : '#e9f1eb', fontWeight:700 }}>{s.title}</h3>
      {s.text && <p style={{ margin:0, color:'#334c45' }}>{s.text}</p>}
      {(s.items || []).map((it, j) => <div key={j} style={{ marginBottom: 10 * scale }}>
        {it.heading && <div style={{ display:'flex', justifyContent:'space-between', gap:12, fontWeight:700 }}><span>{it.heading}</span>{it.dates && <span style={{ fontWeight:400, fontSize: 12 * scale, color:'#334c45', whiteSpace:'nowrap' }}>{it.dates}</span>}</div>}
        {it.sub && <div style={{ fontSize: 12 * scale, color:'#334c45' }}>{it.sub}</div>}
        {it.bullets && <ul style={{ paddingLeft:18 * scale, margin:(6*scale)+'px 0 0' }}>{it.bullets.map((b, k) => { const hi = highlight && highlight.includes(b); return <li key={k} style={{ margin:(5*scale)+'px 0', fontSize: 12.8 * scale, background: hi ? 'var(--marigold-100)' : 'transparent', boxShadow: hi ? '0 0 0 3px var(--marigold-100)' : 'none', borderRadius:2 }}>{b}</li>; })}</ul>}
      </div>)}
    </section>)}
  </article>;
}
