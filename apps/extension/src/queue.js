/** Injected storage/transport: survives popup closure and Worker recreation. */
export function createQueue({read,write,send,status,connection,now=Date.now,id=()=>crypto.randomUUID()}) {
  const sending=new Set();
  let chain=Promise.resolve();
  const locked=fn=>{const next=chain.then(fn);chain=next.catch(()=>{});return next;};
  async function rows(){const all=await read(),live=all.filter(row=>now()-row.queuedAt<86400000);if(live.length!==all.length)await write(live);return live;}
  return {
    changeConnection:update=>locked(update),
    list:()=>locked(async()=> (await rows()).map(({payload,...row})=>row)),
    enqueue:async(payload,expected)=> {
      let fingerprint,reconciled;
      for(;;) {
        const result=await locked(async()=> {
          const q=await rows(),c=await connection();
          if(!expected||!c||c.userId!==expected.userId||c.generation!==expected.generation)throw Error('Connection changed during capture. Capture again with the connected account.');
          // Selected postings can share a URL. Ignore only the extraction time.
          if(!fingerprint){
            const content=JSON.stringify([payload.sourceUrl,payload.text,payload.title??'',payload.structured??'',payload.parserVersion]);
            fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(content))),byte=>byte.toString(16).padStart(2,'0')).join('');
          }
          const existing=q.find(row=>row.owner===expected.userId&&row.generation===expected.generation&&row.fingerprint===fingerprint);
          if(existing?.receipt&&!existing.payload){
            if(reconciled?.requestId!==existing.requestId)return {candidate:existing.requestId,connection:c};
            if(reconciled.deleted)q.splice(q.indexOf(existing),1); // Keep the server deletion fence; retire only this local receipt.
            else {
              existing.receipt=reconciled.receipt;existing.state=reconciled.receipt.state;delete existing.message;
              await write(q);return {requestId:existing.requestId};
            }
          }else if(existing)return {requestId:existing.requestId};
          if(q.filter(x=>x.payload).length>=10) throw Error('Ten captures are waiting. Retry or discard them before capturing more.');
          const title=(payload.title?.trim()||payload.text?.split('\n').find(line=>line.trim())?.trim()||'Job posting').slice(0,160);
          const requestId=id();q.push({requestId,payload,fingerprint,title,sourceUrl:payload.sourceUrl,owner:expected.userId,generation:expected.generation,queuedAt:now(),attempts:0,nextAt:0,state:'queued'});
          await write([...q.filter(x=>x.payload),...q.filter(x=>!x.payload).slice(-20)].sort((a,b)=>a.queuedAt-b.queuedAt));return {requestId};
        });
        if(result.requestId)return result.requestId;
        // Network reconciliation must not hold the storage/connection lock.
        // Only the explicit deletion fence (410) permits a fresh request.
        try {
          const receipt=await status(result.candidate,result.connection);
          if(receipt?.requestId!==result.candidate||typeof receipt.jobId!=='string'||!['received','processing','ready','failed'].includes(receipt.state))throw Error('Invalid receipt');
          reconciled={requestId:result.candidate,receipt};
        }catch(error){
          if(error?.status!==410)throw Error('Unable to verify the saved job. Retry capture when connected; no duplicate was created.');
          reconciled={requestId:result.candidate,deleted:true};
        }
        // Re-read the row and pinned identity before reusing or replacing it.
      }
    },
    retry:requestId=>locked(async()=>{
      const q=await rows(),c=await connection(),row=q.find(x=>x.requestId===requestId);
      if(!row||!c||row.owner!==c.userId) throw Error('Reconnect the original account to reconcile this request.');
      row.generation=c.generation;row.attempts=0;row.nextAt=0;if(row.payload)row.state='queued';
      await write(q);
    }),
    discard:requestId=>locked(async()=>write((await rows()).filter(x=>x.requestId!==requestId))),
    flush:async()=> {
      const pending=await locked(rows);
      for(const item of pending) {
        if(sending.has(item.requestId))continue;
        sending.add(item.requestId);
        try {
        const row=await locked(async()=> (await rows()).find(x=>x.requestId===item.requestId));
        if(!row)continue;
        const patch=async()=>locked(async()=>{
          const current=await rows(),at=current.findIndex(x=>x.requestId===row.requestId);
          if(at>=0){current[at]=row;await write(current);}
        });
        const c=await connection();
        if(!c||row.owner!==c.userId||row.generation!==c.generation) {row.message='Connection changed. Reconnect the original account and explicitly retry, or discard.';await patch();continue;}
        if(row.nextAt>now()||(row.payload&&row.attempts>=3))continue;
        if(!row.payload) {
          if(!['received','processing'].includes(row.state))continue;
          try {const receipt=await status(row.requestId,c);if(receipt){row.state=receipt.state;row.receipt=receipt;delete row.message;}}catch{row.message='Status unavailable. Saved receipt retained.';}
          row.nextAt=now()+60000;await patch();continue;
        }
        row.attempts++;row.nextAt=now()+Math.min(60000*2**(row.attempts-1),300000);
        await patch(); // Persist attempt before network; a killed worker can safely retry the same ID.
        try {
          const receipt=await send({requestId:row.requestId,snapshot:row.payload},c);
          // Persisted per-request response cannot overwrite a newer capture's result.
          row.receipt=receipt;row.state=receipt.state;delete row.payload;delete row.message;
        }catch(error){row.state='queued';row.message=error?.message??'Not acknowledged. Retry the same request.';if([400,401,403,409,413,422].includes(error?.status))row.attempts=3;}
        await patch();
        } finally {sending.delete(item.requestId);}
      }
    },
  };
}
