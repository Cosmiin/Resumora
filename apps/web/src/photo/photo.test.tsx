import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { PhotoEditor } from './PhotoEditor';
import { PhotoContext, createPhotoClient, type PhotoClient } from './client';
import { LanguageContext } from '../components/ui';
import { blankDraft } from '../base/model';
import { decodeDraft, encodeDraft, isBaseDraft } from '@resumora/contracts/editor/transport';
import { AdapterError, MemoryBaseCvAdapter } from '../base/adapter';
import { App } from '../App';
import type { CvPhoto } from '@resumora/contracts/editor/photo';
const id='11111111-1111-4111-8111-111111111111';
function client():PhotoClient{return {upload:vi.fn(async()=>({id})),read:vi.fn(async()=>new Blob()),delete:vi.fn(async()=>{}),subscribe:()=>()=>{},cleanup:vi.fn(async()=>{})};}
function file(){const f=new File(['test'],'portrait.png',{type:'image/png'});Object.defineProperty(f,'arrayBuffer',{value:async()=>{const b=new Uint8Array(33),v=new DataView(b.buffer);b.set([137,80,78,71,13,10,26,10]);v.setUint32(8,13);b.set([73,72,68,82],12);v.setUint32(16,400);v.setUint32(20,600);return b.buffer;}});return f;}
beforeEach(()=>{
 vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({fillRect:vi.fn(),drawImage:vi.fn(),clearRect:vi.fn()} as unknown as CanvasRenderingContext2D);
 vi.spyOn(HTMLCanvasElement.prototype,'toBlob').mockImplementation(callback=>callback(new Blob(['normalized'],{type:'image/jpeg'})));
 vi.stubGlobal('createImageBitmap',vi.fn(async()=>({width:400,height:600,close:vi.fn()})));
 vi.stubGlobal('Image',class{naturalWidth=400;naturalHeight=600;onload:()=>void=()=>{};set src(v:string){if(v)queueMicrotask(()=>this.onload());}});
 URL.createObjectURL=vi.fn(()=> 'blob:synthetic');URL.revokeObjectURL=vi.fn();
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
it('keeps new image local until explicit save; sliders/shape serialize and cancel sends nothing',async()=>{
 const port=client(),commit=vi.fn(async(_photo:CvPhoto|null,_expected:CvPhoto|null)=>true);
 render(<PhotoContext.Provider value={port}><LanguageContext.Provider value="en"><PhotoEditor value={null} commit={commit}/></LanguageContext.Provider></PhotoContext.Provider>);
 fireEvent.change(screen.getByLabelText('Choose a photo'),{target:{files:[file()]}});
 const zoom=await screen.findByRole('slider',{name:/Zoom/});expect(port.upload).not.toHaveBeenCalled();
 fireEvent.change(zoom,{target:{value:'2'}});fireEvent.change(screen.getByLabelText(/Horizontal framing/),{target:{value:'.6'}});fireEvent.change(screen.getByLabelText(/Vertical framing/),{target:{value:'.4'}});
 fireEvent.change(screen.getByLabelText('Shape'),{target:{value:'circle'}});fireEvent.click(screen.getByRole('button',{name:'Save photo'}));
 await waitFor(()=>expect(commit).toHaveBeenCalledTimes(1));const photo=commit.mock.calls[0][0] as unknown as CvPhoto;
 expect(photo).toMatchObject({assetId:id,shape:'circle',visible:true,crop:{zoom:2,centerX:.6,centerY:.4}});expect(port.upload).toHaveBeenCalledTimes(1);
 fireEvent.change(screen.getByLabelText('Choose a photo'),{target:{files:[file()]}});await screen.findByLabelText('Shape');fireEvent.click(screen.getByRole('button',{name:'Cancel'}));expect(commit).toHaveBeenCalledTimes(1);
});
it('uncertain CV save retains uploaded asset for retry; component unmount discards late upload reply',async()=>{
 const port=client(),commit=vi.fn(async(_photo:CvPhoto|null,_expected:CvPhoto|null)=>false);
 const view=render(<PhotoContext.Provider value={port}><LanguageContext.Provider value="en"><PhotoEditor value={null} commit={commit}/></LanguageContext.Provider></PhotoContext.Provider>);
 fireEvent.change(screen.getByLabelText('Choose a photo'),{target:{files:[file()]}});await screen.findByLabelText('Shape');fireEvent.click(screen.getByRole('button',{name:'Save photo'}));await screen.findByText(/Photo is not yet saved/);
 fireEvent.click(screen.getByRole('button',{name:'Save photo'}));await waitFor(()=>expect(commit).toHaveBeenCalledTimes(2));expect(port.upload).toHaveBeenCalledTimes(1);view.unmount();
 let resolve!:(v:{id:string})=>void;port.upload=vi.fn(()=>new Promise<{id:string}>(r=>{resolve=r;}));commit.mockClear();
 const second=render(<PhotoContext.Provider value={port}><LanguageContext.Provider value="en"><PhotoEditor value={null} commit={commit}/></LanguageContext.Provider></PhotoContext.Provider>);
 fireEvent.change(screen.getByLabelText('Choose a photo'),{target:{files:[file()]}});await screen.findByLabelText('Shape');fireEvent.click(screen.getByRole('button',{name:'Save photo'}));await waitFor(()=>expect(port.upload).toHaveBeenCalledTimes(1));second.unmount();await act(async()=>resolve({id}));expect(commit).not.toHaveBeenCalled();
});
it('deletion confirmation explicitly names existing tailored CVs and client uses owned authenticated route',async()=>{
 const transport=vi.fn(async(_path:string,_init?:RequestInit)=>Response.json({deleted:true})),port=createPhotoClient(transport),notify=vi.fn();port.subscribe(notify);
 render(<PhotoContext.Provider value={port}><LanguageContext.Provider value="en"><PhotoEditor value={{assetId:id,crop:{version:1,centerX:.5,centerY:.5,zoom:1},shape:'square',visible:true}} commit={async()=>true}/></LanguageContext.Provider></PhotoContext.Provider>);
 fireEvent.click(screen.getByRole('button',{name:'Delete photo everywhere'}));const group=screen.getByRole('group',{name:'Confirm photo deletion'});expect(group.textContent).toContain('existing tailored CVs');expect(transport.mock.calls.filter(c=>c[1]?.method==='DELETE')).toHaveLength(0);
 fireEvent.click(within(group).getByRole('button',{name:'Delete permanently'}));await waitFor(()=>expect(notify).toHaveBeenCalledWith(id));expect(transport).toHaveBeenCalledWith('/v1/photos/'+id,{method:'DELETE'});
});
it('strict wire format keeps old drafts and approved wording alongside photo, rejecting unsafe coordinates',()=>{
 const old=blankDraft();expect(decodeDraft(encodeDraft(old))).toEqual(old);
 old.presentation.photo={assetId:id,crop:{version:1,centerX:.5,centerY:.5,zoom:2},shape:'circle',visible:true};old.presentation.approvedWording={field:{text:'Approved wording',sources:[{id:'fact',text:'Supported',sourceId:'manual'}]}};
 expect(decodeDraft(encodeDraft(old))).toEqual(old);expect(isBaseDraft({...old,presentation:{...old.presentation,photo:{...old.presentation.photo,crop:{...old.presentation.photo.crop,zoom:NaN}}}})).toBe(false);
});
it('actual App photo commit merges late text edits and preserves presentation overlays in immutable history',async()=>{
 const port=client(),adapter=new MemoryBaseCvAdapter(),draft=blankDraft();draft.presentation.approvedWording={field:{text:'Keep',sources:[]}};await adapter.save({draft,expectedRevision:0,mode:'autosave',requestId:crypto.randomUUID()});
 let release!:(v:{id:string})=>void;port.upload=vi.fn(()=>new Promise<{id:string}>(resolve=>{release=resolve;}));window.location.hash='#base';
 render(<PhotoContext.Provider value={port}><App adapter={adapter}/></PhotoContext.Provider>);
 fireEvent.change(await screen.findByLabelText('Alege o fotografie'),{target:{files:[file()]}});await screen.findByLabelText('Formă');fireEvent.click(screen.getByRole('button',{name:'Salvează fotografia'}));await waitFor(()=>expect(port.upload).toHaveBeenCalledTimes(1));
 fireEvent.change(screen.getByRole('textbox',{name:/Prenume/}),{target:{value:'Mara'}});
 await act(async()=>release({id}));await screen.findByText('Fotografie salvată în CV.');
 const head=await adapter.load();expect(head?.draft.name.value).toBe('Mara');expect(head?.draft.presentation.photo?.assetId).toBe(id);expect(head?.draft.presentation.approvedWording).toEqual(draft.presentation.approvedWording);expect((await adapter.history()).at(-1)?.draft.presentation.photo).toBeUndefined();
});
it.each(['replay','expired'] as const)('allows further photo edits after %s reconciliation and blocks unrelated photo changes',async(recovery)=>{
 const port=client(),adapter=new MemoryBaseCvAdapter(),draft=blankDraft();
 draft.presentation.photo={assetId:'22222222-2222-4222-8222-222222222222',crop:{version:1,centerX:.5,centerY:.5,zoom:1},shape:'square',visible:true};
 await adapter.save({draft,expectedRevision:0,mode:'autosave',requestId:crypto.randomUUID()});
 const persist=adapter.save.bind(adapter),save=vi.spyOn(adapter,'save').mockImplementation(persist);
 save.mockImplementationOnce(async input=>{await persist(input);throw Error('lost response');});
 if(recovery==='expired')save.mockRejectedValueOnce(new AdapterError('expired'));
 window.location.hash='#base';render(<PhotoContext.Provider value={port}><App adapter={adapter}/></PhotoContext.Provider>);
 fireEvent.change(await screen.findByLabelText('Alege o fotografie'),{target:{files:[file()]}});
 await screen.findByLabelText('Formă');fireEvent.click(screen.getByRole('button',{name:'Salvează fotografia'}));
 await screen.findByText(/Fotografia nu este încă salvată/);
 fireEvent.change(screen.getByRole('slider',{name:/Zoom/}),{target:{value:'2'}});
 fireEvent.change(screen.getByLabelText(/Poziție orizontală/),{target:{value:'.6'}});
 fireEvent.change(screen.getByLabelText(/Poziție verticală/),{target:{value:'.4'}});
 fireEvent.change(screen.getByLabelText('Formă'),{target:{value:'circle'}});
 fireEvent.click(screen.getByRole('checkbox',{name:/Afișează în acest CV/}));
 fireEvent.click(screen.getByRole('button',{name:'Salvează fotografia'}));
 await waitFor(()=>expect(screen.getByRole('button',{name:'Salvează fotografia'}).hasAttribute('disabled')).toBe(false));
 expect(save).toHaveBeenCalledTimes(1);
 fireEvent.click(screen.getByRole('button',{name:'Reîncearcă'}));
 if(recovery==='expired')fireEvent.click(await screen.findByRole('button',{name:'Verifică starea salvată'}));
 await waitFor(()=>expect(screen.queryByRole('alert')).toBeNull());
 fireEvent.click(screen.getByRole('button',{name:'Salvează fotografia'}));
 await screen.findByText('Fotografie salvată în CV.');
 expect((await adapter.load())?.draft.presentation.photo).toMatchObject({assetId:id,shape:'circle',visible:false,crop:{version:1,centerX:.6,centerY:.4,zoom:2}});
 expect(save).toHaveBeenCalledTimes(3);expect(port.upload).toHaveBeenCalledTimes(1);
 expect((await adapter.history()).at(-1)?.draft.presentation.photo).toEqual(draft.presentation.photo);
 fireEvent.click(screen.getByRole('button',{name:'Ajustează fotografia'}));await screen.findByLabelText('Formă');
 fireEvent.click(screen.getByRole('button',{name:'Anulează ultima modificare'}));
 fireEvent.change(screen.getByRole('slider',{name:/Zoom/}),{target:{value:'3'}});
 fireEvent.click(screen.getByRole('button',{name:'Salvează fotografia'}));
 await screen.findByText(/Fotografia nu este încă salvată/);
 expect(save).toHaveBeenCalledTimes(3);
 expect((await adapter.load())?.draft.presentation.photo?.crop.zoom).toBe(2);
});
