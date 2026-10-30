import { decodeDraft,encodeDraft,type DraftSnapshot } from '@resumora/contracts/editor/transport';
import { selfContainedJobDraft,type CurrentJobDocument } from '@resumora/contracts/jobs/current-document';
import type { BaseDraft } from '@resumora/contracts/editor/model';
import { isUuid } from '@resumora/contracts/jobs/connected';
import { readBody } from '../cv/routes.ts';import { privateJson,routeError } from './routes.ts';
export interface CurrentDocumentGateway{
 loadCurrentJobDocument(jobId:string,locale?:string):Promise<CurrentJobDocument|null>;
 saveCurrentJobDocument(input:{requestId:string;jobId:string;locale:string;documentId:string|null;expectedRevision:number;payload:ReturnType<typeof encodeDraft>;baseSnapshotId:string|null;operationId?:string;provenance?:Record<string,unknown>}):Promise<CurrentJobDocument>;
 jobEditorContext(jobId:string):Promise<{job:unknown;source:{snapshotId:string;revision:number}}>;
 loadSnapshot(id:string):Promise<DraftSnapshot|null>;
}
export async function currentJobDocumentsRoute(request:Request,gateway:CurrentDocumentGateway){
 const url=new URL(request.url),m=/^\/v1\/jobs\/([^/]+)\/cv(?:\/(context|pin|save|history|restore|delete))?$/.exec(url.pathname);if(!m||!isUuid(m[1]))return privateJson({error:{code:'missing'}},404);
 const [,jobId,action='load']=m;if(['history','restore'].includes(action))return privateJson({error:{code:'historyUnavailable'}},410);
 const locale=url.searchParams.get('locale');if((locale!==null&&!['ro','en'].includes(locale))||[...url.searchParams.keys()].some(k=>k!=='locale')||url.searchParams.getAll('locale').length>1)return privateJson({error:{code:'invalidRequest'}},400);
 const output=(v:CurrentJobDocument)=>{const {payload,...meta}=v;return {...meta,draft:decodeDraft(payload),sourceDraft:decodeDraft(payload),parentId:null,reason:'save'};};
 try{
  if(request.method==='GET'){
   if(action==='load'){const d=await gateway.loadCurrentJobDocument(jobId,locale??undefined);return privateJson(d?output(d):null);}
   if(action==='context'){const context=await gateway.jobEditorContext(jobId),base=await gateway.loadSnapshot(context.source.snapshotId);if(!base)return privateJson({error:{code:'missing'}},404);return privateJson({...context,draft:decodeDraft(base.payload)});}
   return privateJson({error:{code:'missing'}},404);
  }
  if(request.method!=='POST'||action!=='save'||url.search)return privateJson({error:{code:'method'}},405);
  const b=await readBody(request);if(b instanceof Response)return b;
  if(Object.keys(b).sort().join(',')!=='baseSnapshotId,documentId,draft,expectedRevision,locale,requestId'||!isUuid(b.requestId)||!(b.documentId===null||isUuid(b.documentId))||!(b.baseSnapshotId===null||isUuid(b.baseSnapshotId))||!Number.isSafeInteger(b.expectedRevision)||Number(b.expectedRevision)<0||!['ro','en'].includes(String(b.locale)))throw Error('invalidRequest');
  const draft=selfContainedJobDraft(decodeDraft(encodeDraft(b.draft as BaseDraft)));
  if(draft.language!==b.locale)throw Error('invalidRequest');
  return privateJson(output(await gateway.saveCurrentJobDocument({requestId:b.requestId,jobId,locale:String(b.locale),documentId:b.documentId as string|null,expectedRevision:Number(b.expectedRevision),payload:encodeDraft(draft),baseSnapshotId:b.baseSnapshotId as string|null})),200);
 }catch(error){return routeError(error);}
}
