function ImproveScreen({ accepted, setAccepted, onNext }) {
  const { ChangeCard, CVDocument, Button, Dialog } = window.CVizatDesignSystem_0f8e2e;
  const C = window.CVZ_DATA.changes;
  const [ask, setAsk] = React.useState(false);
  const toggle = id => setAccepted(a => a.includes(id) ? a.filter(x => x !== id) : [...a, id]);
  return <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr)', gap:24, alignItems:'start', maxWidth:1180, margin:'0 auto' }}>
    <div style={{ display:'grid', gap:14 }}>
      <div><h1 style={{ margin:0, font:'700 2rem/1.15 var(--font-display)', letterSpacing:'-0.04em', color:'var(--text-strong)' }}>Keep what feels right</h1>
      <p style={{ margin:'10px 0 0', color:'var(--text-muted)', lineHeight:1.6 }}>Every change uses facts you’ve already confirmed. Untick anything you don’t want — this only changes the CV for Northstar People.</p></div>
      {C.map(c => <ChangeCard key={c.id} {...c} checked={accepted.includes(c.id)} onChange={() => toggle(c.id)} />)}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, flexWrap:'wrap', marginTop:6 }}>
        <span style={{ fontSize:'.82rem', color:'var(--text-muted)' }}>{accepted.length} of {C.length} changes kept</span>
        <Button variant="primary" size="lg" iconRight="arrow-right" onClick={() => setAsk(true)}>Save this job’s CV</Button>
      </div>
    </div>
    <div style={{ position:'sticky', top:20 }}><CVDocument template="clar" scale={.82} name="Mara Ionescu" titles={['Business Systems Analyst']} contact="Cluj-Napoca · mara.ionescu@example.com · +40 7xx xxx xxx" sections={window.CVZ_cv(accepted)} highlight={C.filter(c => accepted.includes(c.id)).map(c => c.after)} /></div>
    {ask && <Dialog title="Also improve your Base CV?" onClose={() => setAsk(false)} footer={<><Button onClick={() => { setAsk(false); onNext(false); }}>Only this job</Button><Button variant="primary" onClick={() => { setAsk(false); onNext(true); }}>Update Base too</Button></>}>The new summary and the outcome bullet could help future applications. Your Base CV is where every new job starts — we’ll save it as a new version you can undo.</Dialog>}
  </div>;
}
window.ImproveScreen = ImproveScreen;
