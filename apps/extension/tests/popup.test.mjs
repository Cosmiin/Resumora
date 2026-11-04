import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
const source=await readFile(new URL('../src/popup.js',import.meta.url),'utf8');
const html=await readFile(new URL('../popup.html',import.meta.url),'utf8');
async function popup(sendMessage){
  const dom=new JSDOM(html),timers=[];
  const context=vm.createContext({document:dom.window.document,chrome:{runtime:{sendMessage}},setInterval:fn=>timers.push(fn),URL});
  const done=vm.runInContext(`(async()=>{${source}\n})()`,context);
  return {document:dom.window.document,done,refresh:()=>timers[0]?.(),close:()=>dom.window.close()};
}
const settled=()=>new Promise(resolve=>setImmediate(resolve));
test('toolbar open and an overlapping capture click send one capture; polling only refreshes the saved receipt',async()=>{
  let captures=0,release;const gate=new Promise(resolve=>release=resolve);
  const row={requestId:'request-one',title:'Senior engineer',sourceUrl:'https://example.invalid/job',state:'ready',receipt:{jobId:'job-one'}};
  const p=await popup(async message=>{
    if(message.type==='state')return {ok:true,connected:true,appOrigin:'http://127.0.0.1:15173',rows:captures?[row]:[]};
    if(message.type==='capture'){captures++;await gate;return {ok:true,requestId:'request-one'};}
    assert.fail('Unexpected action '+message.type);
  });
  try{
    await settled();
    const button=p.document.getElementById('capture');
    // Invoke the handler directly as well as checking native disabled behavior.
    const overlap=button.onclick();release();await Promise.all([p.done,overlap]);
    assert.equal(captures,1);assert.equal(button.hidden,true);
    const links=[...p.document.querySelectorAll('a')];
    assert.ok(links.some(link=>link.href==='http://127.0.0.1:15173/#/jobs/job-one'&&/Open saved job/i.test(link.textContent)));
    assert.match(p.document.getElementById('queue').textContent,/Senior engineer/);
    assert.match(p.document.getElementById('queue').textContent,/example.invalid/);
    assert.equal(p.document.getElementById('review').href,'http://127.0.0.1:15173/#/jobs');
    p.refresh();await settled();assert.equal(captures,1);
  }finally{p.close();}
});
test('capture errors remain visible through polling and expose an explicit retry',async()=>{
  let captures=0;
  const p=await popup(async message=>message.type==='state'?{ok:true,connected:true,appOrigin:'http://127.0.0.1:15173',rows:[]}:(captures++,{ok:false,error:'Select one complete advert.'}));
  try{
    await p.done;const button=p.document.getElementById('capture');
    assert.equal(button.hidden,false);assert.match(button.textContent,/Retry/i);
    p.refresh();await settled();assert.match(p.document.getElementById('message').textContent,/Select one complete advert/);
    await button.onclick();assert.equal(captures,2);
  }finally{p.close();}
});
