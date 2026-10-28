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
  const excluded='script,style,noscript,template,nav,header,footer,aside,form,input,textarea,select,button,[role="navigation"],[role="dialog"],[contenteditable],.comments,.jobs-similar-jobs';
  const visible=el=>{
    if(!el || el.closest('[hidden], [aria-hidden="true"]') || !el.getClientRects().length)return false;
    for(let node=el;node;node=node.parentElement) {
      const style=getComputedStyle(node);
      if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse')return false;
    }
    return true;
  };
  const read=root=>{
    const lines=[];let length=0,nodes=0;
    const walk=node=>{
      for(const child of node.childNodes) {
        if(++nodes>20000||length>=120000)return;
        if(child.nodeType===Node.TEXT_NODE) {
          const t=child.textContent?.trim();if(t){lines.push(t);length+=t.length+1;}
        } else if(child.nodeType===Node.ELEMENT_NODE && !child.matches(excluded) && visible(child))walk(child);
      }
    };
    if(visible(root)&&!root.closest(excluded))walk(root);
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
    text=(template.content.textContent??'').trim().slice(0,120000);
  }
  const selectors=[matched?.[2],'[itemprop="description"], #job-description, #jobDescriptionText, .job-description, [data-automation-id="jobPostingDescription"]','main, [role="main"], article'].filter(Boolean);
  for(const selector of selectors) {
    if(text.length>=80)break;
    for(const root of Array.from(document.querySelectorAll(selector)).slice(0,50)) {
      const candidate=read(root);
      if(candidate.length>=80){text=candidate;break;}
    }
  }
  const headings=Array.from(document.querySelectorAll('h1')).filter(visible);
  const heading=headings[0];
  if(text.length<80) {
    const anchors=headings.length===1?headings:Array.from(document.querySelectorAll('h2, h3, [role="heading"], p')).slice(0,200).filter(el=>visible(el)&&!el.closest(excluded)&&jobWords.test(el.innerText??''));
    for(const anchor of anchors.slice(0,20)) {
      if(anchor.closest(excluded))continue;
      const ownText=read(anchor);
      if(ownText.length>=80&&jobWords.test(ownText)){text=ownText;break;}
      for(let root=anchor.parentElement;root&&root!==document.body&&root!==document.documentElement;root=root.parentElement) {
        const candidate=read(root);
        if(candidate.length>=80&&jobWords.test(candidate)){text=candidate;break;}
      }
      if(text.length>=80)break;
    }
    if(text.length<80&&headings.length===1) {
      const parts=[read(heading)];
      let length=parts[0].length;
      for(let next=heading.nextElementSibling,n=0;next&&n<30&&length<120000;next=next.nextElementSibling,n++) {
        if(next.matches('h1,nav,header,footer,aside,form,[role="navigation"]'))break;
        const part=read(next);parts.push(part);length+=part.length+1;
      }
      const candidate=parts.join('\n').slice(0,120000);
      if(jobWords.test(candidate))text=candidate;
    }
  }
  if(text.length<80)throw Error('No readable job section. Open the full posting, wait for it to load, or paste the advert in Resumora. Embedded cross-origin frames require opening the original job page.');
  const structured=posting?JSON.stringify(posting):undefined;
  const title=(heading?.innerText??'').trim().slice(0,2000);
  const snapshot={text,sourceUrl:location.href,...(title?{title}:{}),...(structured&&structured.length<=60000?{structured}:{}),adapter,capturedAt:new Date().toISOString(),parserVersion:'1'};
  if(new TextEncoder().encode(JSON.stringify(snapshot)).length>260000)throw Error('Posting is too large. Paste the relevant job section in Resumora.');
  return snapshot;
}
