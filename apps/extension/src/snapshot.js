/** Runs only in the isolated world after an explicit toolbar action. No network. */
export function capturePage() {
  if(location.href.length>2048)throw Error('Source link is too long. Use manual paste in Resumora.');
  const host=location.hostname;
  const adapters=[
    ['greenhouse',/(^|\.)greenhouse\.io$/,'#content, #main'],
    ['ashby',/^jobs\.ashbyhq\.com$/,'[class*="jobPosting"], [data-testid="job-posting-description"]'],
    ['linkedin',/(^|\.)linkedin\.com$/,'.jobs-description, .show-more-less-html__markup, .job-view-layout'],
    ['bestjobs',/(^|\.)bestjobs\.(eu|ro)$/,'[itemprop="description"], .job-description'],
    ['lever',/(^|\.)lever\.co$/,'.posting-page, .section-wrapper'],
    ['workday',/(^|\.)myworkdayjobs\.com$/,'[data-automation-id="jobPostingDescription"]'],
    ['smartrecruiters',/(^|\.)smartrecruiters\.com$/,'#st-jobDescription, .job-sections'],
    ['icims',/(^|\.)icims\.com$/,'.iCIMS_JobContent, .iCIMS_JobDescription'],
    ['oracle',/(^|\.)(oraclecloud\.com|taleo\.net)$/,'[data-bind*="job.description"], .job-description, .jobdescr'],
    ['successfactors',/(^|\.)(successfactors\.(com|eu)|successfactors\.com\.cn)$/,'#jobdescription, .jobDisplay'],
    ['workable',/(^|\.)workable\.com$/,'[data-ui="job-description"]'],
    ['recruitee',/(^|\.)recruitee\.com$/,'[data-testid="job-description"], .job-description'],
    ['bamboohr',/(^|\.)bamboohr\.com$/,'[data-qa="job-description"], .BambooRichText'],
    ['personio',/(^|\.)personio\.(com|de)$/,'.job-description, .detail'],
    ['teamtailor',/(^|\.)teamtailor\.com$/,'#job-description, .job-description'],
    ['indeed',/(^|\.)indeed\.com$/,'#jobDescriptionText'],
  ];
  const matched=adapters.find(([,pattern])=>pattern.test(host));
  const adapter=matched?.[0]??'generic';
  const excluded='script,style,noscript,template,nav,header,footer,aside,form,input,textarea,select,button,[role="navigation"],[role="dialog"],[contenteditable],.comments,.jobs-similar-jobs,.recommendations,.recommended-jobs,.related-jobs,.similar-jobs,.user-profile';
  const visible=el=>{
    if(!el || el.closest('[hidden], [aria-hidden="true"]') || !el.getClientRects().length)return false;
    for(let node=el;node;node=node.parentElement) {
      const style=getComputedStyle(node);
      if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse')return false;
    }
    return true;
  };
  const read=roots=>{
    const lines=[];let length=0,nodes=0;
    const walk=node=>{
      for(const child of node.childNodes) {
        if(++nodes>20000||length>120000)throw Error('Posting exceeds capture limits. Select the relevant job text or paste it in Resumora; nothing was sent.');
        if(child.nodeType===Node.TEXT_NODE) {
          const t=child.textContent?.trim();if(t){lines.push(t);length+=t.length+1;}
        } else if(child.nodeType===Node.ELEMENT_NODE && !child.matches(excluded) && visible(child))walk(child);
      }
    };
    for(const root of roots)if(root!==document.body&&root!==document.documentElement&&visible(root)&&!root.closest(excluded))walk(root);
    if(length>120000)throw Error('Posting exceeds capture limits. Select relevant job text or paste it in Resumora; nothing was sent.');
    return lines.join('\n');
  };
  let posting;const postings=[];
  const visit=(value,depth=0)=>{
    if(depth>5||!value||typeof value!=='object')return;
    if(Array.isArray(value)){value.slice(0,30).forEach(x=>visit(x,depth+1));return;}
    if(value['@type']==='JobPosting'||(Array.isArray(value['@type'])&&value['@type'].includes('JobPosting'))){postings.push(value);return;}
    if(value['@graph'])visit(value['@graph'],depth+1);
  };
  for(const script of Array.from(document.querySelectorAll('script[type="application/ld+json"]')).slice(0,10)) {
    if((script.textContent??'').length<=60000)try{visit(JSON.parse(script.textContent));}catch{}
  }
  const selection=window.getSelection();
  let text='',selected=false;
  if(selection&&!selection.isCollapsed&&selection.rangeCount===1){
    // Only explicit user-selected visible text nodes; never form values or
    // unrelated frames. Reading Range.toString alone would include hidden data.
    const range=selection.getRangeAt(0),root=range.commonAncestorContainer;
    const iterator=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const nodes=root.nodeType===Node.TEXT_NODE?[root]:[];
    for(let n=iterator.nextNode();n;n=iterator.nextNode())nodes.push(n);
    const lines=[];
    for(const n of nodes){if(!range.intersectsNode(n)||!n.parentElement||n.parentElement.closest(excluded)||!visible(n.parentElement))continue;let value=n.textContent??'';if(n===range.endContainer)value=value.slice(0,range.endOffset);if(n===range.startContainer)value=value.slice(range.startOffset);if(value.trim())lines.push(value.trim());}
    text=lines.join('\n');selected=true;
  }
  if(postings.length>1&&!selected)throw Error('Multiple job postings detected. Select only the intended job text, then click Capture again, or paste it in Resumora. Nothing was sent.');
  posting=postings.length===1?postings[0]:undefined;
  // Structured fields are source metadata only; arbitrary JSON-LD extensions
  // and account/contact/application-form objects never enter the payload.
  const metadata=posting?Object.fromEntries(['@type','title','hiringOrganization','jobLocation','jobLocationType','applicantLocationRequirements','employmentType','baseSalary','datePosted','validThrough','skills','qualifications','experienceRequirements','educationRequirements','url'].filter(k=>posting[k]!==undefined).map(k=>[k,posting[k]])):undefined;
  if(metadata?.hiringOrganization)metadata.hiringOrganization={name:typeof posting.hiringOrganization?.name==='string'?posting.hiringOrganization.name:undefined};
  const scrub=(v,depth=0)=>{
    if(depth>5)return undefined;
    if(typeof v==='string')return v.length<=4000&&!/<(?:form|input|script|textarea)\b/i.test(v)?v:undefined;
    if(typeof v==='number'||typeof v==='boolean'||v===null)return v;
    if(Array.isArray(v))return v.slice(0,30).map(x=>scrub(x,depth+1)).filter(x=>x!==undefined);
    if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).filter(([k])=>['@type','name','address','addressLocality','addressRegion','addressCountry','currency','value','minValue','maxValue','unitText'].includes(k)).map(([k,x])=>[k,scrub(x,depth+1)]).filter(([,x])=>x!==undefined));
    return undefined;
  };
  if(metadata)for(const key of Object.keys(metadata))metadata[key]=scrub(metadata[key]);
  const headings=Array.from(document.querySelectorAll('h1')).filter(visible),heading=headings.length===1?headings[0]:undefined;
  if(!selected){
    const selectors=[matched?.[2],'[itemprop="description"], #job-description, #jobDescriptionText, .job-description, [data-automation-id="jobPostingDescription"]'].filter(Boolean);
    for(const selector of selectors){
      const roots=Array.from(document.querySelectorAll(selector)).filter(root=>visible(root)&&!root.closest(excluded));
      const outer=roots.filter(root=>!roots.some(other=>other!==root&&other.contains(root)));
      if(outer.length>1)throw Error('The job content is split or ambiguous. Select the complete intended job text, then click Capture again. Nothing was sent.');
      if(outer.length===1){text=read(outer);if(text.length>=80)break;}
    }
    if(text.length<80&&typeof posting?.description==='string'){
      const template=document.createElement('template');template.innerHTML=posting.description;
      template.content.querySelectorAll(excluded).forEach(el=>el.remove());
      template.content.querySelectorAll('br,hr').forEach(el=>el.replaceWith(document.createTextNode('\n')));
      template.content.querySelectorAll('p,div,li,ul,ol,dl,dt,dd,section,article,h1,h2,h3,h4,h5,h6,blockquote,pre,tr,td,th').forEach(el=>{el.prepend(document.createTextNode('\n'));el.append(document.createTextNode('\n'));});
      text=(template.content.textContent??'').trim();
    }
    if(posting?.title&&heading&&!String(posting.title).toLocaleLowerCase().includes(heading.innerText.trim().toLocaleLowerCase())&&!heading.innerText.trim().toLocaleLowerCase().includes(String(posting.title).toLocaleLowerCase()))throw Error('Structured and visible job titles disagree. Select the intended job text or paste it in Resumora for review. Nothing was sent.');
  }
  if(text.length>120000)throw Error('Posting exceeds capture limits. Select relevant job text or paste it in Resumora; nothing was sent.');
  if(text.length<80)throw Error('No readable job section. Open the full posting, wait for it to load, or paste the advert in Resumora. Embedded cross-origin frames require opening the original job page.');
  const structured=metadata&&!selected?JSON.stringify(metadata):undefined;
  const title=(heading?.innerText??'').trim().slice(0,2000);
  const snapshot={text,sourceUrl:location.href,...(title?{title}:{}),...(structured&&structured.length<=60000?{structured}:{}),adapter,capturedAt:new Date().toISOString(),parserVersion:'1'};
  if(new TextEncoder().encode(JSON.stringify(snapshot)).length>260000)throw Error('Posting is too large. Paste the relevant job section in Resumora.');
  return snapshot;
}
