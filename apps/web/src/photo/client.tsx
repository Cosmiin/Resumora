import { createContext, useContext, useEffect, useState } from 'react';
import type { AuthTransport } from '../auth/AuthShell';
export interface PhotoClient {
  upload(blob:Blob,requestId:string):Promise<{id:string}>;
  read(id:string):Promise<Blob>;
  delete(id:string):Promise<void>;
  subscribe(listener:(id:string)=>void):()=>void;
  cleanup():Promise<void>;
}
export const PhotoContext=createContext<PhotoClient|null>(null);
export function createPhotoClient(transport:AuthTransport):PhotoClient {
  const listeners=new Set<(id:string)=>void>();
  const path=(id:string)=>`/v1/photos/${encodeURIComponent(id)}`;
  async function check(response:Response){if(!response.ok){const data=await response.json().catch(()=>null);throw new Error(data?.error?.code??'photoUnavailable');}return response;}
  return {
    async upload(blob,id){const response=await check(await transport('/v1/photos',{method:'POST',headers:{'Content-Type':blob.type,'X-Request-Id':id},body:blob}));return (await response.json()).asset;},
    async read(id){return (await check(await transport(path(id)))).blob();},
    async delete(id){
      // A failed physical purge can still mean access was revoked. Clear rendered
      // images immediately and let an explicit retry finish the same tombstone.
      listeners.forEach(fn=>fn(id));
      try{await check(await transport(path(id),{method:'DELETE'}));}
      finally{listeners.forEach(fn=>fn(id));}
    },
    subscribe(fn){listeners.add(fn);return()=>{listeners.delete(fn);};},
    async cleanup(){await check(await transport('/v1/photos/cleanup',{method:'POST'}));},
  };
}
export function usePhotoUrl(id:string|undefined) {
  const [attempt,setAttempt]=useState(0);
  const client=useContext(PhotoContext),[value,setValue]=useState<{id:string;url:string;unavailable:boolean}>({id:'',url:'',unavailable:false});
  useEffect(()=>{
    if(!client||!id)return;
    let active=true,invalidated=false,url='';
    const unsubscribe=client.subscribe(deleted=>{if(deleted===id){invalidated=true;if(url)URL.revokeObjectURL(url);url='';if(active)setValue({id,url:'',unavailable:true});}});
    client.read(id).then(blob=>{if(active&&!invalidated){url=URL.createObjectURL(blob);setValue({id,url,unavailable:false});}},()=>{if(active)setValue({id,url:'',unavailable:true});});
    return()=>{active=false;unsubscribe();if(url)URL.revokeObjectURL(url);};
  },[client,id,attempt]);
  return {...(value.id===id?value:{id:id??'',url:'',unavailable:!!id&&!client}),retry:()=>setAttempt(n=>n+1)};
}
