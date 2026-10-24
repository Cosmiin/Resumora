function AddJobScreen({ onDone }) {
  const { Card, Button, Field, Segmented, Spinner, Dropzone } = window.CVizatDesignSystem_0f8e2e;
  const D = window.CVZ_DATA;
  const [mode, setMode] = React.useState('paste');
  const [text, setText] = React.useState(D.job.ad);
  const [url, setUrl] = React.useState('');
  const [file, setFile] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const ready = mode === 'paste' ? text.length >= 30 : mode === 'link' ? /^https?:\/\/.+\..+/.test(url) : !!file;
  const go = () => { setBusy(true); setTimeout(onDone, 1400); };
  if (busy) return <Card style={{ maxWidth:640, margin:'40px auto', textAlign:'center' }}><div style={{ padding:'40px 0' }}><Spinner label="Reading the job ad and comparing it with your CV…" /><div style={{ marginTop:18 }}><Button variant="ghost" size="sm" onClick={() => setBusy(false)}>Cancel</Button></div></div></Card>;
  return <div style={{ maxWidth:680, margin:'0 auto', display:'grid', gap:20 }}>
    <div><h1 style={{ margin:0, font:'700 2rem/1.15 var(--font-display)', letterSpacing:'-0.04em', color:'var(--text-strong)' }}>Which job are you applying for?</h1>
    <p style={{ margin:'10px 0 0', color:'var(--text-muted)', lineHeight:1.6 }}>We only read what you give us. Nothing is sent to the employer.</p></div>
    <Card>
      <div style={{ display:'grid', gap:20 }}>
        <Segmented fullWidth value={mode} onChange={setMode} options={[{ value:'paste', label:'Paste the ad', icon:'clipboard-paste' },{ value:'link', label:'From a link', icon:'link' },{ value:'file', label:'Upload a file', icon:'file-up' }]} />
        {mode === 'paste' && <Field label="Job ad" multiline rows={9} maxLength={6000} value={text} onChange={setText} hint="Copy the whole ad, including the requirements." error={text.length > 0 && text.length < 30 ? 'Paste a bit more — at least a few sentences.' : undefined} />}
        {mode === 'link' && <Field label="Link to the job ad" icon="link" type="url" value={url} onChange={setUrl} placeholder="https://www.ejobs.ro/…" hint="If the page needs a login, we’ll ask you to paste the text instead." success={/^https?:\/\/.+\..+/.test(url) ? 'Looks like a valid link' : undefined} />}
        {mode === 'file' && <Dropzone title="Drop the job ad here" acceptLabel="PDF, DOCX or screenshot" accept=".pdf,.docx,image/*" file={file} onFile={setFile} onRemove={() => setFile(null)} />}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}><Field label="Job title" icon="briefcase" defaultValue={D.job.title} optional /><Field label="Company" icon="building-2" defaultValue={D.job.company} optional /></div>
      </div>
    </Card>
    <div style={{ display:'flex', justifyContent:'flex-end' }}><Button variant="primary" size="lg" iconRight="arrow-right" disabled={!ready} onClick={go}>Check my match</Button></div>
  </div>;
}
window.AddJobScreen = AddJobScreen;
