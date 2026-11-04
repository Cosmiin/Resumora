import { captureBytes, parseCapture } from '@resumora/contracts/jobs/capture';
import { isUuid } from '@resumora/contracts/jobs/connected';
import { authenticateRequest, checkWrite, authHeaders, authJson, authError } from '../auth/session.ts';
import { readCookie } from '../auth/cookies.ts';
import type { SessionCookie } from '../auth/session.ts';
import { boundedJson } from '../ai/http.ts';
import { extensionIds, captureRpc, digest, challenge, randomSecret, type CaptureConfig } from './gateway.ts';

const tokenPattern = /^[A-Za-z0-9_-]{43,128}$/;
const credential = /^[0-9a-f]{64}$/;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v==='object' && !Array.isArray(v);
function exact(v: Record<string, unknown>, fields: string[]) { if(Object.keys(v).sort().join(',')!==fields.sort().join(',')) throw Error('invalidRequest'); }
export async function extensionRoute(request: Request, env: CaptureConfig, transport: typeof fetch = fetch): Promise<Response> {
  const path = new URL(request.url).pathname;
  const headers = authHeaders();
  try {
    const ids = extensionIds(env);
    const web = path === '/v1/extension/authorize' || path === '/v1/extension/revoke';
    let extension = '', device = '';
    if (!web) {
      extension = request.headers.get('X-Resumora-Extension') ?? '';
      device = request.headers.get('X-Resumora-Device') ?? '';
      const origin = request.headers.get('Origin');
      // Preflight has no custom header values, only the exact allowlisted origin.
      const originId = ids.find(id => origin === `chrome-extension://${id}`);
      if (!originId || (request.method!=='OPTIONS' && (extension!==originId || !isUuid(device)))) return authError('FORBIDDEN',403,headers);
      headers.set('Access-Control-Allow-Origin',origin!); headers.set('Vary','Origin');
      if (request.method === 'OPTIONS') {
        if (request.headers.get('Access-Control-Request-Method')!=='POST') return authError('FORBIDDEN',403,headers);
        const allowed = ['authorization','content-type','x-resumora-extension','x-resumora-device'];
        if ((request.headers.get('Access-Control-Request-Headers')??'').split(',').some(h=>h.trim()&&!allowed.includes(h.trim().toLowerCase()))) return authError('FORBIDDEN',403,headers);
        headers.set('Access-Control-Allow-Methods','POST'); headers.set('Access-Control-Allow-Headers',allowed.join(', '));
        return new Response(null,{status:204,headers});
      }
    }
    if (request.method!=='POST') return authError('METHOD_NOT_ALLOWED',405,headers);
    if(request.headers.get('Content-Type')?.split(';')[0]!=='application/json' || new URL(request.url).search) throw Error('invalidRequest');
    let identity: Awaited<ReturnType<typeof authenticateRequest>> | undefined;
    if(web) {
      identity = await authenticateRequest(request,env,transport);
      if(identity.response) return identity.response;
      for(const cookie of identity.headers.getSetCookie()) headers.append('Set-Cookie',cookie);
      if(!await checkWrite(request,env)) return authError('FORBIDDEN',403,headers);
    }
    let body: unknown;
    try {body = await boundedJson(new Response(request.body),path==='/v1/jobs'?captureBytes:4096);}
    catch(error) {return authError('INVALID_INPUT',error instanceof Error && error.message==='RESPONSE_TOO_LARGE'?413:400,headers);}
    if(!object(body)) throw Error('invalidRequest');
    if(web && identity && !identity.response) {
      if(path.endsWith('/revoke')) { exact(body,[]); return authJson(await captureRpc(env,'revoke_my_capture_connections',{},transport,identity.accessToken),200,headers); }
      exact(body,['extensionId','deviceId','challenge','state']);
      if(typeof body.extensionId!=='string'||!ids.includes(body.extensionId)||!isUuid(body.deviceId)||typeof body.challenge!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(body.challenge)||typeof body.state!=='string'||!tokenPattern.test(body.state)) throw Error('invalidRequest');
      const session = await readCookie<SessionCookie>(request,env,'session');
      if(!session || session.recovery) return authError('UNAUTHORIZED',401,headers);
      const code = randomSecret();
      await captureRpc(env,'authorize_capture',{p_extension:body.extensionId,p_device:body.deviceId,p_session:await digest(session.csrf),p_challenge:body.challenge,p_code:await digest(code),p_until:new Date(Math.min(session.until,Date.now()+7*86400000)).toISOString()},transport,identity.accessToken);
      const callback = new URL(`https://${body.extensionId}.chromiumapp.org/capture`);
      callback.searchParams.set('code',code); callback.searchParams.set('state',body.state);
      return authJson({redirect:callback.href},200,headers);
    }
    const auth = request.headers.get('Authorization');
    const value = auth?.startsWith('Bearer ')?auth.slice(7):'';
    if(path==='/v1/extension/token') {
      exact(body,body.code!==undefined?['code','verifier']:['connection']);
      const exchange = body.code!==undefined;
      const secret = exchange?body.code:body.connection;
      if(typeof secret!=='string'||!credential.test(secret)|| (exchange&&(typeof body.verifier!=='string'||!tokenPattern.test(body.verifier)))) throw Error('invalidRequest');
      const accessToken = randomSecret(), connection = exchange?randomSecret():undefined;
      const result = await captureRpc(env,'capture_command',{p_action:exchange?'exchange':'renew',p_extension:extension,p_device:device,p_credential:await digest(secret),p_input:{tokenHash:await digest(accessToken),...(exchange?{challenge:await challenge(body.verifier as string),connectionHash:await digest(connection!)}:{})}},transport) as {expiresAt:string;userId:string};
      return authJson({...result,accessToken,expiresIn:600,...(connection?{connection}:{})},200,headers);
    }
    if(!credential.test(value)) return authError('UNAUTHORIZED',401,headers);
    let action: string, input: unknown;
    if(path==='/v1/extension/disconnect') {exact(body,[]);action='disconnect';input={};}
    else if(path==='/v1/jobs/capture-status') {exact(body,['requestId']); if(!isUuid(body.requestId)) throw Error('invalidRequest');action='status';input=body;}
    else if(path==='/v1/jobs') {action='save';input=parseCapture(body);}
    else return authError('NOT_FOUND',404,headers);
    const result = await captureRpc(env,'capture_command',{p_action:action,p_extension:extension,p_device:device,p_credential:await digest(value),p_input:input},transport);
    return authJson(result,result===null?404:action==='save'?202:200,headers);
  } catch(error) {
    const e = error as {status?:number;message?:string};
    const status = e.message==='invalidRequest'||error instanceof SyntaxError||error instanceof TypeError ?400:[400,401,403,409,410,429].includes(e.status??0)?e.status!:503;
    if(status===429) headers.set('Retry-After','60');
    return authError(status===401?'UNAUTHORIZED':status===410?'RESOURCE_DELETED':status===429?'RATE_LIMITED':status===503?'CAPTURE_UNAVAILABLE':'INVALID_INPUT',status,headers);
  }
}
