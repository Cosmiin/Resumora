import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {it,expect,vi} from 'vitest';
import {maraReviewDraft} from '../base/fixture';
import {translationItems} from '@resumora/contracts/editor/languages';
import type {LanguageProposal,DocumentLanguageContext} from '@resumora/contracts/editor/language-transport';
import type {LanguageClient} from './client';
import {TranslationReview} from './TranslationReview';
async function fixture(){
 const draft=maraReviewDraft(),items=await translationItems(draft),selected=items.filter(i=>i.sectionId===items[0].sectionId);
 const pin={kind:'base' as const,documentId:draft.id,currentId:'source',revision:1,fingerprint:'a'.repeat(64)};
 const context:NonNullable<DocumentLanguageContext['source']>={pin,locale:'ro-RO',draft,items,accepted:true};
 const proposal:LanguageProposal={id:'proposal',state:'ready',step:1,reviewRevision:0,review:null,accepted:null,request:{source:pin,sourceLocale:'ro-RO',targetLocale:'en-GB',targetRevision:0,targetDocumentId:null,variantId:'lang_'+'b'.repeat(64),sectionIds:[selected[0].sectionId],glossary:[]},output:{schemaVersion:'cv-translation/1',sourceLocale:'ro-RO',targetLocale:'en-GB',completion:'complete',items:selected.map(i=>({id:i.id,fieldId:i.fieldId,text:'Translated: '+i.text,factIds:i.factIds,evidenceIds:i.evidenceIds})),warnings:[],ambiguousTerms:[],suggestedGlossary:[]}};
 const client={review:vi.fn(async(_id:string,_rev:number,review:NonNullable<LanguageProposal['review']>)=>({...proposal,reviewRevision:1,review})),accept:vi.fn(async()=>({kind:'base' as const,id:'target',revision:1})),cancel:vi.fn(async()=>proposal),start:vi.fn(async(_input:Parameters<LanguageClient["start"]>[0])=>proposal),advance:vi.fn(async()=>proposal)};
 return{context,proposal,client,save:vi.fn(),cancel:vi.fn()};
}
it('manual section edits use no inference and survive section confirmation into complete preview and explicit save',async()=>{
 const f=await fixture();render(<TranslationReview {...f}/>);
 const box=screen.getAllByRole('textbox')[0];fireEvent.change(box,{target:{value:'Manual: '+f.proposal.output!.items[0].text}});
 expect(f.client.start).not.toHaveBeenCalled();expect(f.client.review).not.toHaveBeenCalled();
 await waitFor(()=>expect((screen.getByRole('button',{name:'Confirmă și continuă'}) as HTMLButtonElement).disabled).toBe(false));
 fireEvent.click(screen.getByRole('button',{name:'Confirmă și continuă'}));
 await screen.findByText('Previzualizare finală');expect(f.client.review.mock.calls[0][2].values[0].text).toContain('Manual:');expect(f.save).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Salvează CV în engleză'}));await waitFor(()=>expect(f.save).toHaveBeenCalled());expect(f.client.start).not.toHaveBeenCalled();
});
it('stale source rejection preserves manual wording and provides recovery instead of saving',async()=>{
 const f=await fixture();f.client.review.mockRejectedValue(new Error('staleSource'));render(<TranslationReview {...f}/>);
 const box=screen.getAllByRole('textbox')[0];const wording='Manual: '+f.proposal.output!.items[0].text;fireEvent.change(box,{target:{value:wording}});
 await waitFor(()=>expect((screen.getByRole('button',{name:'Confirmă și continuă'}) as HTMLButtonElement).disabled).toBe(false));fireEvent.click(screen.getByRole('button',{name:'Confirmă și continuă'}));
 expect((await screen.findByRole('alert')).textContent).toContain('Modificările tale rămân');expect((box as HTMLTextAreaElement).value).toBe(wording);expect(f.client.accept).not.toHaveBeenCalled();
});
it('regeneration is explicit and scoped, and keeping existing wording uses no AI',async()=>{
 const f=await fixture();render(<TranslationReview {...f} existing={f.context.draft}/>);
 fireEvent.click(screen.getByRole('button',{name:'Păstrează traducerea existentă'}));await waitFor(()=>expect((screen.getAllByRole('textbox')[0] as HTMLTextAreaElement).value).toBe(f.context.items[0].text));expect(f.client.start).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Regenerează secțiunea'}));await waitFor(()=>expect(f.client.start).toHaveBeenCalled());expect(f.client.start.mock.calls[0][0].sectionIds).toEqual(f.proposal.request.sectionIds);await waitFor(()=>expect(f.client.cancel).toHaveBeenCalledWith('proposal'));
});
