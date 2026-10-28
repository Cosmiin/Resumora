const $=id=>document.getElementById(id);
async function call(message){const result=await chrome.runtime.sendMessage(message);if(!result?.ok)throw Error(result?.error??'Capture unavailable. Open Resumora and paste manually.');return result;}
function notice(text){$('message').textContent=text;}
async function update(){
  const state=await call({type:'state'});
  $('connect').hidden=state.connected;$('capture').hidden=!state.connected;$('disconnect').hidden=!state.connected;
  $('review').href=state.appOrigin+'/#jobs';$('queue').replaceChildren();
  for(const row of state.rows??[]){
    const li=document.createElement('li'),label=document.createElement('span');
    label.textContent=row.receipt?`Saved · ${row.state} · ${row.requestId.slice(0,8)}`:`Not yet acknowledged · ${row.requestId.slice(0,8)} · ${row.message??'queued for delivery'}`;li.append(label);
    if(row.message||row.attempts>=3){const retry=document.createElement('button');retry.textContent='Retry / reconcile same request';retry.onclick=()=>run(async()=>{await call({type:'retry',requestId:row.requestId});notice('Retry queued. Waiting for server acknowledgement.');});li.append(retry);}
    const discard=document.createElement('button');discard.textContent=row.receipt?'Dismiss receipt':'Discard local pending capture';discard.onclick=()=>run(()=>call({type:'discard',requestId:row.requestId}));li.append(discard);$('queue').append(li);
  }
  return state;
}
async function run(fn){try{await fn();await update();}catch(e){notice(e.message);}}
async function capture(){notice('Taking a snapshot…');const result=await call({type:'capture'});notice('Queued locally · '+result.requestId.slice(0,8)+'. Waiting for durable server acknowledgement. You can move to another job.');}
$('connect').onclick=()=>run(async()=>{await call({type:'connect'});notice('Connected. Click the toolbar on a job to save it.');});
$('disconnect').onclick=()=>run(async()=>{await call({type:'disconnect'});notice('Disconnected. Pending captures stay local until explicitly retried with the original account.');});
$('capture').onclick=()=>run(capture);
await run(async()=>{const state=await update();if(state.connected)await capture();else notice('Connect your existing Resumora account first.');});
setInterval(()=>{void run(update);},1500);
