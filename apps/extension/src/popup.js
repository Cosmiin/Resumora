const $=id=>document.getElementById(id);
let capturePending=false,captureFailed=false,currentRequest;
async function call(message){const result=await chrome.runtime.sendMessage(message);if(!result?.ok)throw Error(result?.error??'Capture unavailable. Open Resumora and paste manually.');return result;}
function notice(text){$('message').textContent=text;}
function postingLabel(row){
  let host='';try{host=new URL(row.sourceUrl).hostname;}catch{}
  return [row.title??'Job posting',host].filter(Boolean).join(' · ');
}
async function update(){
  const state=await call({type:'state'});
  $('connect').hidden=state.connected;$('capture').hidden=!state.connected||!captureFailed;$('disconnect').hidden=!state.connected;
  $('capture').disabled=capturePending;
  $('review').href=state.appOrigin+'/#/jobs';$('queue').replaceChildren();
  for(const row of [...(state.rows??[])].reverse()){
    const li=document.createElement('li'),label=document.createElement('span');
    label.textContent=`${postingLabel(row)} — ${row.receipt?`Saved · ${row.state}`:`Not yet saved · ${row.message??'queued for delivery'}`}`;li.append(label);
    if(row.receipt?.jobId){
      const open=document.createElement('a');open.textContent='Open saved job';open.href=state.appOrigin+'/#/jobs/'+encodeURIComponent(row.receipt.jobId);open.target='_blank';open.rel='noreferrer';li.append(open);
    }
    if(row.message||(!row.receipt&&row.attempts>=3)){const retry=document.createElement('button');retry.textContent='Retry / reconcile same request';retry.onclick=()=>run(async()=>{await call({type:'retry',requestId:row.requestId});notice('Retry queued. Waiting for server acknowledgement.');});li.append(retry);}
    const discard=document.createElement('button');discard.textContent=row.receipt?'Dismiss receipt':'Discard local pending capture';discard.onclick=()=>run(()=>call({type:'discard',requestId:row.requestId}));li.append(discard);$('queue').append(li);
    if(row.requestId===currentRequest&&row.receipt)notice(`Saved · ${postingLabel(row)}. Open the saved job below to review it.`);
  }
  return state;
}
async function run(fn){try{await fn();await update();}catch(e){notice(e.message);}}
async function capture(){
  // Popup-open capture and rapid clicks are one action. A successful capture
  // has an open-job link; only a failed extraction offers another attempt.
  if(capturePending||currentRequest)return;
  capturePending=true;captureFailed=false;$('capture').hidden=true;$('capture').disabled=true;
  notice('Taking a snapshot…');
  try{
    const result=await call({type:'capture'});currentRequest=result.requestId;
    notice('Queued locally. Waiting for server acknowledgement. You can move to another job.');
  }catch(error){captureFailed=true;throw error;}
  finally{capturePending=false;$('capture').disabled=false;$('capture').hidden=!captureFailed;}
}
$('connect').onclick=()=>run(async()=>{await call({type:'connect'});notice('Connected. Click the toolbar on a job to save it.');});
$('disconnect').onclick=()=>run(async()=>{await call({type:'disconnect'});notice('Disconnected. Pending captures stay local until explicitly retried with the original account.');});
$('capture').onclick=()=>run(capture);
await run(async()=>{const state=await update();if(state.connected)await capture();else notice('Connect your existing Resumora account first.');});
setInterval(()=>{void run(update);},1500);
