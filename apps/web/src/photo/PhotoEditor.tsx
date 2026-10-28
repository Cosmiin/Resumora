import { inspectPhoto } from '@resumora/contracts/editor/photo-format';
import { useContext, useEffect, useId, useRef, useState } from 'react';
import { cropRectangle, defaultPhotoCrop, type CvPhoto, type PhotoCrop } from '@resumora/contracts/editor/photo';
import { equalValues } from '@resumora/contracts/editor/model';
import { PhotoContext, usePhotoUrl } from './client';
import { useCopy } from '../components/ui';

type LocalImage={image:CanvasImageSource;width:number;height:number;blob:Blob|null;assetId?:string};
async function prepare(file:File):Promise<LocalImage>{
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size===0||file.size>10485760)throw Error('file');
  // Native decoder applies EXIF orientation once. Re-encoding strips metadata;
  // server independently decodes/re-encodes the uploaded bounded full-frame source.
  const raw=new Uint8Array(await file.arrayBuffer());
  inspectPhoto(raw,{maxDimension:8192,maxPixels:24000000,allowMetadata:true});
  const image=await createImageBitmap(file,{imageOrientation:'from-image'});
  try{
    if(Math.min(image.width,image.height)<256||image.width*image.height>24000000||Math.max(image.width,image.height)>8192)throw Error('dimensions');
    const ratio=Math.min(1,1600/Math.max(image.width,image.height)),width=Math.floor(image.width*ratio),height=Math.floor(image.height*ratio);
    if(Math.min(width,height)<256)throw Error('dimensions');
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d');if(!ctx)throw Error('canvas');ctx.fillStyle='white';ctx.fillRect(0,0,width,height);ctx.drawImage(image,0,0,width,height);
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(v=>v?resolve(v):reject(Error('canvas')),'image/jpeg',.95));
    return {image:canvas,width,height,blob};
  }finally{image.close();}
}
export function PhotoEditor({value,commit}:{value:CvPhoto|null|undefined;commit:(photo:CvPhoto|null,expected:CvPhoto|null)=>Promise<boolean>}){
  const controlId=useId();
  const client=useContext(PhotoContext),t=useCopy(),source=usePhotoUrl(value?.assetId);
  const [editing,setEditing]=useState(false),[local,setLocal]=useState<LocalImage|null>(null),[crop,setCrop]=useState<PhotoCrop>({...defaultPhotoCrop}),[shape,setShape]=useState<'circle'|'square'>('square'),[visible,setVisible]=useState(true),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[deleting,setDeleting]=useState(false),[confirm,setConfirm]=useState(false);
  const canvas=useRef<HTMLCanvasElement>(null),file=useRef<HTMLInputElement>(null),sequence=useRef(0),original=useRef<CvPhoto|null>(null),request=useRef(crypto.randomUUID()),uploaded=useRef<string|null>(null),drag=useRef<{x:number;y:number}|null>(null),alive=useRef(true);
  const submitted=useRef<CvPhoto|null>(null);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;sequence.current++;};},[]);
  useEffect(()=>{if(editing&&submitted.current&&equalValues(value,submitted.current)){original.current=structuredClone(submitted.current);submitted.current=null;}},[value,editing]);
  useEffect(()=>{if(!editing||!local||!canvas.current)return;const rect=cropRectangle(local.width,local.height,crop),ctx=canvas.current.getContext('2d');ctx?.clearRect(0,0,360,360);ctx?.drawImage(local.image,rect.x,rect.y,rect.size,rect.size,0,0,360,360);},[local,crop,editing]);
  useEffect(()=>{if(!editing)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[editing]);
  function start(image:LocalImage){original.current=structuredClone(value??null);submitted.current=null;setLocal(image);setCrop(value?.crop??{...defaultPhotoCrop});setShape(value?.shape??'square');setVisible(value?.visible??true);request.current=crypto.randomUUID();uploaded.current=null;setEditing(true);setMessage('');}
  async function select(selected:File|undefined){if(!selected)return;const token=++sequence.current;setBusy(true);try{const image=await prepare(selected);if(!alive.current||token!==sequence.current)return;start(image);setCrop({...defaultPhotoCrop});}catch{if(alive.current)setMessage(t('Alege JPEG, PNG sau WebP static, maximum 10 MB / 24 MP, minimum 256 px. HEIC și imaginile animate nu sunt acceptate. Exportă ca JPEG/PNG și reîncearcă.','Choose static JPEG, PNG or WebP, up to 10 MB / 24 MP, minimum 256 px. HEIC and animated images are unsupported. Export as JPEG/PNG and retry.'));}finally{if(alive.current&&token===sequence.current)setBusy(false);if(file.current)file.current.value='';}}
  function edit(){if(!source.url)return;const image=new Image(),token=++sequence.current;image.onload=()=>{if(alive.current&&token===sequence.current)start({image,width:image.naturalWidth,height:image.naturalHeight,blob:null,assetId:value?.assetId});};image.src=source.url;}
  function position(next:PhotoCrop){if(local)setCrop(cropRectangle(local.width,local.height,next).crop);}
  function move(x:number,y:number){if(!local)return;const rect=cropRectangle(local.width,local.height,crop);position({...crop,centerX:crop.centerX-x*rect.size/local.width,centerY:crop.centerY-y*rect.size/local.height});}
  async function save(){if(!client||!local||busy)return;setBusy(true);setMessage(t('Validăm și salvăm fotografia…','Validating and saving photo…'));try{
    let id=local.assetId??uploaded.current;
    if(!id){await client.cleanup().catch(()=>{});id=(await client.upload(local.blob!,request.current)).id;uploaded.current=id;}
    if(!alive.current)return;
    const photo:CvPhoto={assetId:id,crop:cropRectangle(local.width,local.height,crop).crop,shape,visible};
    submitted.current=structuredClone(photo);
    const saved=await commit(photo,original.current);
    if(!alive.current)return;
    if(saved){setEditing(false);setLocal(null);setMessage(t('Fotografie salvată în CV.','Photo saved in CV.'));}
    else setMessage(t('Fotografia nu este încă salvată în CV. Rezolvă salvarea/conflictul din bara CV; editările sunt păstrate.','Photo is not yet saved in the CV. Resolve the save/conflict in the CV bar; edits are retained.'));
  }catch{if(alive.current)setMessage(t('Salvarea fotografiei nu a reușit. Reîncearcă; fotografia salvată anterior rămâne până la confirmarea salvării CV.','Photo save failed. Retry; the prior saved photo remains until the CV save is confirmed.'));}finally{if(alive.current)setBusy(false);}}
  async function remove(){setBusy(true);try{const saved=await commit(null,value??null);setMessage(saved?t('Fotografia a fost eliminată din acest CV; celelalte versiuni o pot păstra.','Photo removed from this CV; other versions may retain it.'):t('Rezolvă salvarea CV din bara de jos.','Resolve the CV save in the bar below.'));}finally{if(alive.current)setBusy(false);}}
  async function purge(){if(!client||!value)return;setBusy(true);setDeleting(true);try{await client.delete(value.assetId);await commit(null,value);if(alive.current){setConfirm(false);setMessage(t('Fotografie ștearsă de peste tot. Versiunile anterioare nu o mai pot afișa.','Photo deleted everywhere. Historical versions can no longer display it.'));}}catch{if(alive.current)setMessage(t('Accesul poate fi deja revocat. Reîncearcă ștergerea pentru a finaliza eliminarea fișierului.','Access may already be revoked. Retry deletion to finish removing the file.'));}finally{if(alive.current){setBusy(false);setDeleting(false);}}}
  const rect=local?cropRectangle(local.width,local.height,crop):null;
  return <section className="photo-editor" aria-label={t('Fotografie opțională','Optional photo')}><h3>{t('Fotografie (opțional)','Photo (optional)')}</h3><p>{t('Fără AI. Fișierul este trimis doar când alegi Salvează fotografia. Sursa completă este redusă la maximum 1600 px; decuparea rămâne reversibilă.','No AI. The file is uploaded only when you choose Save photo. The full-frame source is reduced to at most 1600px; cropping remains reversible.')}</p>
    {!client?<p>{t('Fotografia necesită conexiunea autentificată la cont.','Photos require the authenticated account connection.')}</p>:<>
    <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} aria-label={t('Alege o fotografie','Choose a photo')} onChange={e=>void select(e.target.files?.[0])}/>
    {!editing&&value&&<div className="photo-actions"><button type="button" disabled={busy||!source.url} onClick={edit}>{t('Ajustează fotografia','Adjust photo')}</button><button type="button" disabled={busy} onClick={()=>void remove()}>{t('Elimină din acest CV','Remove from this CV')}</button><button type="button" disabled={busy} onClick={()=>setConfirm(true)}>{t('Șterge fotografia de peste tot','Delete photo everywhere')}</button></div>}
    {editing&&local&&rect&&<><canvas ref={canvas} width={360} height={360} className={`photo-crop photo-${shape}`} role="img" tabIndex={0} aria-label={t('Decupare fotografie. Săgețile deplasează imaginea; Shift mărește pasul.','Photo framing. Arrow keys move the image; Shift moves farther.')}
      onKeyDown={e=>{const d:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};if(d[e.key]&&!busy){e.preventDefault();const [x,y]=d[e.key];move(x*(e.shiftKey?.1:.02),y*(e.shiftKey?.1:.02));}}}
      onPointerDown={e=>{if(busy)return;drag.current={x:e.clientX,y:e.clientY};e.currentTarget.setPointerCapture(e.pointerId);e.currentTarget.focus();}}
      onPointerMove={e=>{if(!drag.current||busy)return;const w=e.currentTarget.getBoundingClientRect().width;move((e.clientX-drag.current.x)/w,(e.clientY-drag.current.y)/w);drag.current={x:e.clientX,y:e.clientY};}}
      onPointerUp={()=>drag.current=null} onPointerCancel={()=>drag.current=null}/>
      <label htmlFor={controlId+'-horizontal'}>{t('Poziție orizontală','Horizontal framing')} <span aria-hidden="true">{Math.round(rect.crop.centerX*100)}%</span><input id={controlId+'-horizontal'} type="range" min={rect.size/2/local.width} max={1-rect.size/2/local.width} step={1/local.width} aria-valuetext={`${Math.round(rect.crop.centerX*100)}%`} value={rect.crop.centerX} disabled={busy||rect.size===local.width} onChange={e=>position({...crop,centerX:+e.target.value})}/></label>
      <label htmlFor={controlId+'-vertical'}>{t('Poziție verticală','Vertical framing')} <span aria-hidden="true">{Math.round(rect.crop.centerY*100)}%</span><input id={controlId+'-vertical'} type="range" min={rect.size/2/local.height} max={1-rect.size/2/local.height} step={1/local.height} aria-valuetext={`${Math.round(rect.crop.centerY*100)}%`} value={rect.crop.centerY} disabled={busy||rect.size===local.height} onChange={e=>position({...crop,centerY:+e.target.value})}/></label>
      <label htmlFor={controlId+'-zoom'}>Zoom <span aria-hidden="true">{crop.zoom.toFixed(2)}×</span><input id={controlId+'-zoom'} type="range" min={1} max={3} step={.01} aria-valuetext={`${crop.zoom.toFixed(2)}×`} value={crop.zoom} disabled={busy} onChange={e=>position({...crop,zoom:+e.target.value})}/></label>
      <div className="photo-actions"><button type="button" disabled={busy||crop.zoom<=1} aria-label={t('Micșorează','Zoom out')} onClick={()=>position({...crop,zoom:Math.max(1,crop.zoom-.1)})}>−</button><button type="button" disabled={busy||crop.zoom>=3} aria-label={t('Mărește','Zoom in')} onClick={()=>position({...crop,zoom:Math.min(3,crop.zoom+.1)})}>+</button></div>
      <div className="photo-actions">{([[-1,0,'←'],[1,0,'→'],[0,-1,'↑'],[0,1,'↓']] as const).map(([x,y,label])=><button type="button" key={label} disabled={busy} aria-label={t('Deplasează imaginea','Move picture')+' '+label} onClick={()=>move(x*.04,y*.04)}>{label}</button>)}<button type="button" disabled={busy} onClick={()=>position({...crop,centerX:.5,centerY:.5})}>{t('Centrează','Center')}</button><button type="button" disabled={busy} onClick={()=>position({...defaultPhotoCrop})}>{t('Resetează','Reset')}</button></div>
      <label>{t('Formă','Shape')}<select value={shape} disabled={busy} onChange={e=>setShape(e.target.value as typeof shape)}><option value="circle">{t('Cerc','Circle')}</option><option value="square">{t('Pătrat','Square')}</option></select></label>
      <label><input type="checkbox" checked={visible} disabled={busy} onChange={e=>setVisible(e.target.checked)}/>{t(' Afișează în acest CV',' Show in this CV')}</label>
      <div className="photo-actions"><button type="button" disabled={busy} onClick={()=>void save()}>{t('Salvează fotografia','Save photo')}</button><button type="button" disabled={busy} onClick={()=>{sequence.current++;setEditing(false);setLocal(null);setMessage('');}}>{t('Anulează','Cancel')}</button></div>
    </>}
    {confirm&&<div className="notice notice-error" role="group" aria-label={t('Confirmă ștergerea fotografiei','Confirm photo deletion')}><p>{t('Ștergi această fotografie de peste tot? Va fi eliminată și din CV-urile adaptate existente și nu va mai fi disponibilă în versiunile anterioare. Copiile deja descărcate nu pot fi retrase.','Delete this stored photo everywhere? It will also be removed from your existing tailored CVs and will no longer be available in historical versions. Downloaded copies cannot be recalled.')}</p><button type="button" disabled={busy} onClick={()=>void purge()}>{deleting?t('Se șterge…','Deleting…'):t('Șterge definitiv','Delete permanently')}</button><button type="button" disabled={busy} onClick={()=>setConfirm(false)}>{t('Anulează','Cancel')}</button></div>}
    </>}
    {message&&<p role="status">{message}</p>}{source.unavailable&&!editing&&value&&<div><p role="status">{t('Fotografia nu mai este disponibilă. Poți să o înlocuiești sau să o elimini din acest CV.','Photo unavailable. Replace it or remove it from this CV.')}</p><button type="button" onClick={source.retry}>{t('Reîncarcă fotografia','Retry photo')}</button></div>}
  </section>;
}
