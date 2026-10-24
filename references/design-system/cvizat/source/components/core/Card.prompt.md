Flat bordered panel (1px sage border, 14px radius, no shadow) — the base surface for all content.
```jsx
<Card><h2>Your CV</h2><p>Last saved today</p></Card>
<Card tone="hero" padding="lg">…</Card>
<Card selected onClick={pick}>3 months</Card>
```
Do not nest cards more than one level; use dividers inside instead.
