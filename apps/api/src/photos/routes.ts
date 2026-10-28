import { photoUuid } from '@resumora/contracts/editor/photo';
import { PhotoError, maxPhotoBytes } from './format.ts';
export type PhotoAsset = { id: string; objectKey: string; sha256: string; width: number; height: number; byteSize: number; state: 'reserved'|'ready'|'purge_pending'|'purged' };
export interface PhotoGateway {
  expirePhotos(secret:string): Promise<PhotoAsset[]>;
  reservePhoto(input: { id: string; sha256: string; width: number; height: number; byteSize: number }, secret: string): Promise<PhotoAsset>;
  readyPhoto(id: string, secret: string): Promise<PhotoAsset>;
  readPhoto(id: string): Promise<PhotoAsset>;
  deletePhoto(id: string, secret: string, complete?: boolean): Promise<PhotoAsset>;
  putPhoto(key: string, bytes: Uint8Array): Promise<void>;
  getPhoto(key: string): Promise<Uint8Array>;
  purgePhoto(key: string): Promise<void>;
}
export type Normalizer = (bytes: Uint8Array) => Promise<{bytes:Uint8Array;width:number;height:number;mime:'image/jpeg'}>;
export async function digestPhoto(bytes: Uint8Array) {
  const result = new Uint8Array(await crypto.subtle.digest('SHA-256',bytes.slice().buffer));
  return [...result].map(v=>v.toString(16).padStart(2,'0')).join('');
}
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
async function body(request: Request) {
  const length=request.headers.get('content-length');
  if(length && (!/^\d+$/.test(length)||Number(length)>maxPhotoBytes))throw new PhotoError('photoSize',413);
  const reader=request.body?.getReader();if(!reader)throw new PhotoError('invalidPhoto');
  const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>maxPhotoBytes){await reader.cancel();throw new PhotoError('photoSize',413);}chunks.push(r.value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}return bytes;
}
/** Mounted only after real Auth and Origin/CSRF checks. */
export async function photoRoute(request:Request,gateway:PhotoGateway,secret:string|undefined,normalize:Normalizer) {
  try {
    if(!secret || !/^[A-Za-z0-9_-]{32,128}$/.test(secret))return json({error:{code:'photoUnavailable'}},503);
    const path=new URL(request.url).pathname;
    if(path==='/v1/photos/cleanup' && request.method==='POST') {
      for(const asset of await gateway.expirePhotos(secret)){await gateway.purgePhoto(asset.objectKey);await gateway.deletePhoto(asset.id,secret,true);}
      return json({cleaned:true});
    }
    if(path==='/v1/photos' && request.method==='POST') {
      const id=request.headers.get('X-Request-Id');if(!photoUuid(id))return json({error:{code:'invalidRequest'}},400);
      if(!['image/jpeg','image/png','image/webp'].includes(request.headers.get('Content-Type')?.split(';')[0]??''))return json({error:{code:'invalidPhoto'}},415);
      const result=await normalize(await body(request));
      const sha256=await digestPhoto(result.bytes);
      let asset=await gateway.reservePhoto({id,sha256,width:result.width,height:result.height,byteSize:result.bytes.length},secret);
      if(asset.state==='purge_pending'||asset.state==='purged')return json({error:{code:'missing'}},404);
      if(asset.state!=='ready'){
        // Storage is immutable. A duplicate PUT is reconciled by reading and hashing
        // the actual stored bytes; client metadata can never finalize an asset.
        await gateway.putPhoto(asset.objectKey,result.bytes);
        const stored=await gateway.getPhoto(asset.objectKey);
        if(await digestPhoto(stored)!==sha256)throw new PhotoError('photoStorageConflict',409);
        asset=await gateway.readyPhoto(id,secret);
      }
      return json({asset:{id:asset.id,width:asset.width,height:asset.height}});
    }
    const match=path.match(/^\/v1\/photos\/([^/]+)$/),id=match?.[1];
    if(!photoUuid(id))return json({error:{code:'missing'}},404);
    if(request.method==='GET'){
      const asset=await gateway.readPhoto(id);
      const bytes=await gateway.getPhoto(asset.objectKey);
      if(await digestPhoto(bytes)!==asset.sha256)throw new PhotoError('photoUnavailable',503);
      // Fence a concurrent delete after the storage read, before serving bytes.
      await gateway.readPhoto(id);
      return new Response(bytes.slice().buffer,{headers:{'Content-Type':'image/jpeg','Content-Length':String(bytes.length),
        'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'",'Referrer-Policy':'no-referrer'}});
    }
    if(request.method==='DELETE'){
      const asset=await gateway.deletePhoto(id,secret);
      // Logical deletion revokes every reference immediately. Retry resumes this
      // same tombstone if external byte removal failed; never resurrect an asset.
      await gateway.purgePhoto(asset.objectKey);
      await gateway.deletePhoto(id,secret,true);
      return json({deleted:true});
    }
    return json({error:{code:'method'}},405);
  }catch(error){const e=error as {status?:number;code?:string};
    const status=e.status===403||e.status===404?404:[400,409,410,413,415,422,429,503].includes(e.status??0)?e.status!:503;
    return json({error:{code:error instanceof PhotoError?error.code:status===404?'missing':status===409?'conflict':status===410?'expired':'photoUnavailable'}},status);
  }
}
