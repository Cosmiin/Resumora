/** Runs only in the isolated world after an explicit toolbar action. No network. */
export function capturePage() {
  if(location.href.length>2048)throw Error('Source link is too long. Use manual paste in Resumora.');
  const host=location.hostname;
  let adapter='generic', selector='main, [role="main"], article';
  if (/(^|\.)greenhouse\.io$/.test(host)) {adapter='greenhouse';selector='#content, #main, main';}
  else if(host==='jobs.ashbyhq.com') {adapter='ashby';selector='[class*="jobPosting"], main, [role="main"]';}
  else if(/(^|\.)linkedin\.com$/.test(host)) {adapter='linkedin';selector='.jobs-description, .show-more-less-html__markup, .job-view-layout';}
  else if(/(^|\.)bestjobs\.(eu|ro)$/.test(host)) {adapter='bestjobs';selector='[itemprop="description"], .job-description, main';}
  const visible = el=>el && !el.closest('[hidden], [aria-hidden="true"]') && getComputedStyle(el).display!=='none' && getComputedStyle(el).visibility!=='hidden' && el.getClientRects().length>0;
  const root=Array.from(document.querySelectorAll(selector)).find(el=>visible(el)&&(el.innerText??'').trim().length>=80);
  if(!root) throw Error('No readable job section. Open the full posting, wait for it to load, or paste the advert in Resumora. Embedded cross-origin frames require opening the original job page.');
  // Clone removes unrelated navigation/forms/comments without changing the live page.
  // Visible text comes from the rendered DOM; never submit hidden DOM or input values.
  const lines=[]; let length=0,nodes=0;
  const walk=node=> {
    if(length>120000) return;
    for(const child of node.childNodes) {
      if(++nodes>20000 || length>120000) return;
      if(child.nodeType===Node.TEXT_NODE) {const t=child.textContent?.trim();if(t){lines.push(t);length+=t.length+1;}}
      else if(child.nodeType===Node.ELEMENT_NODE && visible(child) && !child.matches('script,style,nav,header,footer,form,input,textarea,button,[role="navigation"],.comments,.jobs-similar-jobs')) walk(child);
    }
  };
  walk(root);
  const text=lines.join('\n').slice(0,120000);
  if(text.length<80) throw Error('Not enough visible job text. Use manual paste in Resumora.');
  let posting;
  const visit=(value,depth=0)=> {
    if(depth>5||posting||!value||typeof value!=='object') return;
    if(Array.isArray(value)) {value.slice(0,30).forEach(x=>visit(x,depth+1));return;}
    if(value['@type']==='JobPosting'||(Array.isArray(value['@type'])&&value['@type'].includes('JobPosting'))) {posting=value;return;}
    if(value['@graph']) visit(value['@graph'],depth+1);
  };
  for(const script of Array.from(document.querySelectorAll('script[type="application/ld+json"]')).slice(0,10)) {
    if((script.textContent??'').length<=60000) try{visit(JSON.parse(script.textContent));}catch{}
  }
  const structured=posting?JSON.stringify(posting):undefined;
  const heading=Array.from(document.querySelectorAll('h1')).find(visible);
  const title=(heading?.innerText??'').trim().slice(0,2000);
  const snapshot={text,sourceUrl:location.href.slice(0,2048),...(title?{title}:{}),...(structured&&structured.length<=60000?{structured}:{}),adapter,capturedAt:new Date().toISOString(),parserVersion:'1'};
  if(new TextEncoder().encode(JSON.stringify(snapshot)).length>260000) throw Error('Posting is too large. Paste the relevant job section in Resumora.');
  return snapshot;
}
