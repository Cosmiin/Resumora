import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {capturePage} from '../src/snapshot.js';
const job='Build useful synthetic reports. Required SQL and English. Preferred analytics experience. Stated salary EUR 1000 per month.';
function extract(url,markup){
  const dom=new JSDOM(markup,{url,runScripts:'outside-only'});
  // jsdom has no layout; this synthetic visibility model is not installed-Chrome proof.
  dom.window.HTMLElement.prototype.getClientRects=function(){return this.hidden?[]:[{width:100,height:30}];};
  Object.defineProperty(dom.window.HTMLElement.prototype,'innerText',{get(){return this.textContent;}});
  dom.window.TextEncoder=TextEncoder;
  return dom.window.eval('('+capturePage.toString()+')()');
}
for(const [url,adapter,section] of [['https://boards.greenhouse.io/co/jobs/1','greenhouse','<div id="content">'],['https://jobs.ashbyhq.com/co/1','ashby','<main>'],['https://www.linkedin.com/jobs/view/1','linkedin','<div class="jobs-description">'],['https://www.bestjobs.eu/job/one','bestjobs','<div class="job-description">'],['https://other.invalid/job','generic','<article>']]) {
  test('synthetic rendered '+adapter,()=>{
    const result=extract(url,'<h1>Analyst</h1>'+section+'<p>'+job+'</p><nav>SECRET NAVIGATION</nav><form><input value="password"><p>PRIVATE FORM</p></form><p hidden>HIDDEN DATA</p><div class="comments">PROFILE COMMENT</div></div></main></article>');
    assert.equal(result.adapter,adapter);assert.equal(result.title,'Analyst');assert.ok(result.text.includes(job));assert.ok(!/SECRET|PRIVATE|HIDDEN|PROFILE|password/.test(result.text));assert.equal(result.sourceUrl,url);
  });
}
test('JSON-LD stays serialized data; malicious job text never executes; unknown fields omitted',()=>{
  const post={'@type':'JobPosting',title:'Analyst',hiringOrganization:{name:'Synthetic Co'},baseSalary:{currency:'EUR',value:{minValue:1000}},skills:'SQL'};
  const result=extract('https://jobs.ashbyhq.com/co/1','<main><p>'+job+'&lt;script&gt;globalThis.pwned=true&lt;/script&gt;</p></main><script type="application/ld+json">'+JSON.stringify(post)+'</script>');
  assert.equal(JSON.parse(result.structured).skills,'SQL');assert.ok(result.text.includes('<script>'));assert.equal(result.company,undefined);assert.equal(globalThis.pwned,undefined);
});
test('unreadable/dynamic/iframe-only pages fail with manual recovery instead of body scrape',()=>{
  for(const markup of ['<body>private unrelated full page</body>','<main></main>','<iframe src="https://other.invalid/job"></iframe>'])assert.throws(()=>extract('https://example.invalid',markup),/paste|Embedded/i);
});
