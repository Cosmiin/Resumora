function App() {
  const { SideNav, TopBar, Stepper, IconButton, Button, Toast, Pill, Logo } = window.CVizatDesignSystem_0f8e2e;
  const saved = JSON.parse(localStorage.getItem('rz-kit') || '{}');
  const [view, setView] = React.useState(saved.view || 'home');
  const [step, setStep] = React.useState(saved.step || 0);
  const [accepted, setAccepted] = React.useState(['sum','api','out']);
  const [rtw, setRtw] = React.useState(false);
  const [applied, setApplied] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  React.useEffect(() => { localStorage.setItem('rz-kit', JSON.stringify({ view, step })); }, [view, step]);
  const flash = m => { setToast(m); setTimeout(() => setToast(null), 2600); };
  const steps = ['Add job','See your match','Improve CV','Download'];
  if (view === 'flow') return <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column' }}>
    <TopBar back={<><IconButton icon="x" label="Exit to Home" onClick={() => setView('home')} /><Logo variant="mark" size={28} /></>} title="Northstar People" right={<Button size="sm" onClick={() => setView('home')}>Save & exit</Button>}><Stepper steps={steps} current={step} onStepClick={setStep} /></TopBar>
    <main style={{ flex:1, padding:'36px 44px 60px' }}>
      {step === 0 && <AddJobScreen onDone={() => setStep(1)} />}
      {step === 1 && <MatchReportScreen rtw={rtw} setRtw={setRtw} onNext={() => setStep(2)} />}
      {step === 2 && <ImproveScreen accepted={accepted} setAccepted={setAccepted} onNext={base => { setStep(3); flash(base ? 'Saved — Base CV is now v4' : 'Saved — Base CV unchanged'); }} />}
      {step === 3 && <DownloadScreen accepted={accepted} rtw={rtw} onSent={() => { setApplied(true); setView('home'); setStep(0); flash('Marked as sent. Good luck, Mara!'); }} />}
    </main>
    {toast && <Toast action="Undo" onAction={() => setToast(null)}>{toast}</Toast>}
  </div>;
  return <div style={{ display:'flex', minHeight:'100vh' }}>
    <SideNav value="home" items={[{ value:'home', label:'Home', icon:'house' },{ value:'cv', label:'My CV', icon:'file-user' },{ value:'jobs', label:'Jobs', icon:'briefcase', badge:'2' },{ value:'account', label:'Account', icon:'circle-user' }]} footer={<div style={{ padding:'0 12px', fontSize:'.72rem', color:'var(--text-muted)' }}>resumora.ro · demo data</div>} />
    <main style={{ flex:1, padding:'36px 44px 60px', minWidth:0 }}><HomeScreen applied={applied} onStart={() => { setView('flow'); setStep(applied ? 3 : 0); }} /></main>
    {toast && <Toast icon="party-popper">{toast}</Toast>}
  </div>;
}
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
