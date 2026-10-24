function HomeScreen({ onStart, applied }) {
  const { Card, Button, TaskCard, Pill, ProgressBar, Icon } = window.CVizatDesignSystem_0f8e2e;
  return <div style={{ display:'grid', gap:24, maxWidth:1040 }}>
    <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1.15fr) minmax(0,.85fr)', gap:30, background:'var(--surface-hero)', border:'1px solid #d6e4d9', borderRadius:'var(--radius-hero)', padding:'38px' }}>
      <div>
        <div style={{ font:'750 .73rem var(--font-sans)', letterSpacing:'.14em', textTransform:'uppercase', color:'var(--text-accent)', marginBottom:12 }}>Good afternoon, Mara</div>
        <h1 style={{ margin:0, font:'700 2.65rem/1.1 var(--font-display)', letterSpacing:'-0.045em', color:'var(--text-strong)', textWrap:'balance' }}>Prepare your next application</h1>
        <p style={{ margin:'16px 0 0', color:'var(--text-muted)', fontSize:'1rem', lineHeight:1.6, maxWidth:460 }}>Paste a job ad. We’ll show how well you fit, what your CV is missing, and make you a version for that job — your Base CV stays as it is.</p>
        <div style={{ display:'flex', gap:10, marginTop:24, flexWrap:'wrap' }}><Button variant="primary" size="lg" iconRight="arrow-right" onClick={onStart}>Start with a job</Button><Button size="lg" icon="file-user">Edit my Base CV</Button></div>
      </div>
      <div style={{ alignSelf:'center', background:'#fff', padding:24, boxShadow:'var(--shadow-paper)', transform:'rotate(2deg)', borderRadius:3 }}>
        <div style={{ font:'700 1.1rem var(--font-document)', color:'var(--text-document)' }}>Mara Ionescu</div>
        <div style={{ fontSize:'.75rem', color:'var(--text-muted)', marginTop:2 }}>Business Systems Analyst</div>
        {[100,86,64,92,70].map((w,i)=><div key={i} style={{ height:6, width:w+'%', background:'var(--pine-200)', borderRadius:3, margin:'13px 0' }} />)}
      </div>
    </div>
    <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1.15fr) minmax(0,.85fr)', gap:24 }}>
      <div style={{ display:'grid', gap:12, alignContent:'start' }}>
        <h2 style={{ margin:0, font:'var(--type-section-title)', color:'var(--text-strong)' }}>Your applications</h2>
        <TaskCard emphasis={!applied} icon="briefcase" title="Northstar People · Business Systems Analyst" onClick={onStart} meta={applied ? <><Pill size="sm" tone="good" icon="send">Sent today</Pill><Pill size="sm">Tailored CV v1</Pill></> : <><Pill size="sm" tone="info">Not tailored yet</Pill><Pill size="sm" tone="warn" icon="circle-help">1 thing to check</Pill></>}>{applied ? 'Next: follow up with Ana Pop · 30 Oct' : 'Next: see your match and improve your CV'}</TaskCard>
        <TaskCard icon="briefcase" title="Lumen Bank · Process Analyst" meta={<Pill size="sm">Interview · 28 Oct</Pill>}>Tailored CV v2 · sent 14 Oct</TaskCard>
      </div>
      <Card>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}><h2 style={{ margin:0, font:'var(--type-section-title)', color:'var(--text-strong)' }}>Base CV</h2><Pill size="sm" tone="good" icon="shield-check">Confirmed by you</Pill></div>
        <p style={{ margin:'6px 0 16px', fontSize:'.82rem', color:'var(--text-muted)' }}>v3 · saved 23 Oct. Every job version starts here.</p>
        <div style={{ display:'grid', gap:10 }}>
          {[['Content','circle-check','good','Looks good'],['Structure','circle-check','good','Looks good'],['Writing','circle-alert','warn','2 bullets could be clearer']].map(([k,ic,t,v])=><div key={k} style={{ display:'flex', alignItems:'center', gap:10, fontSize:'.85rem' }}><Icon name={ic} size={18} color={'var(--status-'+t+'-fg)'} /><b style={{ fontWeight:600, width:80 }}>{k}</b><span style={{ color:'var(--text-muted)' }}>{v}</span></div>)}
        </div>
        <div style={{ marginTop:18 }}><Button size="sm" variant="ghost" iconRight="arrow-right">Improve these</Button></div>
      </Card>
    </div>
  </div>;
}
window.HomeScreen = HomeScreen;
