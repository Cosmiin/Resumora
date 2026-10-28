import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {parseCapture} from '../../../packages/contracts/src/jobs/capture.ts';
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
for(const [url,adapter,section] of [['https://boards.greenhouse.io/co/jobs/1','greenhouse','<div id="content">'],['https://jobs.ashbyhq.com/co/1','ashby','<main>'],['https://www.linkedin.com/jobs/view/1','linkedin','<div class="jobs-description">'],['https://www.bestjobs.eu/job/one','bestjobs','<div class="job-description">'],['https://jobs.lever.co/co/1','lever','<div class="posting-page">'],['https://co.wd3.myworkdayjobs.com/en-US/jobs/job/one','workday','<div data-automation-id="jobPostingDescription">'],['https://jobs.smartrecruiters.com/co/1','smartrecruiters','<div id="st-jobDescription">'],['https://careers-co.icims.com/jobs/1','icims','<div class="iCIMS_JobContent">'],['https://co.fa.oraclecloud.com/hcmUI/job/1','oracle','<div class="job-description">'],['https://co.taleo.net/careersection/jobdetail.ftl','oracle','<div class="jobdescr">'],['https://co.successfactors.eu/job/1','successfactors','<div id="jobdescription">'],['https://apply.workable.com/co/1','workable','<div data-ui="job-description">'],['https://co.recruitee.com/o/one','recruitee','<div data-testid="job-description">'],['https://co.bamboohr.com/careers/1','bamboohr','<div class="BambooRichText">'],['https://co.jobs.personio.de/job/1','personio','<div class="detail">'],['https://co.teamtailor.com/jobs/1','teamtailor','<div id="job-description">'],['https://www.indeed.com/viewjob?jk=1','indeed','<div id="jobDescriptionText">'],['https://other.invalid/job','generic','<article>']]) {
  test('synthetic rendered '+adapter,()=>{
    const result=extract(url,'<h1>Analyst</h1>'+section+'<p>'+job+'</p><nav>SECRET NAVIGATION</nav><form><input value="password"><p>PRIVATE FORM</p></form><p hidden>HIDDEN DATA</p><div class="comments">PROFILE COMMENT</div></div></main></article>');
    assert.equal(result.adapter,adapter);assert.equal(result.title,'Analyst');assert.ok(result.text.includes(job));assert.ok(!/SECRET|PRIVATE|HIDDEN|PROFILE|password/.test(result.text));assert.equal(result.sourceUrl,url);assert.equal(parseCapture({requestId:'11111111-1111-4111-8111-111111111111',snapshot:JSON.parse(JSON.stringify(result))}).snapshot.adapter,adapter);
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

test('unknown hosts capture job-focused containers and heading siblings without main/article',()=>{
  for(const markup of [
    '<div><h1>Analyst</h1><div><p>'+job+'</p></div><nav>PRIVATE NAV</nav><div style="display:none"><p>SECRET ANCESTOR</p></div></div>',
    '<h1>Analyst</h1><p>'+job+'</p><footer>PRIVATE FOOTER</footer>',
    '<div><h2>Job responsibilities</h2><p>'+job+'</p></div>',
    '<p>Job responsibilities: '+job+'</p>',
  ]) {
    const result=extract('https://careers.unknown.invalid/opening',markup);
    assert.equal(result.adapter,'generic');assert.ok(result.text.includes(job));assert.ok(!/PRIVATE|SECRET/.test(result.text));
  }
});
test('JobPosting description works without rendered containers, including graph and type arrays',()=>{
  const post={'@type':['Thing','JobPosting'],title:'Analyst',description:'<p>'+job+'</p><script>globalThis.pwned=true</script><form>PRIVATE FORM</form>',jobLocation:{address:{addressLocality:'Bucharest'}}};
  const result=extract('https://unknown.invalid/job','<div>Loading</div><script type="application/ld+json">'+JSON.stringify({'@graph':[post]}).replace(/</g,'\\u003c')+'</script>');
  assert.ok(result.text.includes(job));assert.ok(!/pwned|PRIVATE/.test(result.text));assert.equal(JSON.parse(result.structured).jobLocation.address.addressLocality,'Bucharest');
});
test('generic fallback excludes unrelated and nonvisible content and keeps text bounded',()=>{
  for(const markup of [
    '<h1>Sign in</h1><form><p>'+job+'</p><input value="PRIVATE"></form>',
    '<div style="display:none"><div class="job-description">'+job+'</div></div>',
    '<nav><h2>Job responsibilities</h2><p>'+job+'</p></nav>',
  ])assert.throws(()=>extract('https://unknown.invalid',markup),/paste/i);
  const result=extract('https://unknown.invalid/job','<div><h1>Analyst</h1><p>Job responsibilities: '+('x'.repeat(130000))+'</p></div>');
  assert.equal(result.text.length,120000);
});

test('job titles in rendered headers and non-English main sections retain the ordinary capture path',()=>{
  const text='Développeur logiciel. Vous concevez des logiciels et accompagnez notre équipe sur des projets internationaux.';
  const result=extract('https://unknown.invalid/job','<main><header><h1>Développeur logiciel</h1></header><p>'+text+'</p></main>');
  assert.equal(result.title,'Développeur logiciel');assert.ok(result.text.includes(text));
});
