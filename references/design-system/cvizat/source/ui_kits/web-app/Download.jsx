function DownloadScreen({ accepted, rtw, onSent }) {
  const { CVDocument, Button, Segmented, ScoreRing, Alert, Card, Select, Spinner } = window.CVizatDesignSystem_0f8e2e;
  const [tpl, setTpl] = React.useState('Clar');
  const [state, setState] = React.useState('idle');
  const dl = () => { setState('busy'); setTimeout(() => setState('done'), 1300); };
  return <div style={{ display:'grid', gridTemplateColumns:'320px minmax(0,1fr)', gap:24, alignItems:'start', maxWidth:1120, margin:'0 auto' }}>
    <div style={{ display:'grid', gap:16 }}>
      <Card style={{ textAlign:'center' }}>
        <ScoreRing value={90} previous={62} label="This CV vs the job" size={132} />
        <p style={{ margin:'14px 0 0', fontSize:'.88rem', lineHeight:1.55 }}><b style={{ fontFamily:'var(--font-display)', fontSize:'1.15rem', color:'var(--text-strong)', display:'block' }}>Your CV now shows your fit.</b><span style={{ color:'var(--text-muted)' }}>Same facts, better chosen.</span></p>
      </Card>
      {!rtw && <Alert tone="warn" title="Still to check">Right to work in Romania — the job requires it.</Alert>}
      <Card padding="sm"><div style={{ display:'grid', gap:14 }}>
        <div><div style={{ font:'var(--type-label)', marginBottom:7 }}>Template</div><Segmented fullWidth options={['Clar','Contur']} value={tpl} onChange={setTpl} /></div>
        <Select label="CV language" icon="languages" options={['English','Română']} hint="Separate from the app language" />
        {state === 'busy' ? <Spinner size={28} label="Preparing PDF and checking it reads correctly…" /> : <Button variant="primary" size="lg" fullWidth icon="download" onClick={dl}>{state === 'done' ? 'Download again' : 'Download PDF'}</Button>}
        {state === 'done' && <Button fullWidth icon="send" onClick={onSent}>I’ve sent this application</Button>}
      </div></Card>
    </div>
    <CVDocument template={tpl.toLowerCase()} scale={.9} name="Mara Ionescu" titles={['Business Systems Analyst']} contact="Cluj-Napoca · mara.ionescu@example.com · +40 7xx xxx xxx" sections={window.CVZ_cv(accepted)} />
  </div>;
}
window.DownloadScreen = DownloadScreen;
