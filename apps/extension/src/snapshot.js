/** Runs only in the isolated world after an explicit toolbar action. No network. */
export function capturePage() {
  if(location.href.length>2048)throw Error('Source link is too long. Use manual paste in Resumora.');
  const host=location.hostname;
  const adapters=[
    ['greenhouse',/(^|\.)greenhouse\.io$/,'#content, #main'],
    ['ashby',/^jobs\.ashbyhq\.com$/,'[class*="jobPosting"]'],
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
  const unrelated=el=>{
    const heading=el.matches('h1,h2,h3,[role="heading"]')?el:el.querySelector('h1,h2,h3,[role="heading"]');
    return /^(?:(?:recommended|related|similar|other|more|another)\s+(?:jobs?|roles?|opportunities)|recommended for you|jobs you (?:may|might) like|(?:your|my)\s+profile)\b/i.test((heading?.innerText??el.innerText??'').trim());
  };
  const read=roots=>{
    const lines=[];let length=0,nodes=0;
    const walk=node=>{
      for(const child of node.childNodes) {
        if(++nodes>20000||length>=120000)return;
        if(child.nodeType===Node.TEXT_NODE) {
          const t=child.textContent?.trim();if(t){lines.push(t);length+=t.length+1;}
        } else if(child.nodeType===Node.ELEMENT_NODE && !child.matches(excluded) && !unrelated(child) && visible(child))walk(child);
      }
    };
    for(const root of roots) {
      if(root!==document.body&&root!==document.documentElement&&visible(root)&&!root.closest(excluded)&&!unrelated(root))walk(root);
    }
    return lines.join('\n').slice(0,120000);
  };
  let posting;
  const visit=(value,depth=0)=>{
    if(depth>5||posting||!value||typeof value!=='object')return;
    if(Array.isArray(value)){value.slice(0,30).forEach(x=>visit(x,depth+1));return;}
    if(value['@type']==='JobPosting'||(Array.isArray(value['@type'])&&value['@type'].includes('JobPosting'))){posting=value;return;}
    if(value['@graph'])visit(value['@graph'],depth+1);
  };
  for(const script of Array.from(document.querySelectorAll('script[type="application/ld+json"]')).slice(0,10)) {
    if((script.textContent??'').length<=60000)try{visit(JSON.parse(script.textContent));}catch{}
  }
  const jobWords=/\b(job|role|required|preferred|responsibilit\w*|requirements|qualifications|hiring|employment|vacancy|candidate|cerin[țt]e|responsabilit\w*|angaj\w*|beneficii)\b/i;
  let text='';
  if(typeof posting?.description==='string') {
    const template=document.createElement('template');
    template.innerHTML=posting.description;
    template.content.querySelectorAll(excluded).forEach(el=>el.remove());
    template.content.querySelectorAll('br,hr').forEach(el=>el.replaceWith(document.createTextNode('\n')));
    template.content.querySelectorAll('p,div,li,ul,ol,dl,dt,dd,section,article,h1,h2,h3,h4,h5,h6,blockquote,pre,tr,td,th').forEach(el=>{
      el.prepend(document.createTextNode('\n'));
      el.append(document.createTextNode('\n'));
    });
    text=(template.content.textContent??'').trim().slice(0,120000);
  }
  const headings=Array.from(document.querySelectorAll('h1')).filter(visible);
  const heading=headings[0];
  const continuation=/\b(required|preferred|responsibilit\w*|requirements|qualifications|benefits|compensation|salary|about (?:this |the )?(?:job|role)|what (?:you|we)|cerin[țt]e|responsabilit\w*|beneficii)\b/i;
  const jobRoots=seed=>{
    let root=seed;
    if(root.matches('h1,h2,h3,p,[role="heading"]')&&root.parentElement!==document.body&&root.parentElement!==document.documentElement)root=root.parentElement;
    const owner=root.closest('section,article,main,[role="main"],.posting-page');
    if(owner?.matches('section,article'))root=owner;
    const roots=[root];
    if(root.matches('main,[role="main"],.posting-page'))return roots;
    for(let next=root.nextElementSibling,n=0;next&&n<30;next=next.nextElementSibling,n++) {
      if(!visible(next))continue;
      if(next.matches(excluded)||unrelated(next)||next.matches('h1'))break;
      const label=next.matches('h2,h3,[role="heading"]')?next:next.querySelector('h1,h2,h3,[role="heading"]');
      if(!next.matches('p,ul,ol,dl')&&!continuation.test(label?.innerText??next.innerText??''))break;
      roots.push(next);
    }
    return roots;
  };
  const selectors=[matched?.[2],'[itemprop="description"], #job-description, #jobDescriptionText, .job-description, [data-automation-id="jobPostingDescription"]','main, [role="main"], article'].filter(Boolean);
  for(const selector of selectors) {
    if(text.length>=80)break;
    for(const root of Array.from(document.querySelectorAll(selector)).slice(0,50)) {
      if(root===document.body||root===document.documentElement||!visible(root)||root.closest(excluded)||unrelated(root))continue;
      const candidate=read(jobRoots(root));
      if(candidate.length>=80){text=candidate;break;}
    }
  }
  if(text.length<80) {
    const anchors=[...(headings.length===1?headings:[]),...Array.from(document.querySelectorAll('h2,h3,[role="heading"],p')).slice(0,200).filter(el=>jobWords.test(el.innerText??''))];
    for(const anchor of anchors) {
      if(!visible(anchor)||anchor.closest(excluded)||unrelated(anchor))continue;
      const candidate=read(jobRoots(anchor));
      if(candidate.length>=80&&jobWords.test(candidate)){text=candidate;break;}
    }
  }
  if(text.length<80)throw Error('No readable job section. Open the full posting, wait for it to load, or paste the advert in Resumora. Embedded cross-origin frames require opening the original job page.');
  const structured=posting?JSON.stringify(posting):undefined;
  const title=(heading?.innerText??'').trim().slice(0,2000);
  const snapshot={text,sourceUrl:location.href,...(title?{title}:{}),...(structured&&structured.length<=60000?{structured}:{}),adapter,capturedAt:new Date().toISOString(),parserVersion:'1'};
  if(new TextEncoder().encode(JSON.stringify(snapshot)).length>260000)throw Error('Posting is too large. Paste the relevant job section in Resumora.');
  return snapshot;
}
