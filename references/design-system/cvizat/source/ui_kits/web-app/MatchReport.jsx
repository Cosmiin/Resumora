function MatchReportScreen({ onNext, rtw, setRtw }) {
  const { Button, Alert, FindingGroup, KeywordRow, MatchVerdict, Card, ProgressBar, ScoreRing, Dialog, Pill, RadioGroup } = window.CVizatDesignSystem_0f8e2e;
  const [ans, setAns] = React.useState('yes');
  const F = window.CVZ_DATA.findings;
  const [how, setHow] = React.useState(false);
  const [ask, setAsk] = React.useState(false);
  const rows = (list) => list.map((k, i) => <KeywordRow key={k.term} {...k} last={i === list.length - 1} />);
  return <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) 300px', gap:24, alignItems:'start', maxWidth:1120, margin:'0 auto' }}>
    <div style={{ display:'grid', gap:16, minWidth:0 }}>
      <MatchVerdict score={62} headline="Good fit — your CV just doesn’t show it yet." summary="You have the experience for 9 of 10 requirements. 3 of them aren’t in this CV. Adding them takes about two minutes."
        counts={[{ value:4, label:'Already in your CV' }, { value:3, label:'Ready to add', color:'var(--status-info-fg)' }, { value: rtw ? 0 : 1, label:'To check', color:'var(--status-warn-fg)' }]}
        actions={<Button variant="primary" size="lg" iconRight="arrow-right" onClick={onNext}>Add the 3 missing things</Button>} />
      {!rtw && <Alert tone="warn" title="Can you work in Romania?" action={<Button size="sm" onClick={() => setAsk(true)}>Answer</Button>}>The job requires it. We don’t know yet, so we’ll keep reminding you — your score doesn’t change.</Alert>}
      {rtw && <Alert tone="good" title="Right to work in Romania: yes">Based on what you told us. Employers may ask for proof.</Alert>}
      <FindingGroup tone="info" icon="sparkles" title="Ready to add" count="3" subtitle="You have these — they’re just not in this CV.">{rows(F.add)}</FindingGroup>
      <FindingGroup tone="good" icon="circle-check" title="Already strong" count="4" subtitle="Requirements your CV already shows." defaultOpen={false}>{rows(F.strong)}</FindingGroup>
      <FindingGroup tone="neutral" icon="minus" title="Not in your experience" count="1" subtitle="Nothing to fix — we won’t add things you haven’t done." defaultOpen={false}>{rows(F.gap)}</FindingGroup>
    </div>
    <div style={{ display:'grid', gap:16, position:'sticky', top:20 }}>
      <Card padding="sm">
        <div style={{ display:'flex', justifyContent:'space-around' }}><ScoreRing value={90} size={88} label="You vs the job" /><ScoreRing untested size={88} label="PDF readability" /></div>
        <p style={{ margin:'14px 0 0', fontSize:'.78rem', color:'var(--text-muted)', lineHeight:1.5 }}><b style={{ color:'var(--text-strong)' }}>You vs the job</b> uses everything you’ve confirmed. <b style={{ color:'var(--text-strong)' }}>This CV</b> (62) only counts what’s on the page. Readability is tested on the real PDF.</p>
        <div style={{ marginTop:10 }}><Button variant="ghost" size="sm" icon={how ? 'chevron-up' : 'chevron-down'} onClick={() => setHow(!how)}>How this is calculated</Button></div>
        {how && <div style={{ display:'grid', gap:12, marginTop:8 }}>
          <ProgressBar label="Tools & technical" valueLabel="2 of 3" value={2} max={3} />
          <ProgressBar label="Responsibilities" valueLabel="2 of 3" value={2} max={3} />
          <ProgressBar label="Experience" valueLabel="1 of 1" value={1} max={1} />
          <p style={{ margin:0, fontSize:'.72rem', color:'var(--text-muted)', lineHeight:1.5 }}>Required items count 3×, nice-to-haves 1×. Rewording alone never raises the score. This is an estimate, not an employer’s ATS or a hiring prediction.</p>
        </div>}
      </Card>
      <Card padding="sm" tone="sunken"><div style={{ fontSize:'.8rem', color:'var(--text-muted)', lineHeight:1.5 }}><b style={{ color:'var(--text-strong)', display:'block', marginBottom:4 }}>Northstar People</b>Business Systems Analyst — Automation<div style={{ marginTop:8, display:'flex', gap:6, flexWrap:'wrap' }}><Pill size="sm">6 required</Pill><Pill size="sm">2 nice to have</Pill></div></div></Card>
    </div>
    {ask && <Dialog title="Can you legally work in Romania?" onClose={() => setAsk(false)} footer={<><Button onClick={() => setAsk(false)}>Later</Button><Button variant="primary" onClick={() => { if (ans === 'yes') setRtw(true); setAsk(false); }}>Save answer</Button></>}><p style={{ margin:'0 0 16px', color:'var(--text-muted)' }}>We’ll note this for this job only. It isn’t added to your CV and doesn’t change your score.</p><RadioGroup value={ans} onChange={setAns} options={[{ value:'yes', label:'Yes', description:'Citizen, EU national or valid permit' },{ value:'no', label:'No', description:'We’ll flag it as a requirement gap' },{ value:'unsure', label:'Not sure', description:'We’ll keep reminding you' }]} /></Dialog>}
  </div>;
}
window.MatchReportScreen = MatchReportScreen;
