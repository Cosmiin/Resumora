window.CVZ_DATA = {
  user:{ name:'Mara Ionescu', first:'Mara' },
  job:{ title:'Business Systems Analyst — Automation', company:'Northstar People', city:'Bucharest · hybrid',
    ad:'Northstar People is hiring a Business Systems Analyst to automate HR and payroll workflows.\n\nRequired: process automation, SQL, REST APIs, stakeholder management, 4+ years in business/systems analysis, right to work in Romania.\nNice to have: HRIS experience (Workday or SAP SuccessFactors), Power BI.' },
  findings:{
    add:[
      { term:'REST APIs', required:true, state:'omitted', detail:'Payroll API project at BridgeWorks is in your Base CV, not this one.' },
      { term:'HR / payroll systems', required:false, state:'omitted', detail:'You automated payroll exports for 3 HR teams.' },
      { term:'Outcome of your automation work', required:true, state:'omitted', detail:'You confirmed it cut manual approvals — say so in the summary.' },
    ],
    check:[ { term:'Right to work in Romania', required:true, state:'confirm', detail:'The job requires it. We don’t know yet — your score doesn’t change either way.' } ],
    strong:[
      { term:'Process automation', required:true, state:'included', detail:'Two roles describe it.' },
      { term:'SQL', required:true, state:'included', detail:'Listed in technical skills and used at BridgeWorks.' },
      { term:'Stakeholder management', required:true, state:'equivalent', detail:'Your CV says “gestionarea părților interesate” — counted as the same.' },
      { term:'4+ years in analysis', required:true, state:'included', detail:'About 6 years, as of Oct 2026 (overlaps counted once).' },
    ],
    gap:[ { term:'Power BI', required:false, state:'gap', detail:'Not in your experience. Fine to leave out — it’s a nice-to-have.' } ],
  },
  changes:[
    { id:'sum', section:'Summary', source:'Uses confirmed facts', before:'Analyst with 6 years in HR operations and process improvement.', after:'Business systems analyst with 6 years automating HR and payroll workflows — from requirements to REST API integrations.', why:'Names automation and APIs, both required.' },
    { id:'api', section:'BridgeWorks · add bullet', source:'From your Base CV', after:'Automated payroll exports via REST APIs for 3 HR teams.', why:'Shows REST APIs and payroll — currently missing.' },
    { id:'out', section:'BridgeWorks · add bullet', source:'You confirmed this', after:'Replaced manual approval emails with a tracked workflow, so requests no longer got lost.', why:'Adds an outcome. No number — you said it wasn’t measured.' },
  ],
};
window.CVZ_cv = function(accepted){
  const D = window.CVZ_DATA.changes; const has = id => accepted.includes(id);
  const bw = ['Mapped approval workflows with stakeholders across finance and HR.','Wrote SQL reports used in monthly payroll reconciliation.'];
  if (has('api')) bw.unshift(D[1].after); if (has('out')) bw.push(D[2].after);
  return [
    { title:'Summary', text: has('sum') ? D[0].after : D[0].before },
    { title:'Experience', items:[
      { heading:'Systems Analyst — BridgeWorks', dates:'2021 — Present', sub:'Cluj-Napoca', bullets:bw },
      { heading:'HR Operations Specialist — Carpatia Retail', dates:'Mar 2019 — 2021', sub:'Cluj-Napoca', bullets:['Coordinated onboarding for 40+ hires per quarter.'] } ] },
    { title:'Skills', text:'Process automation · SQL · Requirements analysis · Gestionarea părților interesate · Excel' },
  ];
};
